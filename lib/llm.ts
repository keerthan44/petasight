import { ChatOpenAI } from "@langchain/openai"
import { ExtractionSchema } from "@/lib/parser"

const baseExtraction = new ChatOpenAI({
  model: "gpt-5.4-mini",
  temperature: 0,
  maxCompletionTokens: 150,
  openAIApiKey: process.env.OPENAI_API_KEY,
})

export const extractionModel = baseExtraction.withStructuredOutput(ExtractionSchema, {
  name: "extract_fields",
  strict: true,
})

export const streamingModel = new ChatOpenAI({
  model: "gpt-5.4-mini",
  temperature: 0.7,
  maxCompletionTokens: 1024,
  streaming: true,
  openAIApiKey: process.env.OPENAI_API_KEY,
})
