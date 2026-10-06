import { describe, it, expect } from 'vitest'
import { parseSseChunk } from './parseSse'

function sse(payload: string) {
  return `data: ${payload}\n\n`
}

describe('parseSseChunk', () => {
  it('parses a single text event', () => {
    const { events, buffer } = parseSseChunk(sse('{"text":"Hello"}'), '')
    expect(events).toEqual([{ type: 'text', text: 'Hello' }])
    expect(buffer).toBe('')
  })

  it('parses multiple text events in one chunk', () => {
    const chunk = sse('{"text":"Hello"}') + sse('{"text":" world"}')
    const { events } = parseSseChunk(chunk, '')
    expect(events).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ])
  })

  it('returns a done event for [DONE] sentinel', () => {
    const { events } = parseSseChunk('data: [DONE]\n\n', '')
    expect(events).toEqual([{ type: 'done' }])
  })

  it('stops processing after [DONE]', () => {
    const chunk = sse('{"text":"Hello"}') + 'data: [DONE]\n\n' + sse('{"text":"ignored"}')
    const { events } = parseSseChunk(chunk, '')
    expect(events).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'done' },
    ])
  })

  it('returns an error event when payload contains error field', () => {
    const { events } = parseSseChunk(sse('{"error":"API key invalid"}'), '')
    expect(events).toEqual([{ type: 'error', error: 'API key invalid' }])
  })

  it('stops processing after an error event', () => {
    const chunk = sse('{"error":"oops"}') + sse('{"text":"ignored"}')
    const { events } = parseSseChunk(chunk, '')
    expect(events).toEqual([{ type: 'error', error: 'oops' }])
  })

  it('holds back an incomplete line in the buffer', () => {
    // Chunk ends mid-line — no \n yet
    const { events, buffer } = parseSseChunk('data: {"text":"He', '')
    expect(events).toEqual([])
    expect(buffer).toBe('data: {"text":"He')
  })

  it('completes a line split across two chunks', () => {
    const { buffer } = parseSseChunk('data: {"text":"He', '')
    const { events, buffer: nextBuffer } = parseSseChunk('llo"}\n\n', buffer)
    expect(events).toEqual([{ type: 'text', text: 'Hello' }])
    expect(nextBuffer).toBe('')
  })

  it('accumulates buffer from previous call before parsing', () => {
    // First chunk: partial event
    const r1 = parseSseChunk('data: {"tex', '')
    expect(r1.events).toEqual([])

    // Second chunk: completes the JSON and adds a second event
    const r2 = parseSseChunk('t":"Hi"}\n\n' + sse('{"text":" there"}'), r1.buffer)
    expect(r2.events).toEqual([
      { type: 'text', text: 'Hi' },
      { type: 'text', text: ' there' },
    ])
  })

  it('skips lines that do not start with "data: "', () => {
    const chunk = 'event: content_block_delta\ndata: {"text":"Hi"}\n\n'
    const { events } = parseSseChunk(chunk, '')
    expect(events).toEqual([{ type: 'text', text: 'Hi' }])
  })

  it('skips malformed JSON without throwing', () => {
    const chunk = 'data: {bad json}\n\n' + sse('{"text":"ok"}')
    const { events } = parseSseChunk(chunk, '')
    expect(events).toEqual([{ type: 'text', text: 'ok' }])
  })

  it('ignores payload with neither text nor error fields', () => {
    const { events } = parseSseChunk(sse('{"type":"ping"}'), '')
    expect(events).toEqual([])
  })

  it('returns empty events and empty buffer for an empty chunk', () => {
    const { events, buffer } = parseSseChunk('', '')
    expect(events).toEqual([])
    expect(buffer).toBe('')
  })
})
