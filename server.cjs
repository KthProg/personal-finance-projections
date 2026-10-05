const express = require('express')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json({ limit: '10mb' }))

const CONFIG_FILE = path.join(__dirname, 'config.json')
const DEFAULT_DATA_FILE = path.join(__dirname, 'finance-data.json')

const EMPTY_STATE = {
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

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
}

function getDataFile() {
  return loadConfig().dataPath || DEFAULT_DATA_FILE
}

function ensureDataFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(EMPTY_STATE, null, 2))
    console.log(`Created new data file → ${filePath}`)
  }
}

// If the configured path is inaccessible (e.g. NAS not mounted), fall back to
// the default local file rather than crashing on startup.
try {
  ensureDataFile(getDataFile())
} catch (err) {
  console.warn(`Warning: configured data path unavailable (${err.message}), falling back to default`)
  try {
    ensureDataFile(DEFAULT_DATA_FILE)
  } catch (err2) {
    console.error(`Failed to initialise default data file: ${err2.message}`)
  }
}

app.get('/api/config', (_req, res) => {
  res.json({ dataPath: getDataFile() })
})

app.post('/api/config', (req, res) => {
  const { dataPath } = req.body
  if (!dataPath || typeof dataPath !== 'string') {
    return res.status(400).json({ error: 'dataPath required' })
  }
  try {
    ensureDataFile(dataPath)
    saveConfig({ ...loadConfig(), dataPath })
    console.log(`Data file → ${dataPath}`)
    res.json({ ok: true, dataPath })
  } catch (err) {
    res.status(500).json({ error: `Cannot access path: ${err.message}` })
  }
})

app.get('/api/state', (_req, res) => {
  const filePath = getDataFile()
  try {
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
  } catch (err) {
    console.error(`Read failed (${filePath}): ${err.message}`)
    res.status(500).json({ error: `Cannot read data file: ${err.message}` })
  }
})

app.post('/api/state', (req, res) => {
  const filePath = getDataFile()
  try {
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2))
    res.json({ ok: true })
  } catch (err) {
    console.error(`Write failed (${filePath}): ${err.message}`)
    res.status(500).json({ error: `Cannot write data file: ${err.message}` })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Finance server → http://localhost:${PORT}`)
  console.log(`Data file     → ${getDataFile()}`)
})
