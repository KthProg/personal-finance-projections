const express = require('express')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json({ limit: '10mb' }))

const DATA_FILE = path.join(__dirname, 'finance-data.json')

const EMPTY_STATE = {
  annualSalary: 0,
  payPeriodsPerYear: 26,
  paymentMethods: [],
  investments: [],
  expenses: [],
  holdings: [],
  annualReturnRate: 0.07,
  age: 0,
  retirementAge: 65,
  withdrawalRate: 0.04,
  surplusInvestedPct: 1,
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_STATE, null, 2))
  console.log(`Created new data file → ${DATA_FILE}`)
}

app.get('/api/state', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')))
  } catch {
    res.status(500).json({ error: 'Read failed' })
  }
})

app.post('/api/state', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2))
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Write failed' })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Finance server → http://localhost:${PORT}`)
  console.log(`Data file     → ${DATA_FILE}`)
})
