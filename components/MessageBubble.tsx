"use client"

import type { Message, FinalPayload } from "@/types/chat"
import { resolveSpeaker } from "@/lib/speakers"

const SEP = "&&_*ENG_*&&"

// ── WCAG 2.0 color math ──────────────────────────────────────────────────────

/** Parse "hsl(h s% l%)" or "#rrggbb" → [r, g, b] 0-255 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100
  const ln = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

/** WCAG 2.0 relative luminance */
function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 1.4.3 — pick "#ffffff" or "#000000" at 4.5:1 or best available */
function wcagText(r: number, g: number, b: number): "#ffffff" | "#000000" {
  const bg = luminance(r, g, b)
  const onWhite = (1.05) / (bg + 0.05)
  const onBlack = (bg + 0.05) / (0.05)
  if (onWhite >= 4.5) return "#ffffff"
  if (onBlack >= 4.5) return "#000000"
  return onWhite >= onBlack ? "#ffffff" : "#000000"
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

// ── Spectrum color functions (single solid color per value) ──────────────────

/**
 * Temperature → single HSL color on the blue→purple→red spectrum.
 * Uses hue rotation for smooth perceptual transitions.
 * ≤ 0°C = deep blue (hue 222), 15°C = light purple (hue 275), ≥ 35°C = bright red (hue 355)
 */
function tempHsl(celsius: number): [number, number, number] {
  if (celsius <= 0) return [222, 72, 36]
  if (celsius >= 35) return [355, 74, 46]

  // Two-segment hue journey: 0→15 (blue→purple) and 15→35 (purple→red)
  if (celsius <= 15) {
    const t = celsius / 15
    return [lerp(222, 275, t), lerp(72, 65, t), lerp(36, 40, t)]
  }
  const t = (celsius - 15) / 20
  return [lerp(275, 355, t), lerp(65, 74, t), lerp(40, 46, t)]
}

/**
 * Decimal → sepia/grayscale via first two decimal digits (0–99).
 * 0 = white, 50 = mid sepia, 99 = dark brown.
 */
function decimalHsl(value: number): [number, number, number] {
  const twoDigits = Math.min(99, Math.round((Math.abs(value) % 1) * 100))
  const t = twoDigits / 99

  if (t <= 0.5) {
    // white → mid sepia
    const u = t / 0.5
    return [lerp(0, 28, u), lerp(0, 32, u), lerp(100, 56, u)]
  }
  // mid sepia → dark brown
  const u = (t - 0.5) / 0.5
  return [lerp(28, 22, u), lerp(32, 40, u), lerp(56, 12, u)]
}

/**
 * Urgency → violet (high) → magenta (moderate) → pale yellow (calm).
 */
function urgencyHsl(urgency: "calm" | "moderate" | "high"): [number, number, number] {
  const stops: Record<typeof urgency, [number, number, number]> = {
    high:     [263, 68, 52],  // bright violet
    moderate: [292, 74, 48],  // magenta
    calm:     [54,  90, 78],  // pale yellow
  }
  return stops[urgency]
}

// ── Derive solid background + WCAG text ─────────────────────────────────────

interface BubbleColors {
  backgroundColor: string
  color: string
}

function computeBubbleColors(payload: FinalPayload): BubbleColors {
  let h: number, s: number, l: number

  switch (payload.mode) {
    case "temperature":
      ;[h, s, l] = tempHsl(payload.temperature ?? 20)
      break
    case "decimal":
      ;[h, s, l] = decimalHsl(payload.decimal ?? 0)
      break
    case "urgency":
    default:
      ;[h, s, l] = urgencyHsl(payload.urgency)
      break
  }

  const [r, g, b] = hslToRgb(h, s, l)
  return {
    backgroundColor: `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`,
    color: wcagText(r, g, b),
  }
}

// ── Mode badge ───────────────────────────────────────────────────────────────

const MODE_LABEL: Record<string, string> = {
  temperature: "Temperature",
  decimal:     "Decimal",
  urgency:     "Urgency",
}

/** Mode badge: colored pill with a dot indicator + text label. */
function ModeBadge({ payload }: { payload: FinalPayload }) {
  const { backgroundColor, color } = computeBubbleColors(payload)
  const label = MODE_LABEL[payload.mode] ?? payload.mode
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset ring-white/20"
      style={{ backgroundColor, color }}
      aria-label={`Mode: ${label}`}
    >
      {/* Decorative dot — color inverted from text so it's always visible */}
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full flex-none"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}

// ── Response parsing ─────────────────────────────────────────────────────────

function parseResponse(raw: string): { rtl: string; english: string } | null {
  const idx = raw.indexOf(SEP)
  if (idx === -1) return null
  return {
    rtl: raw.slice(0, idx).trim(),
    english: raw.slice(idx + SEP.length).trim(),
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  message: Message
}

export default function MessageBubble({ message }: Props) {
  // WCAG 1.3.1 — native <li> owned by <ul role="log"> in ChatInterface
  if (message.role === "user") {
    return (
      <li className="flex justify-end mb-3 list-none">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-3 bg-blue-600 text-white text-sm leading-relaxed shadow-lg">
          <span className="sr-only">You said: </span>
          {message.content}
        </div>
      </li>
    )
  }

  const payload = message.finalPayload
  const colorStyle: React.CSSProperties = payload
    ? computeBubbleColors(payload)
    : { backgroundColor: "#1e2535", color: "#e2e8f0" }

  const parsed = parseResponse(message.content)
  const rtlLang = payload?.language ?? "und"

  return (
    <li className="flex justify-start mb-3 list-none">
      <div className="max-w-[85%] space-y-1.5">

        {/* Status dot — shown while streaming before any tokens arrive */}
        {message.isStreaming && message.statusMessage && !message.content && (
          <div
            className="flex items-center gap-2 text-xs text-slate-400 italic px-1"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="flex gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-slate-500 animate-bounce motion-reduce:animate-none"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </span>
            {message.statusMessage}
          </div>
        )}

        {/* Message bubble — single solid background color from spectrum */}
        {message.content && (
          <div
            className="rounded-2xl rounded-bl-sm px-5 py-4 text-sm leading-relaxed shadow-lg transition-colors duration-500"
            style={colorStyle}
          >
            {parsed ? (
              <>
                {/* RTL native script — lang attribute drives screen reader TTS */}
                <p
                  dir="rtl"
                  lang={rtlLang}
                  className="font-semibold text-base mb-3 text-right leading-loose"
                  style={{ fontFamily: "'Noto Naskh Arabic', 'Scheherazade New', serif" }}
                >
                  {parsed.rtl}
                </p>

                {/* Divider */}
                <div className="flex items-center gap-2 my-3" aria-hidden="true">
                  <div className="flex-1 h-px bg-current opacity-20" />
                  <div className="flex-1 h-px bg-current opacity-20" />
                </div>

                {/* English translation */}
                <p dir="ltr" lang="en" className="text-xs leading-relaxed" style={{ opacity: 0.92 }}>
                  {parsed.english}
                </p>
              </>
            ) : (
              <p>{message.content}</p>
            )}

            {/* Streaming cursor */}
            {message.isStreaming && (
              <span
                className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse motion-reduce:animate-none align-middle"
                aria-hidden="true"
              />
            )}
          </div>
        )}

        {/* Footer strip — mode badge + scholar + metadata */}
        {payload && (() => {
          const { speaker } = resolveSpeaker(payload.language)
          return (
            <div className="flex items-center gap-2 px-1 flex-wrap">
              <ModeBadge payload={payload} />

              {/* Scholar attribution — slate-400 = 7.81:1 on #080c18, passes WCAG 1.4.3 */}
              <span className="text-xs text-slate-400 font-medium">
                {speaker}
              </span>

              {/* Metadata fields — all slate-400 minimum to pass 4.5:1 on #080c18 */}
              {payload.city && (
                <span className="text-xs text-slate-400">
                  {payload.city}
                </span>
              )}
              {payload.temperature !== null && (
                <span className="text-xs text-slate-400">
                  {payload.temperature}°C
                </span>
              )}
              {payload.decimal !== null && (
                <span className="text-xs text-slate-400">
                  {payload.decimal}
                </span>
              )}
              {/* Urgency — slate-400 (slate-500/600 fail 4.5:1 on this background) */}
              <span className="text-xs text-slate-400 ml-auto capitalize">
                {payload.urgency}
              </span>
            </div>
          )
        })()}
      </div>
    </li>
  )
}
