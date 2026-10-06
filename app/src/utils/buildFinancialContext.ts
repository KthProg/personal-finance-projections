import type { AppState, IncomeCalc } from '../types'
import { fmt, calculateProjection } from '../calculations'

export function buildFinancialContext(state: AppState, calc: IncomeCalc): string {
  const {
    expenses, investments, holdings,
    annualSalary, payPeriodsPerYear,
    annualReturnRate, age, retirementAge, withdrawalRate, surplusInvestedPct,
  } = state

  const payLabel =
    payPeriodsPerYear === 52 ? 'weekly' :
    payPeriodsPerYear === 26 ? 'bi-weekly' :
    payPeriodsPerYear === 24 ? 'semi-monthly' : 'monthly'

  const yearsToRetirement = retirementAge - age
  const totalMonthlyContrib = investments.reduce((s, i) => s + i.monthlyAmount, 0)
  const investedSurplus = calc.surplusMonthly * surplusInvestedPct
  const totalMonthlyToPortfolio = totalMonthlyContrib + investedSurplus

  const projection = (holdings.length > 0 || totalMonthlyToPortfolio > 0) && yearsToRetirement > 0
    ? calculateProjection(holdings, totalMonthlyToPortfolio, annualReturnRate, yearsToRetirement, withdrawalRate)
    : null

  const lines: string[] = []

  lines.push('## Financial Snapshot')
  lines.push(`Annual Salary: ${fmt(annualSalary)}`)
  lines.push(`Pay Frequency: ${payLabel} (${payPeriodsPerYear}/yr)`)
  lines.push(`Age: ${age} | Retirement Target: ${retirementAge} (${yearsToRetirement} years away)`)
  lines.push('')

  lines.push('## Monthly Income Waterfall')
  lines.push(`  Gross:              ${fmt(calc.grossMonthly)}`)
  if (calc.preTaxMonthly > 0) {
    lines.push(`  Pre-tax deductions: -${fmt(calc.preTaxMonthly)}`)
    lines.push(`  After pre-tax:      ${fmt(calc.afterPreTaxMonthly)}`)
  }
  if (calc.withholdingMonthly > 0) {
    lines.push(`  Withholdings:       -${fmt(calc.withholdingMonthly)}`)
    lines.push(`  Take-home:          ${fmt(calc.afterWithholdingMonthly)}`)
  }
  if (calc.regularExpensesMonthly > 0) {
    lines.push(`  Regular expenses:   -${fmt(calc.regularExpensesMonthly)}`)
  }
  lines.push(`  Surplus:            ${fmt(calc.surplusMonthly)}/mo`)
  lines.push('')

  const withholdings = expenses.filter(e => e.isWithholding)
  if (withholdings.length > 0) {
    lines.push(`## Withholdings (${withholdings.length})`)
    for (const e of withholdings) {
      lines.push(`  ${e.name}: ${fmt(e.amount)} ${e.frequency}`)
    }
    lines.push('')
  }

  const regular = expenses.filter(e => !e.isWithholding)
  if (regular.length > 0) {
    lines.push(`## Recurring Expenses (${regular.length} items, ${fmt(calc.regularExpensesMonthly)}/mo total)`)
    lines.push(`  Necessary: ${fmt(calc.necessitiesMonthly)}/mo | Discretionary: ${fmt(calc.unnecessaryMonthly)}/mo`)
    const shown = regular.slice(0, 25)
    for (const e of shown) {
      const tag = e.necessary ? 'necessary' : 'discretionary'
      const cat = e.expenseCategory ? ` [${e.expenseCategory}]` : ''
      lines.push(`  ${e.name}: ${fmt(e.amount)} ${e.frequency} (${tag})${cat}`)
    }
    if (regular.length > 25) lines.push(`  ... and ${regular.length - 25} more`)
    lines.push('')
  }

  if (investments.length > 0) {
    lines.push(`## Investment Contributions (${fmt(totalMonthlyContrib)}/mo)`)
    for (const inv of investments) {
      const tags = [inv.preTax ? 'pre-tax' : 'post-tax', inv.employerMatch ? 'employer match (no paycheck deduction)' : 'from paycheck'].join(', ')
      lines.push(`  ${inv.name}: ${fmt(inv.monthlyAmount)}/mo [${tags}]`)
    }
    if (investedSurplus > 0) {
      lines.push(`  Surplus invested (${surplusInvestedPct * 100}%): ${fmt(investedSurplus)}/mo`)
    }
    lines.push(`  Total going to portfolio: ${fmt(totalMonthlyToPortfolio)}/mo`)
    lines.push('')
  }

  if (holdings.length > 0) {
    const total = holdings.reduce((s, h) => s + h.currentValue, 0)
    lines.push(`## Portfolio Holdings (Total: ${fmt(total)})`)
    for (const h of holdings) {
      const pct = total > 0 ? ((h.currentValue / total) * 100).toFixed(1) : '0'
      lines.push(`  ${h.name} (${h.category}): ${fmt(h.currentValue)} (${pct}%)`)
    }
    lines.push('')
  }

  if (projection) {
    lines.push('## Retirement Projection')
    lines.push(`  Assumed annual return: ${(annualReturnRate * 100).toFixed(1)}%`)
    lines.push(`  Withdrawal rate: ${(withdrawalRate * 100).toFixed(1)}%`)
    lines.push(`  Projected portfolio at age ${retirementAge}: ${fmt(projection.projectedValue)}`)
    lines.push(`  Projected monthly income at retirement: ${fmt(projection.projectedMonthlyIncome)}/mo`)
    lines.push('')
  }

  return lines.join('\n')
}
