import { useState } from 'react'
import type { Investment } from '../types'
import { fmt } from '../calculations'

interface Props {
  investments: Investment[]
  payPeriodsPerYear: number
  onChange: (investments: Investment[]) => void
}

const BLANK: Omit<Investment, 'id'> = {
  name: '', monthlyAmount: 0, preTax: false, employerMatch: false,
}

export default function InvestmentsSection({ investments, payPeriodsPerYear, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft]         = useState<Omit<Investment, 'id'>>(BLANK)
  const [isAdding, setIsAdding]   = useState(false)

  const ppp = payPeriodsPerYear

  const totals = {
    all:     investments.reduce((s, i) => s + i.monthlyAmount, 0),
    preTax:  investments.filter(i => i.preTax && !i.employerMatch).reduce((s, i) => s + i.monthlyAmount, 0),
    postTax: investments.filter(i => !i.preTax && !i.employerMatch).reduce((s, i) => s + i.monthlyAmount, 0),
    match:   investments.filter(i => i.employerMatch).reduce((s, i) => s + i.monthlyAmount, 0),
  }

  function startAdd() {
    setDraft(BLANK)
    setIsAdding(true)
    setEditingId(null)
  }

  function startEdit(inv: Investment) {
    setDraft({ ...inv })
    setIsAdding(false)
    setEditingId(inv.id)
  }

  function cancel() {
    setEditingId(null)
    setIsAdding(false)
  }

  function save() {
    if (!draft.name.trim()) return
    if (editingId) {
      onChange(investments.map(i => i.id === editingId ? { ...draft, id: editingId } : i))
    } else {
      onChange([...investments, { ...draft, id: `inv-${Date.now()}` }])
    }
    setEditingId(null)
    setIsAdding(false)
  }

  function remove(id: string) {
    onChange(investments.filter(i => i.id !== id))
  }

  const formRow = (
    <tr className="form-row">
      <td>
        <input
          autoFocus
          className="full-input"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="Account name"
          onKeyDown={e => e.key === 'Enter' && save()}
        />
      </td>
      <td>
        <input
          type="number"
          className="num-input"
          value={draft.monthlyAmount || ''}
          onChange={e => setDraft(d => ({ ...d, monthlyAmount: parseFloat(e.target.value) || 0 }))}
          placeholder="Monthly"
          step="0.01"
          min="0"
        />
      </td>
      <td className="num-cell muted">
        {fmt(draft.monthlyAmount * 12 / ppp)}
      </td>
      <td className="center-cell">
        <input
          type="checkbox"
          checked={draft.preTax}
          onChange={e => setDraft(d => ({ ...d, preTax: e.target.checked }))}
          title="Pre-Tax"
          disabled={draft.employerMatch}
        />
      </td>
      <td className="center-cell">
        <input
          type="checkbox"
          checked={draft.employerMatch}
          onChange={e => setDraft(d => ({ ...d, employerMatch: e.target.checked, preTax: e.target.checked ? false : d.preTax }))}
          title="Employer Match"
        />
      </td>
      <td className="actions-cell">
        <button className="btn-save" onClick={save}>Save</button>
        <button className="btn-cancel" onClick={cancel}>Cancel</button>
      </td>
    </tr>
  )

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h2>Investment Contributions</h2>
          <div className="totals-row">
            <span className="total-chip all">Total {fmt(totals.all)}/mo</span>
            <span className="total-chip withholding">Pre-Tax {fmt(totals.preTax)}/mo</span>
            <span className="total-chip regular">Post-Tax {fmt(totals.postTax)}/mo</span>
            <span className="total-chip necessary">Employer Match {fmt(totals.match)}/mo</span>
          </div>
        </div>
        <button className="btn-primary" onClick={startAdd}>+ Add Account</button>
      </div>

      <div className="table-wrap">
        <table className="expenses-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Monthly</th>
              <th>Per Paycheck</th>
              <th title="Pre-Tax contribution">Pre-Tax</th>
              <th title="Employer Match (doesn't reduce your paycheck)">Employer Match</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isAdding && formRow}
            {investments.map(inv => (
              editingId === inv.id
                ? <tr key={inv.id} className="form-row">{formRow.props.children}</tr>
                : (
                  <tr key={inv.id} className={inv.employerMatch ? 'row-match' : ''}>
                    <td>{inv.name}</td>
                    <td className="num-cell">{fmt(inv.monthlyAmount)}</td>
                    <td className="num-cell muted">{fmt(inv.monthlyAmount * 12 / ppp)}</td>
                    <td className="center-cell">
                      {inv.preTax && !inv.employerMatch && <span className="badge-yes">✓</span>}
                    </td>
                    <td className="center-cell">
                      {inv.employerMatch && <span className="badge-match">Match</span>}
                    </td>
                    <td className="actions-cell">
                      <button className="btn-edit" onClick={() => startEdit(inv)}>Edit</button>
                      <button className="btn-del" onClick={() => remove(inv.id)}>×</button>
                    </td>
                  </tr>
                )
            ))}
          </tbody>
          <tfoot>
            <tr className="totals-foot">
              <td><strong>Total</strong></td>
              <td className="num-cell"><strong>{fmt(totals.all)}</strong></td>
              <td className="num-cell muted">
                <strong>{fmt(totals.all * 12 / ppp)}</strong>
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
