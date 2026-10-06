import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AppState, IncomeCalc } from '../types'
import { buildFinancialContext } from '../utils/buildFinancialContext'
import { parseSseChunk } from '../utils/parseSse'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  state: AppState
  calc: IncomeCalc
  hasApiKey: boolean
}

export default function ChatPanel({ state, calc, hasApiKey }: ChatPanelProps) {
  const [isOpen, setIsOpen]     = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]       = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (isOpen) textareaRef.current?.focus()
  }, [isOpen])

  async function send() {
    const text = input.trim()
    if (!text || isLoading) return

    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setIsLoading(true)
    setError('')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          financialContext: buildFinancialContext(state, calc),
        }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Request failed')
        return
      }

      // Placeholder so the bubble appears immediately; content fills in as chunks arrive.
      setMessages(m => [...m, { role: 'assistant', content: '' }])

      // The server streams the response as SSE. We read raw bytes and parse
      // manually because EventSource only supports GET requests.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        // { stream: true } preserves the decoder's internal state between chunks
        // so multi-byte UTF-8 characters split across reads are handled correctly.
        const chunk = decoder.decode(value, { stream: true })
        const { events, buffer: nextBuffer } = parseSseChunk(chunk, buffer)
        buffer = nextBuffer

        for (const event of events) {
          if (event.type === 'done') { reader.cancel(); break outer }
          if (event.type === 'error') { setError(event.error); reader.cancel(); break outer }
          if (event.type === 'text') {
            // Append token to the assistant placeholder using functional update so
            // concurrent queued state updates don't overwrite each other.
            setMessages(m => {
              const last = m[m.length - 1]
              return [...m.slice(0, -1), { ...last, content: last.content + event.text }]
            })
          }
        }
      }
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const fabTitle = hasApiKey
    ? 'Open AI Assistant'
    : 'Add a Claude API key in Settings (⚙) to enable AI chat'

  return (
    <>
      <button
        className={`chat-fab${hasApiKey ? '' : ' chat-fab-off'}`}
        onClick={() => hasApiKey && setIsOpen(o => !o)}
        title={fabTitle}
        aria-label="AI chat"
      >
        ✦
      </button>

      {isOpen && (
        <div className="chat-panel" role="dialog" aria-label="AI Assistant">
          <div className="chat-header">
            <div className="chat-header-left">
              <span className="chat-title">AI Assistant</span>
              <span className="chat-model-badge">Claude</span>
            </div>
            <div className="chat-header-right">
              {messages.length > 0 && (
                <button
                  className="chat-clear"
                  onClick={() => { setMessages([]); setError('') }}
                  title="Clear conversation"
                >
                  Clear
                </button>
              )}
              <button className="chat-close" onClick={() => setIsOpen(false)} title="Close">✕</button>
            </div>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && !isLoading && (
              <div className="chat-empty">
                <p>Ask me anything about your finances.</p>
                <div className="chat-suggestions">
                  {[
                    'Summarize my financial health',
                    'Am I on track to retire at my target age?',
                    'Which discretionary expenses could I cut?',
                  ].map(s => (
                    <button
                      key={s}
                      className="chat-suggestion"
                      onClick={() => { setInput(s); textareaRef.current?.focus() }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                <div className="chat-bubble">
                  {msg.role === 'assistant'
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    : msg.content}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="chat-msg chat-msg-assistant">
                <div className="chat-bubble chat-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            {error && (
              <div className="chat-error">{error}</div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-bar">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your finances… (Enter to send)"
              rows={2}
              disabled={isLoading}
            />
            <button
              className="chat-send"
              onClick={send}
              disabled={!input.trim() || isLoading}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  )
}
