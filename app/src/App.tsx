import { useState, useEffect, useRef } from 'react'
import type { AppState } from './types'
import { calculateIncome, fmt } from './calculations'
import ExpensesSection from './components/ExpensesSection'
import InvestmentsSection from './components/InvestmentsSection'
import PortfolioSection from './components/PortfolioSection'
import IncomeSection from './components/IncomeSection'
import BudgetingSection from './components/BudgetingSection'
import './App.css'

const EMPTY_STATE: AppState = {
  annualSalary: 0,
  payPeriodsPerYear: 26,
  paymentMethods: [],
  investments: [],
  expenses: [],
  holdings: [],
  transactions: [],
  annualReturnRate: 0.07,
  age: 0,
  retirementAge: 65,
  withdrawalRate: 0.04,
  surplusInvestedPct: 1,
}

const PAY_PERIODS = [
  { value: 52, label: 'Weekly (52/yr)' },
  { value: 26, label: 'Bi-Weekly (26/yr)' },
  { value: 24, label: 'Semi-Monthly (24/yr)' },
  { value: 12, label: 'Monthly (12/yr)' },
]

type SaveStatus = 'saved' | 'saving' | 'error'
type Tab = 'expenses' | 'investments' | 'income' | 'budgeting' | 'portfolio'

async function fetchState(): Promise<AppState> {
  const res = await fetch('/api/state')
  if (!res.ok) throw new Error('fetch failed')
  const data = await res.json()
  return data ?? EMPTY_STATE
}

async function fetchDataPath(): Promise<string> {
  const res = await fetch('/api/config')
  if (!res.ok) return ''
  const { dataPath } = await res.json()
  return dataPath ?? ''
}

async function persistState(state: AppState): Promise<void> {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
  if (!res.ok) throw new Error('save failed')
}

export default function App() {
  const [state, setState]           = useState<AppState | null>(null)
  const [tab, setTab]               = useState<Tab>('expenses')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [theme, setTheme]           = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [dataPath, setDataPath]         = useState('')
  const [pathDraft, setPathDraft]       = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [pathError, setPathError]       = useState('')
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const importRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    fetchDataPath().then(p => { setDataPath(p); setPathDraft(p) })
    fetchState()
      .then(s => setState({ ...EMPTY_STATE, ...s }))
      .catch(err => {
        console.error(err)
        setPathError('Could not load data file — check the path in ⚙ Settings')
        setShowSettings(true)
        // Do NOT setState here — setting state triggers autosave which would
        // overwrite the data file with empty state.
      })
  }, [])

  useEffect(() => {
    if (!state) return
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      persistState(state)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'))
    }, 600)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [state])

  function update(patch: Partial<AppState>) {
    setState(s => s ? { ...s, ...patch } : s)
  }

  function clearAll() {
    if (confirm('Clear all data and start fresh?')) setState(EMPTY_STATE)
  }

  async function saveDataPath() {
    setPathError('')
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPath: pathDraft.trim() }),
      })
      const body = await res.json()
      if (!res.ok) { setPathError(body.error ?? 'Failed to save path'); return }
      setDataPath(body.dataPath)
      setShowSettings(false)
      fetchState()
        .then(s => setState({ ...EMPTY_STATE, ...s }))
        .catch(() => setState(EMPTY_STATE))
    } catch {
      setPathError('Could not reach server')
    }
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target?.result as string)
        if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid JSON')
        setState({ ...EMPTY_STATE, ...parsed })
      } catch {
        alert('Failed to import: file is not valid JSON.')
      } finally {
        // reset so the same file can be re-imported if needed
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  if (!state) {
    return (
      <div className="app loading-screen">
        <div className="loading-msg">Loading data…</div>
      </div>
    )
  }

  const calc = calculateIncome(state)
  const statusLabel: Record<SaveStatus, string> = { saved: 'Saved', saving: 'Saving…', error: 'Save failed' }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>Finance Planner</h1>
          {state.annualSalary > 0 && (
            <span className="surplus-badge">
              Surplus: <strong>{fmt(calc.surplusMonthly)}/mo</strong>
            </span>
          )}
        </div>
        <div className="header-right">
          <span className={`save-status ${saveStatus}`}>{statusLabel[saveStatus]}</span>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button
            className="btn-theme"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀' : '☽'}
          </button>
          <button className="btn-import" onClick={() => importRef.current?.click()}>
            Import JSON
          </button>
          <button className="btn-reset" onClick={clearAll}>Clear All Data</button>
          <button
            className="btn-theme"
            title="Data file location"
            onClick={() => { setPathDraft(dataPath); setPathError(''); setShowSettings(s => !s) }}
          >
            ⚙
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-bar">
          <label className="settings-label">Data file path</label>
          <input
            className="settings-path-input"
            value={pathDraft}
            onChange={e => setPathDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveDataPath(); if (e.key === 'Escape') setShowSettings(false) }}
            spellCheck={false}
            placeholder="/mnt/nas/finance-data.json"
          />
          {pathError && <span className="settings-error">{pathError}</span>}
          <button className="btn-save" onClick={saveDataPath}>Save</button>
          <button className="btn-cancel" onClick={() => setShowSettings(false)}>Cancel</button>
        </div>
      )}

      <nav className="tab-nav">
        <button className={`tab-btn ${tab === 'expenses'    ? 'active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
        <button className={`tab-btn ${tab === 'investments' ? 'active' : ''}`} onClick={() => setTab('investments')}>Contributions</button>
        <button className={`tab-btn ${tab === 'income'      ? 'active' : ''}`} onClick={() => setTab('income')}>Income &amp; Summary</button>
        <button className={`tab-btn ${tab === 'budgeting'   ? 'active' : ''}`} onClick={() => setTab('budgeting')}>Budgeting</button>
        <button className={`tab-btn ${tab === 'portfolio'   ? 'active' : ''}`} onClick={() => setTab('portfolio')}>Investments</button>
      </nav>

      <div className="income-strip">
        <label className="strip-field">
          <span className="strip-label">Annual Salary</span>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input
              type="number"
              className="salary-input"
              value={state.annualSalary || ''}
              onChange={e => update({ annualSalary: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              step="1000"
              min="0"
            />
          </div>
        </label>

        <label className="strip-field">
          <span className="strip-label">Pay Frequency</span>
          <select
            className="periods-select"
            value={state.payPeriodsPerYear}
            onChange={e => update({ payPeriodsPerYear: parseInt(e.target.value) })}
          >
            {PAY_PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        {state.annualSalary > 0 && (
          <div className="strip-derived">
            <span className="strip-derived-item">
              <span className="strip-label">Per Paycheck</span>
              <strong>{fmt(calc.grossPerPaycheck)}</strong>
            </span>
            <span className="strip-derived-item">
              <span className="strip-label">Per Month</span>
              <strong>{fmt(calc.grossMonthly)}</strong>
            </span>
          </div>
        )}
      </div>

      <main className="main-content">
        {tab === 'expenses' && (
          <ExpensesSection
            expenses={state.expenses}
            paymentMethods={state.paymentMethods}
            payPeriodsPerYear={state.payPeriodsPerYear}
            onChange={expenses => update({ expenses })}
            onMethodsChange={paymentMethods => update({ paymentMethods })}
          />
        )}
        {tab === 'investments' && (
          <InvestmentsSection
            investments={state.investments}
            payPeriodsPerYear={state.payPeriodsPerYear}
            onChange={investments => update({ investments })}
          />
        )}
        {tab === 'budgeting' && (
          <BudgetingSection
            transactions={state.transactions}
            expenses={state.expenses}
            payPeriodsPerYear={state.payPeriodsPerYear}
            onChange={transactions => update({ transactions })}
          />
        )}
        {tab === 'portfolio' && (
          <PortfolioSection
            holdings={state.holdings}
            annualReturnRate={state.annualReturnRate}
            age={state.age}
            retirementAge={state.retirementAge}
            withdrawalRate={state.withdrawalRate}
            monthlyContributions={calc.totalInvestmentsMonthly}
            monthlySurplus={calc.surplusMonthly}
            surplusInvestedPct={state.surplusInvestedPct}
            onChange={holdings => update({ holdings })}
            onSettingsChange={patch => update(patch)}
          />
        )}
        {tab === 'income' && (
          <IncomeSection
            calc={calc}
            payPeriodsPerYear={state.payPeriodsPerYear}
          />
        )}
      </main>
    </div>
  )
}
