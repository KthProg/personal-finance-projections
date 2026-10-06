'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { app } = require('./server.cjs')

let server
let baseUrl

before(async () => {
  await new Promise((resolve) => {
    // Port 0 lets the OS assign a free port, avoiding conflicts with the
    // running dev server on 3001.
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`
      resolve()
    })
  })
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

// Reads an SSE streaming response to completion, returning the parsed JSON
// payloads from each `data:` line (excluding the [DONE] sentinel).
async function collectSseEvents(response) {
  const events = []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload === '[DONE]') { await reader.cancel(); return events }
      try { events.push(JSON.parse(payload)) } catch { /* partial chunk */ }
    }
  }
  return events
}

const cfg = (() => { try { return require('./config.json') } catch { return {} } })()
const hasApiKey = !!cfg.anthropicApiKey

// ---------------------------------------------------------------------------
// /api/config
// ---------------------------------------------------------------------------

describe('GET /api/config', () => {
  it('returns dataPath and hasApiKey with correct types', async () => {
    const res = await fetch(`${baseUrl}/api/config`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(typeof data.dataPath, 'string', 'dataPath should be a string')
    assert.ok(data.dataPath.length > 0, 'dataPath should be non-empty')
    assert.equal(typeof data.hasApiKey, 'boolean', 'hasApiKey should be a boolean')
    assert.equal(data.hasApiKey, hasApiKey, 'hasApiKey should reflect config.json')
  })
})

// ---------------------------------------------------------------------------
// /api/state
// ---------------------------------------------------------------------------

describe('GET /api/state', () => {
  it('returns a valid state object with required fields', async () => {
    const res = await fetch(`${baseUrl}/api/state`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(typeof data, 'object')
    assert.ok(data !== null)
    for (const field of ['expenses', 'investments', 'holdings', 'transactions', 'paymentMethods']) {
      assert.ok(Array.isArray(data[field]), `${field} should be an array`)
    }
    assert.equal(typeof data.annualSalary, 'number', 'annualSalary should be a number')
    assert.equal(typeof data.annualReturnRate, 'number', 'annualReturnRate should be a number')
  })
})

// ---------------------------------------------------------------------------
// /api/chat — input validation (no API key required)
// ---------------------------------------------------------------------------

describe('POST /api/chat — validation', () => {
  it('returns 400 when messages field is missing', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ financialContext: '' }),
    })
    assert.equal(res.status, 400)
    const data = await res.json()
    assert.equal(typeof data.error, 'string')
  })

  it('returns 400 when messages is an empty array', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [], financialContext: '' }),
    })
    assert.equal(res.status, 400)
    const data = await res.json()
    assert.equal(typeof data.error, 'string')
  })
})

// ---------------------------------------------------------------------------
// /api/chat — API key not configured
// ---------------------------------------------------------------------------

if (!hasApiKey) {
  describe('POST /api/chat — no API key', () => {
    it('returns 400 with a descriptive error message', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          financialContext: '',
        }),
      })
      assert.equal(res.status, 400)
      const data = await res.json()
      assert.match(data.error, /API key/i)
    })
  })
}

// ---------------------------------------------------------------------------
// /api/chat — full SSE streaming (only runs when a key is configured)
// ---------------------------------------------------------------------------

if (hasApiKey) {
  describe('POST /api/chat — SSE streaming', () => {
    it('responds with content-type text/event-stream', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Reply with just the word OK.' }],
          financialContext: '',
        }),
      })
      assert.equal(res.status, 200)
      assert.ok(
        res.headers.get('content-type')?.includes('text/event-stream'),
        `expected text/event-stream, got ${res.headers.get('content-type')}`,
      )
      // Drain the stream so the connection closes cleanly.
      await res.body?.cancel()
    })

    it('streams one or more text events followed by [DONE]', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Reply with just the word OK.' }],
          financialContext: '',
        }),
      })
      assert.equal(res.status, 200)

      const events = await collectSseEvents(res)
      assert.ok(events.length > 0, 'should receive at least one event before [DONE]')
      for (const ev of events) {
        assert.equal(typeof ev.text, 'string', `every event should have a text field: ${JSON.stringify(ev)}`)
      }
    })

    it('assembles a non-empty reply from streamed tokens', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Reply with just the word OK.' }],
          financialContext: '',
        }),
      })
      const events = await collectSseEvents(res)
      const fullText = events.map((e) => e.text ?? '').join('')
      assert.ok(fullText.trim().length > 0, 'assembled reply should be non-empty')
    })

    it('maintains conversation context across turns', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Remember the number 42.' },
            { role: 'assistant', content: 'Remembered: 42.' },
            { role: 'user', content: 'What number did I ask you to remember? Reply with just the number.' },
          ],
          financialContext: '',
        }),
      })
      assert.equal(res.status, 200)
      const events = await collectSseEvents(res)
      const reply = events.map((e) => e.text ?? '').join('')
      assert.ok(reply.includes('42'), `reply should reference 42, got: ${reply}`)
    })
  })
}
