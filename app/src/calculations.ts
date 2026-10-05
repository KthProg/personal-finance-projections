import type { Expense, AppState, IncomeCalc, ExpenseTotals, Holding, HoldingCategory, ProjectionCalc } from './types'

/**
 * Convert a per-occurrence expense amount to its monthly equivalent.
 * ppp = pay periods per year (default 26 for bi-weekly).
 *
 * Bi-weekly uses × ppp/12 for accuracy (e.g. 26/12 ≈ 2.1667).
 * Quarterly = 4 payments/year → ×4/12.
 */
export function toMonthly(expense: Expense, ppp = 26): number {
  const { amount, frequency, frequencyYears } = expense
  switch (frequency) {
    case 'weekly':        return amount * 52 / 12
    case 'bi-weekly':     return amount * ppp / 12
    case 'monthly':       return amount
    case 'quarterly':     return (amount * 4) / 12
    case 'bi-annually':   return amount / 6
    case 'annually':      return amount / 12
    case 'every-x-years': return amount / (12 * (frequencyYears ?? 1))
    default:              return amount
  }
}

export function frequencyLabel(expense: Expense): string {
  switch (expense.frequency) {
    case 'weekly':        return 'Weekly'
    case 'bi-weekly':     return 'Bi-Weekly'
    case 'monthly':       return 'Monthly'
    case 'quarterly':     return 'Quarterly'
    case 'bi-annually':   return 'Bi-Annually'
    case 'annually':      return 'Annually'
    case 'every-x-years': return `Every ${expense.frequencyYears ?? 1} yrs`
    default:              return ''
  }
}

/**
 * Calculate the full income waterfall.
 *
 * Monthly view:
 *   - isWithholding expenses → withholding bucket, converted via toMonthly(e, ppp)
 *   - everything else        → regular expense bucket
 *
 * Per-paycheck view:
 *   - ALL bi-weekly expenses → withheld from paycheck (per-occurrence amount)
 *   - non-bi-weekly withholding → withholding × (12/ppp)
 *
 * Bi-weekly items appear in both the monthly regular bucket and the
 * per-paycheck withholding stub — this is intentional and matches real
 * paycheck behaviour (see FORMULAS.md §4 for explanation).
 */
export function calculateIncome(state: AppState): IncomeCalc {
  const { annualSalary, payPeriodsPerYear, expenses, investments } = state
  const ppp = payPeriodsPerYear

  // ── Gross ─────────────────────────────────────────────────────────────────
  const grossMonthly     = annualSalary / 12
  const grossPerPaycheck = annualSalary / ppp

  // ── Pre-tax investments ───────────────────────────────────────────────────
  const preTaxInv = investments.filter(i => i.preTax && !i.employerMatch)
  const preTaxMonthly     = preTaxInv.reduce((s, i) => s + i.monthlyAmount, 0)
  const preTaxPerPaycheck = preTaxMonthly * 12 / ppp

  const afterPreTaxMonthly     = grossMonthly     - preTaxMonthly
  const afterPreTaxPerPaycheck = grossPerPaycheck - preTaxPerPaycheck

  // ── Withholding (monthly) ─────────────────────────────────────────────────
  const withholdingMonthly = expenses
    .filter(e => e.isWithholding)
    .reduce((s, e) => s + toMonthly(e, ppp), 0)

  // ── Withholding (per-paycheck) ────────────────────────────────────────────
  // All bi-weekly expenses use their raw per-occurrence amount (exact paycheck deduction).
  // Non-bi-weekly withholding items are scaled via 12/ppp.
  const withholdingPerPaycheck = expenses.reduce((s, e) => {
    if (e.frequency === 'bi-weekly') return s + e.amount
    if (e.isWithholding)            return s + toMonthly(e, ppp) * 12 / ppp
    return s
  }, 0)

  const afterWithholdingMonthly     = afterPreTaxMonthly     - withholdingMonthly
  const afterWithholdingPerPaycheck = afterPreTaxPerPaycheck - withholdingPerPaycheck

  // ── Regular expenses ──────────────────────────────────────────────────────
  const regularExpensesMonthly     = expenses
    .filter(e => !e.isWithholding)
    .reduce((s, e) => s + toMonthly(e, ppp), 0)

  const regularExpensesPerPaycheck = regularExpensesMonthly * 12 / ppp

  const surplusMonthly     = afterWithholdingMonthly     - regularExpensesMonthly
  const surplusPerPaycheck = afterWithholdingPerPaycheck - regularExpensesPerPaycheck

  // ── Extras ───────────────────────────────────────────────────────────────
  const necessitiesMonthly = expenses
    .filter(e => !e.isWithholding && e.necessary)
    .reduce((s, e) => s + toMonthly(e, ppp), 0)

  const unnecessaryMonthly = expenses
    .filter(e => !e.isWithholding && !e.necessary)
    .reduce((s, e) => s + toMonthly(e, ppp), 0)

  const totalInvestmentsMonthly = investments.reduce((s, i) => s + i.monthlyAmount, 0)

  return {
    grossMonthly,
    grossPerPaycheck,
    preTaxMonthly,
    preTaxPerPaycheck,
    afterPreTaxMonthly,
    afterPreTaxPerPaycheck,
    withholdingMonthly,
    withholdingPerPaycheck,
    afterWithholdingMonthly,
    afterWithholdingPerPaycheck,
    regularExpensesMonthly,
    regularExpensesPerPaycheck,
    surplusMonthly,
    surplusPerPaycheck,
    necessitiesMonthly,
    unnecessaryMonthly,
    totalInvestmentsMonthly,
  }
}

export function calculateExpenseTotals(expenses: Expense[], ppp = 26): ExpenseTotals {
  const withholdingMonthly = expenses
    .filter(e => e.isWithholding)
    .reduce((s, e) => s + toMonthly(e, ppp), 0)

  const regularMonthly = expenses
    .filter(e => !e.isWithholding)
    .reduce((s, e) => s + toMonthly(e, ppp), 0)

  const necessaryMonthly = expenses
    .filter(e => !e.isWithholding && e.necessary)
    .reduce((s, e) => s + toMonthly(e, ppp), 0)

  const unnecessaryMonthly = expenses
    .filter(e => !e.isWithholding && !e.necessary)
    .reduce((s, e) => s + toMonthly(e, ppp), 0)

  return {
    withholdingMonthly,
    regularMonthly,
    necessaryMonthly,
    unnecessaryMonthly,
    totalMonthly: withholdingMonthly + regularMonthly,
  }
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function calculateProjection(
  holdings: Holding[],
  monthlyContribution: number,
  annualReturnRate: number,
  projectionYears: number,
  withdrawalRate: number,
): ProjectionCalc {
  const totalCurrentValue = holdings.reduce((s, h) => s + h.currentValue, 0)
  const r = annualReturnRate / 12
  const n = projectionYears * 12
  const projectedValue = r === 0
    ? totalCurrentValue + monthlyContribution * n
    : totalCurrentValue * Math.pow(1 + r, n) + monthlyContribution * (Math.pow(1 + r, n) - 1) / r
  const projectedMonthlyIncome = (projectedValue * withdrawalRate) / 12

  const byCategory: Partial<Record<HoldingCategory, number>> = {}
  for (const h of holdings) {
    byCategory[h.category] = (byCategory[h.category] ?? 0) + h.currentValue
  }

  return { totalCurrentValue, projectedValue, projectedMonthlyIncome, byCategory }
}
