import type { NextRequest } from "next/server"
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages"
import { extractionModel, streamingModel } from "@/lib/llm"
import { EXTRACTION_SYSTEM_PROMPT, buildResponseSystemPrompt } from "@/lib/prompts"
import { safeParseExtraction, EXTRACTION_FALLBACK } from "@/lib/parser"
import { resolveSpeaker } from "@/lib/speakers"
import type { StreamEvent, FinalPayload, Mode, HistoryMessage } from "@/types/chat"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function encodeEvent(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event) + "\n")
}

function resolveMode(
  city: string | null,
  temperature: number | null,
  decimal: number | null
): Mode {
  // Temperature wins if either a city or an explicit temp value is present
  if (temperature !== null) return "temperature"
  if (decimal !== null) return "decimal"
  return "urgency"
}

export async function POST(request: NextRequest) {
  let message: string
  let history: HistoryMessage[] = []
  try {
    const body = await request.json()
    message = body?.message
    history = Array.isArray(body?.history) ? body.history : []
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) =>
        controller.enqueue(encodeEvent(event))

      try {
        send({ type: "status", message: "Thinking..." })

        // LLM #1 — structured JSON extraction
        let extraction = EXTRACTION_FALLBACK
        try {
          const raw = await extractionModel.invoke([
            new SystemMessage(EXTRACTION_SYSTEM_PROMPT),
            new HumanMessage(message),
          ])
          extraction = safeParseExtraction(raw)
        } catch (err) {
          console.error("[LLM1 error]", err)
        }

        send({ type: "status", message: "Analyzing..." })

        const { speaker, languageName } = resolveSpeaker(extraction.language)
        send({ type: "status", message: `Consulting ${speaker}...` })

        // LLM #2 — streaming persona response with full conversation history
        let response = ""
        try {
          const historyMessages = history.map((h) =>
            h.role === "user" ? new HumanMessage(h.content) : new AIMessage(h.content)
          )
          const iter = await streamingModel.stream([
            new SystemMessage(buildResponseSystemPrompt(speaker, languageName)),
            ...historyMessages,
            new HumanMessage(message),
          ])

          for await (const chunk of iter) {
            const text =
              typeof chunk.content === "string"
                ? chunk.content
                : Array.isArray(chunk.content)
                ? (chunk.content as { type: string; text?: string }[])
                    .filter((b): b is { type: "text"; text: string } => b.type === "text")
                    .map((b) => b.text)
                    .join("")
                : ""
            if (text) {
              response += text
              send({ type: "token", content: text })
            }
          }
        } catch (err) {
          console.error("[LLM2 error]", err)
          const msg = "The scholar is momentarily unavailable. Please try again."
          response = msg
          send({ type: "token", content: msg })
        }

        const mode = resolveMode(extraction.city, extraction.temperature, extraction.decimal)
        const finalPayload: FinalPayload = { ...extraction, mode, response }
        send({ type: "final", data: finalPayload })
      } catch (err) {
        console.error("[route fatal]", err)
        send({ type: "status", message: "An unexpected error occurred." })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
