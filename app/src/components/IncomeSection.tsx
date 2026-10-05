import type { IncomeCalc } from '../types'
import { fmt } from '../calculations'

interface Props {
  calc: IncomeCalc
  payPeriodsPerYear: number
}

interface WaterfallRowProps {
  label: string
  monthly: number
  perPaycheck: number
  isDeduction?: boolean
  isResult?: boolean
  isSurplus?: boolean
  note?: string
}

function WaterfallRow({ label, monthly, perPaycheck, isDeduction, isResult, isSurplus, note }: WaterfallRowProps) {
  const cls = isSurplus ? 'wf-row surplus' : isResult ? 'wf-row result' : isDeduction ? 'wf-row deduction' : 'wf-row'
  return (
    <tr className={cls}>
      <td className="wf-label">
        {label}
        {note && <span className="wf-note">{note}</span>}
      </td>
      <td className="wf-monthly">
        <span className={isDeduction ? 'neg' : ''}>{isDeduction ? '−' : ''}{fmt(Math.abs(monthly))}</span>
      </td>
      <td className="wf-paycheck">
        <span className={isDeduction ? 'neg' : ''}>{isDeduction ? '−' : ''}{fmt(Math.abs(perPaycheck))}</span>
      </td>
    </tr>
  )
}

export default function IncomeSection({ calc, payPeriodsPerYear }: Props) {
  return (
    <div className="section">
      <div className="section-header">
        <h2>Income &amp; Summary</h2>
      </div>

      <div className="table-wrap">
        <table className="waterfall-table">
          <thead>
            <tr>
              <th className="wf-label-head"></th>
              <th className="wf-monthly">Monthly</th>
              <th className="wf-paycheck">Per Paycheck ({payPeriodsPerYear}/yr)</th>
            </tr>
          </thead>
          <tbody>
            <WaterfallRow
              label="Gross Income"
              monthly={calc.grossMonthly}
              perPaycheck={calc.grossPerPaycheck}
              isResult
            />
            <WaterfallRow
              label="Pre-Tax Contributions"
              monthly={calc.preTaxMonthly}
              perPaycheck={calc.preTaxPerPaycheck}
              isDeduction
              note="401k and other pre-tax investments"
            />
            <WaterfallRow
              label="After Pre-Tax"
              monthly={calc.afterPreTaxMonthly}
              perPaycheck={calc.afterPreTaxPerPaycheck}
              isResult
            />
            <WaterfallRow
              label="Tax Withholding"
              monthly={calc.withholdingMonthly}
              perPaycheck={calc.withholdingPerPaycheck}
              isDeduction
              note="Federal, state, city, SS, Medicare"
            />
            <WaterfallRow
              label="After Withholding (Take-Home)"
              monthly={calc.afterWithholdingMonthly}
              perPaycheck={calc.afterWithholdingPerPaycheck}
              isResult
            />
            <WaterfallRow
              label="Regular Expenses"
              monthly={calc.regularExpensesMonthly}
              perPaycheck={calc.regularExpensesPerPaycheck}
              isDeduction
              note="All non-withholding expenses"
            />
            <WaterfallRow
              label="Surplus"
              monthly={calc.surplusMonthly}
              perPaycheck={calc.surplusPerPaycheck}
              isSurplus
            />
          </tbody>
        </table>
      </div>

      <div className="summary-cards">
        <div className="summary-card surplus-card">
          <div className="card-label">Monthly Surplus</div>
          <div className="card-value">{fmt(calc.surplusMonthly)}</div>
          <div className="card-sub">{fmt(calc.surplusPerPaycheck)} / paycheck</div>
        </div>
        <div className="summary-card">
          <div className="card-label">Necessities / mo</div>
          <div className="card-value">{fmt(calc.necessitiesMonthly)}</div>
        </div>
        <div className="summary-card">
          <div className="card-label">Discretionary / mo</div>
          <div className="card-value">{fmt(calc.unnecessaryMonthly)}</div>
        </div>
        <div className="summary-card">
          <div className="card-label">Total Invested / mo</div>
          <div className="card-value">{fmt(calc.totalInvestmentsMonthly)}</div>
          <div className="card-sub">incl. employer match</div>
        </div>
        <div className="summary-card">
          <div className="card-label">Annual Expenses</div>
          <div className="card-value">
            {fmt((calc.regularExpensesMonthly + calc.withholdingMonthly) * 12)}
          </div>
          <div className="card-sub">{fmt(calc.withholdingMonthly * 12)} withholding</div>
        </div>
      </div>

      <div className="breakdown-grid">
        <div className="breakdown-card">
          <h3>Monthly Breakdown</h3>
          <div className="breakdown-row">
            <span>Gross</span>
            <span>{fmt(calc.grossMonthly)}</span>
          </div>
          <div className="breakdown-row deduction">
            <span>Pre-Tax Investments</span>
            <span>−{fmt(calc.preTaxMonthly)}</span>
          </div>
          <div className="breakdown-row deduction">
            <span>Tax Withholding</span>
            <span>−{fmt(calc.withholdingMonthly)}</span>
          </div>
          <div className="breakdown-row deduction">
            <span>Regular Expenses</span>
            <span>−{fmt(calc.regularExpensesMonthly)}</span>
          </div>
          <div className="breakdown-row total">
            <span>Surplus</span>
            <span>{fmt(calc.surplusMonthly)}</span>
          </div>
        </div>

        <div className="breakdown-card">
          <h3>Per-Paycheck Breakdown</h3>
          <div className="breakdown-row">
            <span>Gross</span>
            <span>{fmt(calc.grossPerPaycheck)}</span>
          </div>
          <div className="breakdown-row deduction">
            <span>Pre-Tax Investments</span>
            <span>−{fmt(calc.preTaxPerPaycheck)}</span>
          </div>
          <div className="breakdown-row deduction">
            <span>All Payroll Deductions</span>
            <span>−{fmt(calc.withholdingPerPaycheck)}</span>
          </div>
          <div className="breakdown-row deduction">
            <span>Regular Expenses</span>
            <span>−{fmt(calc.regularExpensesPerPaycheck)}</span>
          </div>
          <div className="breakdown-row total">
            <span>Surplus</span>
            <span>{fmt(calc.surplusPerPaycheck)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
