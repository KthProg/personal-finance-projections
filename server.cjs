const express = require('express')
const fs = require('fs')
const path = require('path')
const Anthropic = require('@anthropic-ai/sdk').default

const CLAUDE_MODEL = 'claude-sonnet-4-6'

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

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, data)
  const fd = fs.openSync(tmp, 'r+')
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  fs.renameSync(tmp, filePath)
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
  const cfg = loadConfig()
  res.json({ dataPath: getDataFile(), hasApiKey: !!cfg.anthropicApiKey })
})

app.post('/api/config', (req, res) => {
  const { dataPath, anthropicApiKey } = req.body
  const cfg = loadConfig()

  if (anthropicApiKey !== undefined) {
    if (typeof anthropicApiKey !== 'string') {
      return res.status(400).json({ error: 'anthropicApiKey must be a string' })
    }
    saveConfig({ ...cfg, anthropicApiKey: anthropicApiKey.trim() })
    if (!dataPath) return res.json({ ok: true, dataPath: getDataFile(), hasApiKey: !!anthropicApiKey.trim() })
  }

  if (!dataPath || typeof dataPath !== 'string') {
    return res.status(400).json({ error: 'dataPath required' })
  }
  try {
    ensureDataFile(dataPath)
    saveConfig({ ...loadConfig(), dataPath })
    console.log(`Data file → ${dataPath}`)
    res.json({ ok: true, dataPath, hasApiKey: !!loadConfig().anthropicApiKey })
  } catch (err) {
    res.status(500).json({ error: `Cannot access path: ${err.message}` })
  }
})

app.post('/api/chat', async (req, res) => {
  const cfg = loadConfig()
  if (!cfg.anthropicApiKey) {
    return res.status(400).json({ error: 'Claude API key not configured. Add it in Settings (⚙).' })
  }

  const { messages, financialContext } = req.body
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const client = new Anthropic({ apiKey: cfg.anthropicApiKey })
    const stream = client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: `You are a personal finance assistant. The user has shared their financial data with you. Be concise, accurate, and actionable. Use specific numbers from the user's data when relevant. Format numbers as currency where appropriate.

Here is the user's current financial data:

${financialContext || 'No financial data provided.'}`,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
      }
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('Claude API error:', err.message)
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message ?? 'AI request failed' })}\n\n`)
      res.end()
    } else {
      res.status(500).json({ error: err.message ?? 'AI request failed' })
    }
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
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, filePath + '.bak')
    }
    atomicWrite(filePath, JSON.stringify(req.body, null, 2))
    res.json({ ok: true })
  } catch (err) {
    console.error(`Write failed (${filePath}): ${err.message}`)
    res.status(500).json({ error: `Cannot write data file: ${err.message}` })
  }
})

module.exports = { app }

if (require.main === module) {
  const PORT = 3001
  app.listen(PORT, () => {
    console.log(`Finance server → http://localhost:${PORT}`)
    console.log(`Data file     → ${getDataFile()}`)
  })
}
