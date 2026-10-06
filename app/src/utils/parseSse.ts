export type SseEvent =
  | { type: 'text'; text: string }
  | { type: 'error'; error: string }
  | { type: 'done' }

/**
 * Parses one raw network chunk from an SSE stream.
 *
 * SSE events arrive as lines of the form:
 *   data: <payload>\n\n
 *
 * Network chunks don't align with event boundaries, so we keep a buffer of
 * bytes that haven't yet formed a complete line. Each call appends the new
 * chunk to that buffer, extracts every complete line, and returns the
 * leftover incomplete line as the new buffer value.
 *
 * Returns the parsed events and the updated buffer to pass into the next call.
 */
export function parseSseChunk(
  chunk: string,
  buffer: string,
): { events: SseEvent[]; buffer: string } {
  const lines = (buffer + chunk).split('\n')
  // The last element is either empty (chunk ended with \n) or an incomplete
  // line; either way, hold it back for the next chunk.
  const nextBuffer = lines.pop() ?? ''
  const events: SseEvent[] = []

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const payload = line.slice(6)

    if (payload === '[DONE]') {
      events.push({ type: 'done' })
      break // nothing after [DONE] is meaningful
    }

    try {
      const parsed = JSON.parse(payload) as { text?: string; error?: string }
      if (parsed.error) {
        events.push({ type: 'error', error: parsed.error })
        break
      }
      if (parsed.text) {
        events.push({ type: 'text', text: parsed.text })
      }
    } catch {
      // Malformed JSON — skip and wait for a complete chunk.
    }
  }

  return { events, buffer: nextBuffer }
}
