"use client"

import { useReducer, useRef, useEffect, useState } from "react"
import { signOut } from "firebase/auth"
import { auth } from "@/lib/firebase-client"
import type { Message, StreamEvent, FinalPayload, ChatRequest, HistoryMessage } from "@/types/chat"
import MessageBubble from "@/components/MessageBubble"

interface ChatState {
  messages: Message[]
  isStreaming: boolean
  inputValue: string
}

type ChatAction =
  | { type: "SET_INPUT"; value: string }
  | { type: "ADD_USER_MESSAGE"; message: Message }
  | { type: "ADD_ASSISTANT_PLACEHOLDER"; message: Message }
  | { type: "UPDATE_STATUS"; id: string; statusMessage: string }
  | { type: "APPEND_TOKEN"; id: string; content: string }
  | { type: "FINALIZE_MESSAGE"; id: string; payload: FinalPayload }
  | { type: "SET_STREAMING"; value: boolean }
  | { type: "MARK_ERROR"; id: string }

function reducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_INPUT":
      return { ...state, inputValue: action.value }
    case "ADD_USER_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] }
    case "ADD_ASSISTANT_PLACEHOLDER":
      return { ...state, messages: [...state.messages, action.message] }
    case "UPDATE_STATUS":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, statusMessage: action.statusMessage } : m
        ),
      }
    case "APPEND_TOKEN":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, content: m.content + action.content } : m
        ),
      }
    case "FINALIZE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id
            ? { ...m, isStreaming: false, finalPayload: action.payload }
            : m
        ),
      }
    case "SET_STREAMING":
      return { ...state, isStreaming: action.value }
    case "MARK_ERROR":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id
            ? {
                ...m,
                isStreaming: false,
                content: m.content || "Something went wrong. Please try again.",
              }
            : m
        ),
      }
    default:
      return state
  }
}

const initialState: ChatState = {
  messages: [],
  isStreaming: false,
  inputValue: "",
}

const SEP = "&&_*ENG_*&&"

const EXAMPLE_PROMPTS = [
  { label: "Temperature", text: "Lahore is 38°C today" },
  { label: "Decimal", text: "The value of π is 3.14159" },
  { label: "Urgent", text: "I am overwhelmed, help me find peace!" },
  { label: "Philosophical", text: "ما معنى الحياة؟" },
]

export default function ChatInterface() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [announcement, setAnnouncement] = useState("")

  async function handleLogout() {
    await signOut(auth).catch(() => {})
    // onAuthStateChanged in AuthGate picks up the sign-out and returns to login screen
  }

  // Auto-resize textarea to fit content, capped by CSS max-height
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [state.inputValue])

  // Scroll only <main> — never ancestors — so the header stays fixed
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReduced ? "auto" : "smooth" })
  }, [state.messages])

  // WCAG 4.1.3 — announce finalized responses outside the log region
  useEffect(() => {
    const last = state.messages[state.messages.length - 1]
    if (last?.role === "assistant" && !last.isStreaming && last.content) {
      const idx = last.content.indexOf(SEP)
      const readable =
        idx !== -1 ? last.content.slice(idx + SEP.length).trim() : last.content
      setAnnouncement(`Scholar responded: ${readable}`)
    }
  }, [state.messages])

  async function sendMessage(text?: string) {
    const msg = (text ?? state.inputValue).trim()
    if (!msg || state.isStreaming) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      isStreaming: false,
    }
    const assistantId = crypto.randomUUID()
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    }

    dispatch({ type: "ADD_USER_MESSAGE", message: userMsg })
    dispatch({ type: "ADD_ASSISTANT_PLACEHOLDER", message: assistantPlaceholder })
    dispatch({ type: "SET_STREAMING", value: true })
    if (!text) dispatch({ type: "SET_INPUT", value: "" })

    // Build history from all finalized messages (exclude the new ones just added)
    const history: HistoryMessage[] = state.messages
      .filter((m) => !m.isStreaming && m.content)
      .map((m) => ({
        role: m.role,
        content:
          m.role === "assistant"
            ? (() => {
                const idx = m.content.indexOf(SEP)
                return idx !== -1 ? m.content.slice(idx + SEP.length).trim() : m.content
              })()
            : m.content,
      }))

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history } satisfies ChatRequest),
      })

      if (!res.ok || !res.body) {
        dispatch({ type: "MARK_ERROR", id: assistantId })
        return
      }

      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event: StreamEvent = JSON.parse(line)
            if (event.type === "status") {
              dispatch({ type: "UPDATE_STATUS", id: assistantId, statusMessage: event.message })
            } else if (event.type === "token") {
              dispatch({ type: "APPEND_TOKEN", id: assistantId, content: event.content })
            } else if (event.type === "final") {
              dispatch({ type: "FINALIZE_MESSAGE", id: assistantId, payload: event.data })
            }
          } catch {
            // malformed line — skip
          }
        }
      }
    } catch (err) {
      console.error("[sendMessage]", err)
      dispatch({ type: "MARK_ERROR", id: assistantId })
    } finally {
      dispatch({ type: "SET_STREAMING", value: false })
      readerRef.current = null
      // Defer until React re-renders the textarea as enabled, then focus
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const isEmpty = state.messages.length === 0

  return (
    // h-dvh: uses visual viewport on mobile (avoids overlap with on-screen keyboard)
    <div className="flex flex-col h-dvh overflow-hidden bg-[#080c18] text-slate-100">

      {/* ── WCAG 4.1.3 polite announcer (outside log region) ── */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* ── Header ── */}
      <header
        className="flex-none flex items-center justify-between px-5 py-3 border-b border-white/[0.07] bg-[#0d1221]"
        role="banner"
      >
        <div className="flex items-center gap-3">
          {/* Avatar: aria-hidden because h1 already names the person */}
          <div
            aria-hidden="true"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700 flex items-center justify-center text-white text-sm font-bold select-none shadow-lg"
            style={{ fontFamily: "'Noto Naskh Arabic', serif" }}
          >
            ابن
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-white">Ibn Sina</h1>
            <p className="text-[11px] text-amber-400/80 leading-tight">
              Physician · Philosopher · Polymath
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p
            className="text-xs text-slate-400 hidden sm:block"
            id="chat-description"
          >
            Responds in RTL script + English translation
          </p>

          {/* Log out — icon-only button, 44×44px touch target via padding */}
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="p-2.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── WCAG 2.4.1 skip-link target ── */}
      <main
        ref={mainRef}
        id="main-content"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5"
        aria-label="Conversation"
        aria-describedby="chat-description"
      >

        {/* Empty state — interactive, so NO aria-hidden */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="space-y-1">
              <p className="text-slate-300 text-sm font-medium">Ask the scholar anything</p>
              <p className="text-slate-500 text-xs">
                Try a city + temperature, a decimal number, or any message
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => sendMessage(p.text)}
                  disabled={state.isStreaming}
                  className="text-left px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/[0.15] text-sm text-slate-300 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                    {p.label}
                  </span>
                  {p.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list — role="log" carries implicit aria-live="polite" */}
        <ul
          role="log"
          aria-label="Messages"
          aria-relevant="additions"
          className="space-y-2 list-none p-0 m-0 pb-4"
        >
          {state.messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </ul>

      </main>

      {/* ── Input footer — backdrop-blur frosted glass ── */}
      <footer
        className="flex-none px-4 py-3 border-t border-white/[0.07] bg-[#0d1221]/80 backdrop-blur-md"
        // Inner footer, not page-level — no role="contentinfo"
      >
        <div
          className="flex gap-2 items-end max-w-3xl mx-auto"
          role="form"
          aria-label="Compose message"
        >
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={state.inputValue}
            onChange={(e) => dispatch({ type: "SET_INPUT", value: e.target.value })}
            onKeyDown={handleKeyDown}
            disabled={state.isStreaming}
            placeholder="Ask anything…"
            rows={1}
            aria-describedby="chat-input-hint"
            aria-disabled={state.isStreaming || undefined}
            className="flex-1 resize-none rounded-xl bg-white/[0.05] border border-white/[0.1] px-4 py-3 text-sm text-slate-100 placeholder-slate-500 disabled:opacity-50 transition-colors focus:outline-2 focus:outline-blue-500 focus:outline-offset-2 max-h-[200px] overflow-y-auto"
          />
          <span id="chat-input-hint" className="sr-only">
            Press Enter to send. Press Shift+Enter for a new line.
          </span>

          <button
            onClick={() => sendMessage()}
            disabled={state.isStreaming || !state.inputValue.trim()}
            aria-label={state.isStreaming ? "Sending message, please wait" : "Send message"}
            className="flex-none w-11 h-11 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 focus-visible:outline-offset-2"
          >
            {state.isStreaming ? (
              /* Spinning loader while waiting */
              <svg
                aria-hidden="true"
                className="w-4 h-4 animate-spin text-slate-300"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12" cy="12" r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            ) : (
              /* Paper-plane send icon */
              <svg
                aria-hidden="true"
                className="w-4 h-4 text-white translate-x-px"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            )}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </footer>
    </div>
  )
}
