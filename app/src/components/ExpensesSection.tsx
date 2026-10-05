import { useState } from 'react'
import type { Expense, Frequency } from '../types'
import { toMonthly, frequencyLabel, fmt } from '../calculations'
import { calculateExpenseTotals } from '../calculations'
import { EXPENSE_CATEGORIES } from '../constants'

const FREQUENCIES: Frequency[] = [
  'weekly', 'bi-weekly', 'monthly', 'quarterly',
  'bi-annually', 'annually', 'every-x-years',
]

const FREQ_LABELS: Record<Frequency, string> = {
  'weekly':       'Weekly',
  'bi-weekly':    'Bi-Weekly',
  'monthly':      'Monthly',
  'quarterly':    'Quarterly (4×/yr)',
  'bi-annually':  'Bi-Annually (2×/yr)',
  'annually':     'Annually',
  'every-x-years':'Every X Years',
}

interface Props {
  expenses: Expense[]
  paymentMethods: string[]
  payPeriodsPerYear: number
  onChange: (expenses: Expense[]) => void
  onMethodsChange: (methods: string[]) => void
}

const BLANK_EXPENSE: Omit<Expense, 'id'> = {
  name: '', amount: 0, frequency: 'monthly', paymentDates: [],
  paymentMethod: '', necessary: true, isWithholding: false, expenseCategory: '',
}

export default function ExpensesSection({ expenses, paymentMethods, payPeriodsPerYear, onChange, onMethodsChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft]         = useState<Omit<Expense, 'id'>>(BLANK_EXPENSE)
  const [newDateText, setNewDateText] = useState('')
  const [isAdding, setIsAdding]       = useState(false)
  const [newMethod, setNewMethod]     = useState('')
  const [showMethodEditor, setShowMethodEditor] = useState(false)
  const [filterGroup, setFilterGroup] = useState<'all' | 'withholding' | 'regular' | 'necessary' | 'unnecessary'>('all')

  const totals = calculateExpenseTotals(expenses, payPeriodsPerYear)

  function startAdd() {
    setDraft(BLANK_EXPENSE)
    setNewDateText('')
    setIsAdding(true)
    setEditingId(null)
  }

  function startEdit(exp: Expense) {
    setDraft({ ...exp })
    setNewDateText('')
    setIsAdding(false)
    setEditingId(exp.id)
  }

  function cancelEdit() {
    setEditingId(null)
    setIsAdding(false)
  }

  function saveEdit() {
    if (!draft.name.trim()) return
    if (editingId) {
      onChange(expenses.map(e => e.id === editingId ? { ...draft, id: editingId } : e))
    } else {
      const id = `exp-${Date.now()}`
      onChange([...expenses, { ...draft, id }])
    }
    setEditingId(null)
    setIsAdding(false)
  }

  function remove(id: string) {
    onChange(expenses.filter(e => e.id !== id))
  }

  function addDate() {
    if (!newDateText.trim()) return
    setDraft(d => ({ ...d, paymentDates: [...d.paymentDates, newDateText.trim()] }))
    setNewDateText('')
  }

  function removeDate(i: number) {
    setDraft(d => ({ ...d, paymentDates: d.paymentDates.filter((_, idx) => idx !== i) }))
  }

  function addPaymentMethod() {
    const m = newMethod.trim()
    if (!m || paymentMethods.includes(m)) return
    onMethodsChange([...paymentMethods, m])
    setNewMethod('')
  }

  function removePaymentMethod(m: string) {
    onMethodsChange(paymentMethods.filter(pm => pm !== m))
  }

  const visible = expenses.filter(e => {
    if (filterGroup === 'withholding') return e.isWithholding
    if (filterGroup === 'regular')     return !e.isWithholding
    if (filterGroup === 'necessary')   return !e.isWithholding && e.necessary
    if (filterGroup === 'unnecessary') return !e.isWithholding && !e.necessary
    return true
  })

  const formRow = (
    <tr className="form-row">
      <td>
        <input
          autoFocus
          className="full-input"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="Expense name"
          onKeyDown={e => e.key === 'Enter' && saveEdit()}
        />
      </td>
      <td>
        <input
          type="number"
          className="num-input"
          value={draft.amount || ''}
          onChange={e => setDraft(d => ({ ...d, amount: parseFloat(e.target.value) || 0 }))}
          placeholder="Amount"
          step="0.01"
          min="0"
        />
      </td>
      <td>
        <select
          value={draft.frequency}
          onChange={e => setDraft(d => ({ ...d, frequency: e.target.value as Frequency }))}
        >
          {FREQUENCIES.map(f => (
            <option key={f} value={f}>{FREQ_LABELS[f]}</option>
          ))}
        </select>
        {draft.frequency === 'every-x-years' && (
          <input
            type="number"
            className="num-input"
            style={{ marginTop: '4px', width: '70px' }}
            value={draft.frequencyYears ?? 1}
            min={1}
            onChange={e => setDraft(d => ({ ...d, frequencyYears: parseInt(e.target.value) || 1 }))}
            placeholder="Years"
          />
        )}
      </td>
      <td className="monthly-cell">
        {fmt(toMonthly({ ...draft, id: '' }, payPeriodsPerYear))}
      </td>
      <td>
        <div className="date-list">
          {draft.paymentDates.map((d, i) => (
            <span key={i} className="date-tag">
              {d}
              <button className="tag-remove" onClick={() => removeDate(i)}>×</button>
            </span>
          ))}
          <div className="date-add-row">
            <input
              className="date-input"
              value={newDateText}
              onChange={e => setNewDateText(e.target.value)}
              placeholder="e.g. 14th, Jan 26"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDate() } }}
            />
            <button className="btn-mini" onClick={addDate}>+</button>
          </div>
        </div>
      </td>
      <td>
        <select
          value={draft.paymentMethod}
          onChange={e => setDraft(d => ({ ...d, paymentMethod: e.target.value }))}
        >
          <option value="">— none —</option>
          {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </td>
      <td>
        <select
          value={draft.expenseCategory ?? ''}
          onChange={e => setDraft(d => ({ ...d, expenseCategory: e.target.value }))}
        >
          <option value="">— none —</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="center-cell">
        <input
          type="checkbox"
          checked={draft.necessary}
          onChange={e => setDraft(d => ({ ...d, necessary: e.target.checked }))}
          title="Necessary"
        />
      </td>
      <td className="center-cell">
        <input
          type="checkbox"
          checked={draft.isWithholding}
          onChange={e => setDraft(d => ({ ...d, isWithholding: e.target.checked }))}
          title="Tax Withholding"
        />
      </td>
      <td className="actions-cell">
        <button className="btn-save" onClick={saveEdit}>Save</button>
        <button className="btn-cancel" onClick={cancelEdit}>Cancel</button>
      </td>
    </tr>
  )

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h2>Expenses</h2>
          <div className="totals-row">
            <span className="total-chip withholding">Withholding {fmt(totals.withholdingMonthly)}/mo</span>
            <span className="total-chip regular">Regular {fmt(totals.regularMonthly)}/mo</span>
            <span className="total-chip necessary">Necessities {fmt(totals.necessaryMonthly)}/mo</span>
            <span className="total-chip unnecessary">Discretionary {fmt(totals.unnecessaryMonthly)}/mo</span>
            <span className="total-chip all">Total {fmt(totals.totalMonthly)}/mo</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowMethodEditor(m => !m)}>
            Payment Methods
          </button>
          <button className="btn-primary" onClick={startAdd}>+ Add Expense</button>
        </div>
      </div>

      {showMethodEditor && (
        <div className="method-editor">
          <strong>Payment Methods</strong>
          <div className="method-list">
            {paymentMethods.map(m => (
              <span key={m} className="date-tag">
                {m}
                <button className="tag-remove" onClick={() => removePaymentMethod(m)}>×</button>
              </span>
            ))}
          </div>
          <div className="date-add-row">
            <input
              className="date-input"
              value={newMethod}
              onChange={e => setNewMethod(e.target.value)}
              placeholder="New method name"
              onKeyDown={e => e.key === 'Enter' && addPaymentMethod()}
            />
            <button className="btn-mini" onClick={addPaymentMethod}>Add</button>
          </div>
        </div>
      )}

      <div className="filter-bar">
        {(['all','withholding','regular','necessary','unnecessary'] as const).map(g => (
          <button
            key={g}
            className={`filter-btn ${filterGroup === g ? 'active' : ''}`}
            onClick={() => setFilterGroup(g)}
          >
            {g === 'all' ? 'All' : g === 'withholding' ? 'Withholding' : g === 'regular' ? 'Regular' : g === 'necessary' ? 'Necessary' : 'Discretionary'}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="expenses-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Amount</th>
              <th>Frequency</th>
              <th>Monthly</th>
              <th>Payment Dates</th>
              <th>Method</th>
              <th title="Expense Category">Category</th>
              <th title="Necessary">Nec.</th>
              <th title="Tax Withholding">W/H</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isAdding && formRow}
            {visible.map(exp => (
              editingId === exp.id
                ? <tr key={exp.id} className="form-row">{formRow.props.children}</tr>
                : (
                  <tr key={exp.id} className={exp.isWithholding ? 'row-withholding' : ''}>
                    <td>{exp.name}</td>
                    <td className="num-cell">
                      {fmt(exp.amount)}
                      {exp.frequency !== 'monthly' && (
                        <span className="freq-suffix"> / {frequencyLabel(exp)}</span>
                      )}
                    </td>
                    <td className="freq-cell">{frequencyLabel(exp)}</td>
                    <td className="monthly-cell">{fmt(toMonthly(exp, payPeriodsPerYear))}</td>
                    <td>
                      {exp.paymentDates.length > 0
                        ? exp.paymentDates.map((d, i) => (
                          <span key={i} className="date-tag read-only">{d}</span>
                        ))
                        : <span className="muted">—</span>}
                    </td>
                    <td className="muted">{exp.paymentMethod || '—'}</td>
                    <td>
                      {exp.expenseCategory
                        ? <span className="exp-cat-badge">{exp.expenseCategory}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td className="center-cell">
                      <span className={exp.necessary ? 'badge-yes' : 'badge-no'}>
                        {exp.necessary ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="center-cell">
                      {exp.isWithholding && <span className="badge-wh">W/H</span>}
                    </td>
                    <td className="actions-cell">
                      <button className="btn-edit" onClick={() => startEdit(exp)}>Edit</button>
                      <button className="btn-del" onClick={() => remove(exp.id)}>×</button>
                    </td>
                  </tr>
                )
            ))}
          </tbody>
          <tfoot>
            <tr className="totals-foot">
              <td colSpan={3}><strong>Monthly Total</strong></td>
              <td className="monthly-cell">
                <strong>{fmt(visible.reduce((s, e) => s + toMonthly(e, payPeriodsPerYear), 0))}</strong>
              </td>
              <td colSpan={6}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
