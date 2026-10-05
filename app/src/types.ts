export type Frequency =
  | 'weekly'
  | 'bi-weekly'
  | 'monthly'
  | 'quarterly'
  | 'bi-annually'
  | 'annually'
  | 'every-x-years'

export interface Expense {
  id: string
  name: string
  amount: number // per-occurrence amount
  frequency: Frequency
  frequencyYears?: number // only used when frequency === 'every-x-years'
  paymentDates: string[] // free-form: "14th", "Jan 26", "Jun 15, 2030"
  paymentMethod: string
  necessary: boolean
  isWithholding: boolean // tax withholding — separated in income waterfall
}

export interface Investment {
  id: string
  name: string
  monthlyAmount: number
  preTax: boolean
  employerMatch: boolean // does not deduct from your paycheck
}

export type HoldingCategory = 'Retirement' | 'Roth' | 'HSA' | 'Brokerage' | 'Cash' | 'Crypto' | 'Other'

export interface Holding {
  id: string
  name: string
  category: HoldingCategory
  currentValue: number
}

export interface AppState {
  expenses: Expense[]
  investments: Investment[]
  holdings: Holding[]
  annualSalary: number
  payPeriodsPerYear: number // 26 = bi-weekly
  paymentMethods: string[]
  annualReturnRate: number   // e.g. 0.07 for 7%
  age: number
  retirementAge: number
  withdrawalRate: number     // e.g. 0.04 for 4% rule
  surplusInvestedPct: number // 0–1, how much of surplus goes to portfolio
}

export interface IncomeCalc {
  grossMonthly: number
  grossPerPaycheck: number
  preTaxMonthly: number
  preTaxPerPaycheck: number
  afterPreTaxMonthly: number
  afterPreTaxPerPaycheck: number
  withholdingMonthly: number
  withholdingPerPaycheck: number
  afterWithholdingMonthly: number
  afterWithholdingPerPaycheck: number
  regularExpensesMonthly: number
  regularExpensesPerPaycheck: number
  surplusMonthly: number
  surplusPerPaycheck: number
  necessitiesMonthly: number
  unnecessaryMonthly: number
  totalInvestmentsMonthly: number
}

export interface ExpenseTotals {
  withholdingMonthly: number
  regularMonthly: number
  necessaryMonthly: number
  unnecessaryMonthly: number
  totalMonthly: number
}

export interface ProjectionCalc {
  totalCurrentValue: number
  projectedValue: number
  projectedMonthlyIncome: number
  byCategory: Partial<Record<HoldingCategory, number>>
}
