export interface ExtractionResult {
  city: string | null
  temperature: number | null
  decimal: number | null
  urgency: "calm" | "moderate" | "high"
  language: string | null
}

export type Mode = "temperature" | "decimal" | "urgency"

export interface FinalPayload extends ExtractionResult {
  mode: Mode
  response: string
}

export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "token"; content: string }
  | { type: "final"; data: FinalPayload }

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  statusMessage?: string
  isStreaming: boolean
  finalPayload?: FinalPayload
}

export interface HistoryMessage {
  role: "user" | "assistant"
  content: string
}

export interface ChatRequest {
  message: string
  history?: HistoryMessage[]
}
