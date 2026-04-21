import { z } from "zod"
import type { ExtractionResult } from "@/types/chat"

export const ExtractionSchema = z.object({
  city: z.string().nullable(),
  temperature: z.number().nullable(),
  decimal: z.number().nullable(),
  urgency: z.enum(["calm", "moderate", "high"]),
  language: z.string().nullable(),
})

export const EXTRACTION_FALLBACK: ExtractionResult = {
  city: null,
  temperature: null,
  decimal: null,
  urgency: "moderate",
  language: null,
}

export function safeParseExtraction(raw: unknown): ExtractionResult {
  const result = ExtractionSchema.safeParse(raw)
  return result.success ? result.data : EXTRACTION_FALLBACK
}
