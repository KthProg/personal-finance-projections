import type { Transaction, AmazonItem } from './types'

// ── Amazon order history import ───────────────────────────────────────────────
// Amazon charges the card once per shipment, not per order, so each card charge should equal the sum of
// Total Amount for the items of one order that shipped together. We group order lines by order + ship date
// and match groups to AMAZON card charges by exact amount and nearby date.

interface OrderLine extends AmazonItem {
  orderDate: Date
  shipDate: Date | null
}

interface Group {
  orderId: string
  date: Date          // ship date if known, else order date
  cents: number
  items: AmazonItem[]
}

export interface AmazonMatchResult {
  transactions: Transaction[]
  matched: number
  unmatched: number
  orderLines: number
}

// Full CSV parser: handles quoted fields, "" escapes and newlines inside quotes.
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim()))
}

function money(s: string | undefined): number {
  const n = parseFloat((s ?? '').replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

// Dates are ISO ("2025-03-01T12:34:56Z"); ship dates may be "X and Y" or "Not Available" — take the first.
function firstDate(s: string | undefined): Date | null {
  const m = (s ?? '').match(/\d{4}-\d{2}-\d{2}/)
  if (!m) return null
  const [y, mo, d] = m[0].split('-').map(Number)
  return new Date(y, mo - 1, d)
}

// Product names contain HTML entities like "&#xFF08;" and "&amp;".
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

export function parseAmazonOrders(text: string): OrderLine[] {
  const rows = parseCSV(text.replace(/^﻿/, ''))
  if (rows.length < 2) return []
  const header = rows[0].map(h => h.trim().toLowerCase())
  const col = (name: string) => header.findIndex(h => h.startsWith(name))
  const idx = {
    asin: col('asin'), dept: col('department'), orderDate: col('order date'), orderId: col('order id'),
    status: col('order status'), qty: col('original quantity'), name: col('product name'),
    shipDate: col('ship date'), total: col('total amount'), website: col('website'), currency: col('currency'),
  }
  if (idx.orderId < 0 || idx.name < 0 || idx.total < 0) throw new Error('Not an Amazon order history CSV')

  const lines: OrderLine[] = []
  for (const r of rows.slice(1)) {
    if (/cancel/i.test(r[idx.status] ?? '')) continue
    if (/wholefoods/i.test(r[idx.website] ?? '')) continue   // paid in store, not an Amazon card charge
    if (idx.currency >= 0 && r[idx.currency] && r[idx.currency].trim() !== 'USD') continue   // Amazon.ca / .co.uk orders
    const amount = money(r[idx.total])
    const orderDate = firstDate(r[idx.orderDate])
    if (amount <= 0 || !orderDate) continue
    lines.push({
      orderId:    r[idx.orderId].trim(),
      name:       decodeEntities(r[idx.name].replace(/\s+/g, ' ').trim()),
      department: dept(r[idx.dept]),
      asin:       (r[idx.asin] ?? '').trim(),
      quantity:   money(r[idx.qty]) || 1,
      amount,
      orderDate,
      shipDate:   firstDate(r[idx.shipDate]),
    })
  }
  return lines
}

const dept = (s: string | undefined) => {
  const d = (s ?? '').trim()
  return !d || /^not (available|applicable)$/i.test(d) ? 'Other' : d
}

const cents = (n: number) => Math.round(n * 100)
const toItem = ({ orderId, name, department, asin, quantity, amount }: OrderLine): AmazonItem =>
  ({ orderId, name, department, asin, quantity, amount })

function groupBy(lines: OrderLine[], key: (l: OrderLine) => string, date: (l: OrderLine) => Date): Group[] {
  const map = new Map<string, OrderLine[]>()
  for (const l of lines) map.set(key(l), [...(map.get(key(l)) ?? []), l])
  return Array.from(map.values()).map(ls => ({
    orderId: ls[0].orderId,
    date:    date(ls[0]),
    cents:   ls.reduce((s, l) => s + cents(l.amount), 0),
    items:   ls.map(toItem),
  }))
}

// Every subset of an order's lines (orders with ≤ 12 lines), for split shipments the ship dates don't explain.
function subsetGroups(lines: OrderLine[]): Group[] {
  const byOrder = new Map<string, OrderLine[]>()
  for (const l of lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l])
  const groups: Group[] = []
  for (const ls of byOrder.values()) {
    if (ls.length < 2 || ls.length > 12) continue
    for (let mask = 1; mask < (1 << ls.length) - 1; mask++) {
      const sub = ls.filter((_, i) => mask & (1 << i))
      groups.push({
        orderId: sub[0].orderId,
        date:    sub[0].shipDate ?? sub[0].orderDate,
        cents:   sub.reduce((s, l) => s + cents(l.amount), 0),
        items:   sub.map(toItem),
      })
    }
  }
  return groups
}

const AMAZON_RE = /amazon|amzn/i

function parseMMDDYYYY(s: string): Date {
  const [m, d, y] = s.split('/')
  return new Date(+y, +m - 1, +d)
}

export function matchAmazonOrders(transactions: Transaction[], lines: OrderLine[]): AmazonMatchResult {
  const charges = transactions.filter(t => AMAZON_RE.test(t.description) && t.amount < 0 && !t.amazonItems?.length)
  const assigned = new Map<string, AmazonItem[]>()
  const usedLines = new Set<string>()   // orderId|asin|amount|name — a line can only back one charge
  const lineKey = (i: AmazonItem) => `${i.orderId}|${i.asin}|${i.amount}|${i.name}`

  // Lines already attached to transactions from a previous import stay used.
  for (const t of transactions) for (const i of t.amazonItems ?? []) usedLines.add(lineKey(i))

  const passes: { groups: Group[]; before: number; after: number }[] = [
    // 1. Shipment (order + ship date): charge posts on or shortly after the ship date
    { groups: groupBy(lines, l => `${l.orderId}|${l.shipDate?.getTime() ?? 'none'}`, l => l.shipDate ?? l.orderDate), before: 3, after: 10 },
    // 2. Whole order, dated by order date
    { groups: groupBy(lines, l => l.orderId, l => l.orderDate), before: 3, after: 21 },
    // 3. Any subset of an order's lines
    { groups: subsetGroups(lines), before: 3, after: 21 },
  ]

  for (const { groups, before, after } of passes) {
    // Collect all candidate pairs, then assign greedily by closest date so ties resolve sensibly.
    const pairs: { tx: Transaction; g: Group; dist: number }[] = []
    const byCents = new Map<number, Group[]>()
    for (const g of groups) byCents.set(g.cents, [...(byCents.get(g.cents) ?? []), g])
    for (const tx of charges) {
      if (assigned.has(tx.id)) continue
      const txDate = parseMMDDYYYY(tx.date).getTime()
      for (const g of byCents.get(cents(-tx.amount)) ?? []) {
        const days = (txDate - g.date.getTime()) / 86_400_000
        if (days >= -before && days <= after) pairs.push({ tx, g, dist: Math.abs(days) })
      }
    }
    pairs.sort((a, b) => a.dist - b.dist)
    for (const { tx, g } of pairs) {
      if (assigned.has(tx.id) || g.items.some(i => usedLines.has(lineKey(i)))) continue
      assigned.set(tx.id, g.items)
      g.items.forEach(i => usedLines.add(lineKey(i)))
    }
  }

  return {
    transactions: transactions.map(t => assigned.has(t.id) ? { ...t, amazonItems: assigned.get(t.id) } : t),
    matched:   assigned.size,
    unmatched: charges.length - assigned.size,
    orderLines: lines.length,
  }
}
