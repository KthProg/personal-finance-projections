import { useState } from 'react'
import type { Holding, HoldingCategory } from '../types'
import { fmt, calculateProjection } from '../calculations'

const CATEGORIES: HoldingCategory[] = ['Retirement', 'Roth', 'HSA', 'Brokerage', 'Cash', 'Crypto', 'Other']

const CAT_CLASS: Record<HoldingCategory, string> = {
  Retirement: 'cat-retirement',
  Roth:       'cat-roth',
  HSA:        'cat-hsa',
  Brokerage:  'cat-brokerage',
  Cash:       'cat-cash',
  Crypto:     'cat-crypto',
  Other:      'cat-other',
}

interface Props {
  holdings: Holding[]
  annualReturnRate: number
  age: number
  retirementAge: number
  withdrawalRate: number
  surplusInvestedPct: number
  monthlyContributions: number
  monthlySurplus: number
  onChange: (holdings: Holding[]) => void
  onSettingsChange: (patch: { annualReturnRate?: number; age?: number; retirementAge?: number; withdrawalRate?: number; surplusInvestedPct?: number }) => void
}

const BLANK: Omit<Holding, 'id'> = { name: '', category: 'Brokerage', currentValue: 0 }

export default function PortfolioSection({
  holdings, annualReturnRate, age, retirementAge, withdrawalRate, surplusInvestedPct,
  monthlyContributions, monthlySurplus, onChange, onSettingsChange,
}: Props) {
  const projectionYears = Math.max(0, retirementAge - age)
  const surplusToInvest = Math.max(0, monthlySurplus) * surplusInvestedPct
  const monthlyContribution = monthlyContributions + surplusToInvest
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft]         = useState<Omit<Holding, 'id'>>(BLANK)
  const [isAdding, setIsAdding]   = useState(false)

  const proj = calculateProjection(holdings, monthlyContribution, annualReturnRate, projectionYears, withdrawalRate)

  function startAdd() { setDraft(BLANK); setIsAdding(true); setEditingId(null) }
  function startEdit(h: Holding) { setDraft({ ...h }); setIsAdding(false); setEditingId(h.id) }
  function cancel() { setEditingId(null); setIsAdding(false) }

  function save() {
    if (!draft.name.trim()) return
    if (editingId) {
      onChange(holdings.map(h => h.id === editingId ? { ...draft, id: editingId } : h))
    } else {
      onChange([...holdings, { ...draft, id: `holding-${Date.now()}` }])
    }
    setEditingId(null)
    setIsAdding(false)
  }

  function remove(id: string) { onChange(holdings.filter(h => h.id !== id)) }

  const formRow = (
    <tr className="form-row">
      <td>
        <input
          autoFocus
          className="full-input"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="Account / holding name"
          onKeyDown={e => e.key === 'Enter' && save()}
        />
      </td>
      <td>
        <select
          value={draft.category}
          onChange={e => setDraft(d => ({ ...d, category: e.target.value as HoldingCategory }))}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td>
        <div className="input-prefix-wrap">
          <span className="input-prefix">$</span>
          <input
            type="number"
            className="num-input"
            style={{ width: '130px' }}
            value={draft.currentValue || ''}
            onChange={e => setDraft(d => ({ ...d, currentValue: parseFloat(e.target.value) || 0 }))}
            placeholder="Value"
            step="100"
            min="0"
          />
        </div>
      </td>
      <td className="num-cell muted">—</td>
      <td className="actions-cell">
        <button className="btn-save" onClick={save}>Save</button>
        <button className="btn-cancel" onClick={cancel}>Cancel</button>
      </td>
    </tr>
  )

  return (
    <div className="section">
      <div className="section-header">
        <h2>Investments &amp; Portfolio</h2>
        <button className="btn-primary" onClick={startAdd}>+ Add Holding</button>
      </div>

      {/* Settings strip */}
      <div className="portfolio-settings">
        <label className="setting-field">
          <span className="strip-label">Annual Return</span>
          <div className="input-suffix-wrap">
            <input
              type="number"
              className="num-input setting-num"
              value={(annualReturnRate * 100).toFixed(1)}
              step="0.1"
              min="0"
              max="30"
              onChange={e => onSettingsChange({ annualReturnRate: (parseFloat(e.target.value) || 0) / 100 })}
            />
            <span className="input-suffix">%</span>
          </div>
        </label>
        <label className="setting-field">
          <span className="strip-label">Current Age</span>
          <input
            type="number"
            className="num-input setting-num"
            value={age || ''}
            step="1"
            min="0"
            max="100"
            placeholder="—"
            onChange={e => onSettingsChange({ age: parseInt(e.target.value) || 0 })}
          />
        </label>
        <label className="setting-field">
          <span className="strip-label">Retirement Age</span>
          <input
            type="number"
            className="num-input setting-num"
            value={retirementAge || ''}
            step="0.5"
            min="0"
            max="100"
            placeholder="65"
            onChange={e => onSettingsChange({ retirementAge: parseFloat(e.target.value) || 65 })}
          />
        </label>
        {projectionYears > 0 && (
          <span className="setting-derived">{projectionYears} yrs to retirement</span>
        )}
        <label className="setting-field">
          <span className="strip-label">Withdrawal Rate</span>
          <div className="input-suffix-wrap">
            <input
              type="number"
              className="num-input setting-num"
              value={(withdrawalRate * 100).toFixed(1)}
              step="0.1"
              min="0"
              max="10"
              onChange={e => onSettingsChange({ withdrawalRate: (parseFloat(e.target.value) || 0) / 100 })}
            />
            <span className="input-suffix">%</span>
          </div>
        </label>
        <label className="setting-field">
          <span className="strip-label">% Surplus Invested</span>
          <select
            value={surplusInvestedPct}
            onChange={e => onSettingsChange({ surplusInvestedPct: parseFloat(e.target.value) })}
          >
            {[0, 0.25, 0.5, 0.75, 1].map(p => (
              <option key={p} value={p}>{(p * 100).toFixed(0)}%</option>
            ))}
          </select>
        </label>

        <span className="setting-note">
          <strong>{fmt(monthlyContribution)}/mo</strong> to portfolio
          &nbsp;·&nbsp;{fmt(monthlyContributions)} contributions
          {surplusToInvest > 0 && <> + {fmt(surplusToInvest)} surplus</>}
          {monthlySurplus < 0 && <span style={{ color: 'var(--red)' }}> (deficit)</span>}
        </span>
      </div>

      {/* Projection summary */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-label">Current Portfolio</div>
          <div className="card-value">{fmt(proj.totalCurrentValue)}</div>
          <div className="card-sub">{holdings.length} holding{holdings.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="summary-card surplus-card">
          <div className="card-label">Projected in {projectionYears} yrs @ {(annualReturnRate * 100).toFixed(1)}%</div>
          <div className="card-value">{fmt(proj.projectedValue)}</div>
          <div className="card-sub">w/ {fmt(monthlyContribution)}/mo contributions</div>
        </div>
        <div className="summary-card">
          <div className="card-label">Monthly Income ({(withdrawalRate * 100).toFixed(1)}% rule)</div>
          <div className="card-value">{fmt(proj.projectedMonthlyIncome)}</div>
          <div className="card-sub">{fmt(proj.projectedMonthlyIncome * 12)}/yr</div>
        </div>
        <div className="summary-card">
          <div className="card-label">Growth</div>
          <div className="card-value">
            {proj.totalCurrentValue > 0
              ? `${((proj.projectedValue / proj.totalCurrentValue - 1) * 100).toFixed(0)}%`
              : '—'}
          </div>
          <div className="card-sub">
            +{fmt(proj.projectedValue - proj.totalCurrentValue)}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {Object.keys(proj.byCategory).length > 0 && (
        <div className="category-grid">
          {CATEGORIES.filter(c => proj.byCategory[c]).map(cat => {
            const val = proj.byCategory[cat]!
            const pct = proj.totalCurrentValue > 0 ? (val / proj.totalCurrentValue * 100).toFixed(1) : '0.0'
            return (
              <div key={cat} className={`category-card ${CAT_CLASS[cat]}`}>
                <span className={`cat-badge ${CAT_CLASS[cat]}`}>
                  {cat}
                </span>
                <div className="category-value">{fmt(val)}</div>
                <div className="category-pct">{pct}%</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Holdings table */}
      <div className="table-wrap">
        <table className="expenses-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Current Value</th>
              <th className="num-cell">% of Portfolio</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isAdding && formRow}
            {holdings.map(h => (
              editingId === h.id
                ? <tr key={h.id} className="form-row">{formRow.props.children}</tr>
                : (
                  <tr key={h.id}>
                    <td>{h.name}</td>
                    <td>
                      <span className={`cat-badge ${CAT_CLASS[h.category]}`}>
                        {h.category}
                      </span>
                    </td>
                    <td className="num-cell">{fmt(h.currentValue)}</td>
                    <td className="num-cell muted">
                      {proj.totalCurrentValue > 0
                        ? `${(h.currentValue / proj.totalCurrentValue * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="actions-cell">
                      <button className="btn-edit" onClick={() => startEdit(h)}>Edit</button>
                      <button className="btn-del" onClick={() => remove(h.id)}>×</button>
                    </td>
                  </tr>
                )
            ))}
          </tbody>
          {holdings.length > 0 && (
            <tfoot>
              <tr className="totals-foot">
                <td colSpan={2}><strong>Total</strong></td>
                <td className="num-cell"><strong>{fmt(proj.totalCurrentValue)}</strong></td>
                <td className="num-cell muted"><strong>100%</strong></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
