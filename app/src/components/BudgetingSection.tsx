import { useRef, useState } from 'react'
import type { Transaction, Expense } from '../types'
import { EXPENSE_CATEGORIES } from '../constants'

import { toMonthly, fmt } from '../calculations'

interface Props {
  transactions: Transaction[]
  expenses: Expense[]
  payPeriodsPerYear: number
  onChange: (transactions: Transaction[]) => void
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

function decodeHTML(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

function hashId(date: string, description: string, amount: number): string {
  const raw = `${date}|${description}|${amount}`
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = Math.imul(31, h) + raw.charCodeAt(i) | 0
  }
  return `tx-${(h >>> 0).toString(36)}`
}

function parseChaseCSV(text: string): Transaction[] {
  const lines = text.trim().split(/\r?\n/)
  const result: Transaction[] = []
  const seen = new Set<string>()
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 6) continue
    const [date, , description, category, type, amountStr] = cols
    const amount = parseFloat(amountStr)
    if (isNaN(amount)) continue
    const desc = decodeHTML(description.trim())
    const d    = date.trim()
    const id   = hashId(d, desc, amount)
    if (seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      date: d,
      description: desc,
      category: category.trim() || 'Uncategorized',
      type: type.trim(),
      amount,
    })
  }
  return result
}

// ── Exclusion rules ───────────────────────────────────────────────────────────

const EXCLUDE_PATTERNS: RegExp[] = [
  /e[\*\-]?trade/i,   // E*TRADE / ETrade transfers (investments)
  /lively/i,          // Lively HSA transfers (investments)
  /loan\s*pay/i,      // Loan payments
  /loan\s*pmt/i,
]

function isExcluded(t: Transaction): boolean {
  return EXCLUDE_PATTERNS.some(p => p.test(t.description))
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseMMDDYYYY(s: string): Date {
  const [m, d, y] = s.split('/')
  return new Date(+y, +m - 1, +d)
}

function fmtDate(s: string): string {
  return parseMMDDYYYY(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000) + 1
}

// ── Component ─────────────────────────────────────────────────────────────────

type SortField = 'date' | 'amount' | 'category' | 'description'
type SortDir   = 'asc' | 'desc'

export default function BudgetingSection({ transactions, expenses, payPeriodsPerYear, onChange }: Props) {
  const csvRef = useRef<HTMLInputElement>(null)
  const [sort, setSort]         = useState<{ field: SortField; dir: SortDir }>({ field: 'date', dir: 'desc' })
  const [catFilter, setCatFilter] = useState<string>('all')
  const [page, setPage]           = useState(0)
  const PAGE_SIZE = 25

  const purchases = transactions.filter(t => t.type !== 'Payment' && !isExcluded(t))

  function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const readFile = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = evt => resolve(evt.target?.result as string)
        reader.onerror = reject
        reader.readAsText(file)
      })

    Promise.all(files.map(readFile))
      .then(texts => {
        const existingIds = new Set(transactions.map(t => t.id))
        const incoming: typeof transactions = []
        for (const text of texts) {
          for (const t of parseChaseCSV(text)) {
            if (!existingIds.has(t.id) && !incoming.some(x => x.id === t.id)) {
              incoming.push(t)
              existingIds.add(t.id)
            }
          }
        }
        onChange([...transactions, ...incoming])
      })
      .catch(() => alert('Failed to parse one or more CSVs — make sure they are Chase activity exports.'))
      .finally(() => { e.target.value = '' })
  }

  // ── Date range ──────────────────────────────────────────────────────────────
  const dates   = purchases.map(t => parseMMDDYYYY(t.date))
  const minDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
  const maxDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
  const periodDays = minDate && maxDate ? daysBetween(minDate, maxDate) : 0

  // ── Actual spending by Chase category ───────────────────────────────────────
  const actualByCategory: Record<string, { total: number; count: number }> = {}
  for (const t of purchases) {
    const key = t.category
    if (!actualByCategory[key]) actualByCategory[key] = { total: 0, count: 0 }
    actualByCategory[key].total += -t.amount  // negate: sales are negative in CSV
    actualByCategory[key].count++
  }
  const totalActual = Object.values(actualByCategory).reduce((s, v) => s + v.total, 0)

  // ── Budgeted by Chase category (prorated) ───────────────────────────────────
  const ppp = payPeriodsPerYear
  const regularExpenses = expenses.filter(e => !e.isWithholding)
  const monthlyBudget   = regularExpenses.reduce((s, e) => s + toMonthly(e, ppp), 0)
  const proratedBudget  = monthlyBudget * (periodDays / 30)

  // Group budget expenses by their Chase category
  const budgetByCategory: Record<string, { monthly: number; expenses: Expense[] }> = {}
  for (const e of regularExpenses) {
    const key = e.expenseCategory || ''
    if (!budgetByCategory[key]) budgetByCategory[key] = { monthly: 0, expenses: [] }
    budgetByCategory[key].monthly += toMonthly(e, ppp)
    budgetByCategory[key].expenses.push(e)
  }

  // Build merged rows: all Chase categories that appear in either actual or budget
  const knownCategories = new Set<string>([
    ...EXPENSE_CATEGORIES,
    ...Object.keys(actualByCategory),
  ])
  const comparisonRows = Array.from(knownCategories)
    .map(cat => {
      const actual   = actualByCategory[cat]?.total ?? 0
      const budget   = (budgetByCategory[cat]?.monthly ?? 0) * (periodDays / 30)
      const txCount  = actualByCategory[cat]?.count ?? 0
      const expNames = budgetByCategory[cat]?.expenses.map(e => e.name) ?? []
      return { cat, actual, budget, diff: actual - budget, txCount, expNames }
    })
    .filter(r => r.actual > 0 || r.budget > 0)
    .sort((a, b) => b.actual - a.actual)

  // Unassigned budget expenses (no expenseCategory set)
  const unassignedExpenses = budgetByCategory['']?.expenses ?? []
  const unassignedMonthly  = budgetByCategory['']?.monthly ?? 0

  // ── Transaction list ─────────────────────────────────────────────────────────
  const allCategories = ['all', ...Object.keys(actualByCategory).sort()]
  const sorted = (catFilter === 'all' ? purchases : purchases.filter(t => t.category === catFilter))
    .slice()
    .sort((a, b) => {
      let cmp = 0
      if (sort.field === 'date')        cmp = parseMMDDYYYY(a.date).getTime() - parseMMDDYYYY(b.date).getTime()
      else if (sort.field === 'amount') cmp = a.amount - b.amount
      else if (sort.field === 'category') cmp = a.category.localeCompare(b.category)
      else                              cmp = a.description.localeCompare(b.description)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(0, totalPages - 1))
  const visible    = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  function toggleSort(field: SortField) {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' })
    setPage(0)
  }
  function sortIndicator(field: SortField) {
    return sort.field === field ? <span className="sort-indicator">{sort.dir === 'asc' ? '↑' : '↓'}</span> : null
  }

  const diff = totalActual - proratedBudget

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (transactions.length === 0) {
    return (
      <div className="section">
        <div className="section-header"><h2>Budgeting</h2></div>
        <div className="budget-empty">
          <div className="budget-empty-title">No transaction data yet</div>
          <div className="budget-empty-sub">
            Download your activity CSV from Chase and import it to compare actual spending against your budget.
            Tag your expenses with expense categories in the Expenses tab to enable direct comparison.
          </div>
          <input ref={csvRef} type="file" accept=".csv" multiple style={{ display: 'none' }} onChange={handleCSV} />
          <button className="btn-primary" onClick={() => csvRef.current?.click()}>Import CSV</button>
        </div>
      </div>
    )
  }

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h2>Budgeting</h2>
          {minDate && maxDate && (
            <div className="budget-coverage">
              {fmtDate(minDate.toLocaleDateString())} – {fmtDate(maxDate.toLocaleDateString())}
              {' · '}{purchases.length} transactions · {periodDays} days
            </div>
          )}
        </div>
        <div className="header-actions">
          <input ref={csvRef} type="file" accept=".csv" multiple style={{ display: 'none' }} onChange={handleCSV} />
          <button className="btn-secondary" onClick={() => csvRef.current?.click()}>Import CSV</button>
          <button className="btn-reset" onClick={() => { if (confirm('Clear all imported transactions?')) onChange([]) }}>Clear</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-label">Actual Spent ({periodDays}d)</div>
          <div className="card-value">{fmt(totalActual)}</div>
          <div className="card-sub">{purchases.length} transactions</div>
        </div>
        <div className="summary-card">
          <div className="card-label">Budget (prorated {periodDays}d)</div>
          <div className="card-value">{fmt(proratedBudget)}</div>
          <div className="card-sub">{fmt(monthlyBudget)}/mo × {periodDays}/30</div>
        </div>
        <div className={`summary-card ${diff > 0 ? 'over-card' : 'under-card'}`}>
          <div className="card-label">{diff > 0 ? 'Over budget' : 'Under budget'}</div>
          <div className="card-value">{fmt(Math.abs(diff))}</div>
          <div className="card-sub">{diff > 0 ? 'above' : 'below'} prorated budget</div>
        </div>
      </div>

      {/* Direct comparison table */}
      <div className="table-wrap">
        <table className="expenses-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num-cell">Actual ({periodDays}d)</th>
              <th className="num-cell">Budget (prorated)</th>
              <th className="num-cell">Difference</th>
              <th>Budget Expenses</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map(({ cat, actual, budget, diff: d, txCount, expNames }) => (
              <tr key={cat}>
                <td>
                  <span className="exp-cat-badge">{cat}</span>
                  {txCount > 0 && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{txCount} tx</span>}
                </td>
                <td className="num-cell">{actual > 0 ? fmt(actual) : <span className="muted">—</span>}</td>
                <td className="num-cell">{budget > 0 ? fmt(budget) : <span className="muted">—</span>}</td>
                <td className="num-cell">
                  {actual > 0 && budget > 0
                    ? <span className={d > 0 ? 'neg' : 'pos'}>{d > 0 ? '+' : ''}{fmt(d)}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="freq-cell">
                  {expNames.length > 0 ? expNames.join(', ') : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          {comparisonRows.length > 0 && (
            <tfoot>
              <tr className="totals-foot">
                <td><strong>Total</strong></td>
                <td className="num-cell"><strong>{fmt(totalActual)}</strong></td>
                <td className="num-cell"><strong>{fmt(proratedBudget)}</strong></td>
                <td className="num-cell">
                  <strong className={diff > 0 ? 'neg' : 'pos'}>{diff > 0 ? '+' : ''}{fmt(diff)}</strong>
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Unassigned budget expenses */}
      {unassignedExpenses.length > 0 && (
        <div className="breakdown-card">
          <h3>Budget expenses without a category ({fmt(unassignedMonthly * (periodDays / 30))} prorated)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {unassignedExpenses.map(e => (
              <span key={e.id} className="date-tag read-only">
                {e.name} · {fmt(toMonthly(e, ppp))}/mo
              </span>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Assign expense categories in the Expenses tab to include these in the comparison.
          </div>
        </div>
      )}

      {/* Transaction list */}
      <div className="breakdown-card">
        <div className="tx-list-header">
          <h3>Transactions</h3>
          <div className="filter-bar" style={{ margin: 0 }}>
            {allCategories.map(cat => (
              <button key={cat} className={`filter-btn ${catFilter === cat ? 'active' : ''}`} onClick={() => { setCatFilter(cat); setPage(0) }}>
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 12, border: 'none' }}>
          <table className="expenses-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('date')} style={{ cursor: 'pointer' }}>Date {sortIndicator('date')}</th>
                <th onClick={() => toggleSort('description')} style={{ cursor: 'pointer' }}>Description {sortIndicator('description')}</th>
                <th onClick={() => toggleSort('category')} style={{ cursor: 'pointer' }}>Category {sortIndicator('category')}</th>
                <th className="num-cell" onClick={() => toggleSort('amount')} style={{ cursor: 'pointer' }}>Amount {sortIndicator('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(t => {
                const spend = -t.amount
                return (
                  <tr key={t.id}>
                    <td className="freq-cell">{fmtDate(t.date)}</td>
                    <td>{t.description}</td>
                    <td className="freq-cell">{t.category}</td>
                    <td className="num-cell">
                      {spend < 0
                        ? <span className="pos">{fmt(Math.abs(spend))}</span>
                        : fmt(spend)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="tx-pagination">
            <button className="btn-page" disabled={safePage === 0} onClick={() => setPage(0)}>«</button>
            <button className="btn-page" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>‹</button>
            <span className="page-info">
              {safePage + 1} / {totalPages}
              <span className="muted" style={{ marginLeft: 6 }}>({sorted.length} transactions)</span>
            </span>
            <button className="btn-page" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="btn-page" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
          </div>
        )}
      </div>
    </div>
  )
}
