# Finance Planner — Calculation Reference

All logic lives in [`app/src/calculations.ts`](app/src/calculations.ts).

---

## 1. Frequency → Monthly Conversion

Every expense stores a **per-occurrence amount**. The monthly equivalent is:

| Frequency | Formula | Example |
|-----------|---------|---------|
| Weekly | `amount × 52 / 12` | $100/wk → $433.33/mo |
| **Bi-Weekly** | `amount × payPeriodsPerYear / 12` | $50 × 26/12 = $108.33/mo |
| Monthly | `amount` | $200/mo → $200.00/mo |
| Quarterly | `amount × 4 / 12` | $30/qtr → $10.00/mo |
| Bi-Annually | `amount / 6` | $600 → $100.00/mo |
| Annually | `amount / 12` | $1,200 → $100.00/mo |
| Every X Years | `amount / (12 × X)` | $600 / (12×5) → $10.00/mo |

> **Bi-weekly uses `× payPeriodsPerYear / 12`** (e.g. `× 26/12 ≈ 2.1667`).
> This is the accurate annualised rate. The pay period count comes from the
> Pay Frequency setting (default 26 for bi-weekly payroll).

---

## 2. Investment Per-Paycheck Conversion

Investments are stored as a **monthly amount**. The per-paycheck equivalent uses
the exact pay-period count rather than the ×2 shortcut:

```
perPaycheck = monthlyAmount × 12 / payPeriodsPerYear
```

For bi-weekly (26 pay periods): `$500/mo × 12 / 26 = $230.77/paycheck`

---

## 3. Monthly Income Waterfall

Starting from annual salary, each step deducts a category of outflows:

```
grossMonthly = annualSalary / 12

preTaxDeductions = SUM(investments where preTax=true AND employerMatch=false, monthly)

afterPreTax = grossMonthly − preTaxDeductions

withholdingMonthly = SUM(expenses where isWithholding=true, toMonthly())

afterWithholding = afterPreTax − withholdingMonthly

regularExpensesMonthly = SUM(expenses where isWithholding=false, toMonthly())

surplusMonthly = afterWithholding − regularExpensesMonthly
```

### What goes in each bucket

| Bucket | Contains |
|--------|----------|
| **Pre-Tax Deductions** | Investments flagged `preTax=true` and `employerMatch=false` (e.g. 401k, HSA) |
| **Withholding** | Expenses flagged `isWithholding=true` (federal, state, city, SS, Medicare) |
| **Regular Expenses** | Everything else — benefits, insurance, utilities, all variable spend |

> Employer-matched investments (`employerMatch=true`) are **not deducted** from
> the waterfall — they don't come out of your paycheck.

---

## 4. Per-Paycheck Income Waterfall

The per-paycheck column is an **independent calculation**, not a division of the
monthly column. The two views differ in how bi-weekly items are bucketed.

```
grossPerPaycheck = annualSalary / payPeriodsPerYear

preTaxPerPaycheck = preTaxDeductionsMonthly × 12 / payPeriodsPerYear

afterPreTaxPerPaycheck = grossPerPaycheck − preTaxPerPaycheck

withholdingPerPaycheck = SUM(expenses where frequency='bi-weekly', amount)
                       + SUM(expenses where isWithholding=true AND frequency≠'bi-weekly',
                             toMonthly() × 12 / payPeriodsPerYear)

afterWithholdingPerPaycheck = afterPreTaxPerPaycheck − withholdingPerPaycheck

regularExpensesPerPaycheck = regularExpensesMonthly × 12 / payPeriodsPerYear

surplusPerPaycheck = afterWithholdingPerPaycheck − regularExpensesPerPaycheck
```

### Why bi-weekly items use their raw amount here

On an actual paycheck stub, **every** payroll deduction appears as a line item —
taxes, benefits, and anything else deducted each pay period. So
`withholdingPerPaycheck` uses the stored per-occurrence amount directly for all
bi-weekly expenses (e.g. benefits at $50/paycheck), regardless of whether
they are flagged `isWithholding`.

This means benefits appears in **both** buckets across the two views:

| View | Benefits goes into |
|------|--------------------|
| Monthly | Regular expenses (×2.1667 = $108.33/mo) |
| Per-paycheck | Payroll withholding (raw $50.00) |

`regularExpensesPerPaycheck` is derived from `regularExpensesMonthly × 12/26`,
which includes the benefits monthly equivalent. This intentional overlap matches
real paycheck behaviour: you see benefits on your stub, and you also budget for
it monthly.

---

## 5. Monthly Surplus — Step by Step (example values)

| Step | Monthly | Per Paycheck |
|------|--------:|-------------:|
| Gross income | $10,000.00 | $4,615.38 |
| − Pre-tax contributions (401k) | −$500.00 | −$230.77 |
| = After pre-tax | $9,500.00 | $4,384.61 |
| − Tax withholding (Fed/SS/State/City/Medicare) | −$2,500.00 | −$1,250.00 |
| = Take-home | $7,000.00 | $3,134.61 |
| − All other expenses (benefits, insurance, utilities, variable) | −$3,000.00 | −$1,384.62 |
| **= Surplus** | **$4,000.00** | **$1,749.99** |

The two surplus figures are not direct conversions of each other
(`$4,000.00 × 12/26 = $1,846.15 ≠ $1,749.99`) because the monthly view uses
the bi-weekly ×2.1667 equivalent while the per-paycheck view uses raw amounts.

---

## 6. Expense Category Totals

| Total | Formula |
|-------|---------|
| Withholding / mo | `SUM(isWithholding=true, toMonthly())` |
| Regular / mo | `SUM(isWithholding=false, toMonthly())` |
| Necessities / mo | `SUM(isWithholding=false AND necessary=true, toMonthly())` |
| Discretionary / mo | `SUM(isWithholding=false AND necessary=false, toMonthly())` |
| Total investments / mo | `SUM(all investments, monthlyAmount)` including employer match |

---

## 7. Portfolio Projection

```
projectionYears = retirementAge − currentAge

FV = currentPortfolioValue × (1 + r)^n
   + monthlyContribution × ((1 + r)^n − 1) / r

where:
  r = annualReturnRate / 12   (monthly rate)
  n = projectionYears × 12   (months)
  monthlyContribution = investmentContributions + surplusMonthly

projectedMonthlyIncome = FV × withdrawalRate / 12
```

The surplus is clamped to 0 if negative (spending exceeds income).
