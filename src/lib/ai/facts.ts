import { GoogleGenAI, Content, ThinkingLevel } from "@google/genai";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { getSession } from "@/lib/auth";
import {
  getConversation,
  getConversationMessages,
  getUserFacts,
  addFact,
  addFactExtraction,
  updateConversationFactExtractedAt,
} from "@/lib/db";
import type { Fact } from "@/lib/db";
import { randomUUID } from "crypto";
import { logGeminiUsage } from "./adapters/gemini-adapter";
import { logXAIUsage } from "./adapters/xai-adapter";

export const FACT_CATEGORIES = ["core", "technical", "project", "transient"] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

export interface ExistingFactRef {
  id: string;
  category: string;
  fact: string;
}

export type ExtractionResultItem =
  | { type: "existing"; existingFactId: string }
  | { type: "new"; category: FactCategory; fact: string };

export interface ExtractFactsResult {
  results: ExtractionResultItem[];
}

export interface SavedFactResult {
  fact: Fact;
  action: "new" | "referenced";
}

// Change this to switch between models: "gemini" | "grok"
const EXTRACTION_MODEL: "gemini" | "grok" = "gemini";

const EXTRACT_FACTS_PROMPT = `
You are a high-precision Memory Extraction Engine for a personal AI assistant. Your goal is to analyze the provided chat history and extract **atomic, long-term facts** about the user.

### 1. CATEGORIZATION RULES
Assign every extracted fact to exactly one of these categories (based on decay logic):
- **core**: Identity, family, personality, long-term beliefs. (No decay)
- **technical**: Programming languages, tech stack, hardware preferences. (Slow decay)
- **project**: Active work, specific apps/features being built. (Standard decay)
- **transient**: News tracking, short-term interests, shopping research. (Fast decay)

### 2. EXTRACTION LOGIC
- **One Concept Per Fact**: Each fact must capture exactly ONE topic, preference, or interest. NEVER combine multiple subjects into a single fact, even if they appear in the same message. For example, "Tracks NVIDIA Rubin and OpenClaw project" is BAD — split into "Tracks NVIDIA Rubin hardware roadmap" and "Follows OpenClaw project updates".
- **Atomic & Concise**: Each fact must be a single, standalone statement under 15 words.
- **Third-Person, No "User" Prefix**: Phrase facts objectively without starting with "User is" or "User". For example, write "Prefers SQLite over Postgres" instead of "User prefers SQLite over Postgres".
- **Direct Facts**: Focus on the core intent or preference. State the topic of interest directly. Avoid indirect phrasing like "User is researching...", "User is inquiring about...", or "User asked about...". For example, instead of "User is researching ThinkPad X2", write "User is interested in the ThinkPad X2".
- **No Noise**: Ignore greetings, small talk, generic requests (e.g., "give me today's news", "summarize this article"), and action commands (e.g., "add an event", "set a reminder"). Do not extract facts from prompt templates or instructions the user gives to the assistant. However, if the user asks about a specific topic repeatedly or with clear personal interest (e.g., "What's the latest on the ThinkPad X2?"), that may indicate genuine interest worth capturing.
- **High Bar**: When in doubt, do NOT extract. Only extract facts you are highly confident reflect a genuine, lasting user trait, preference, or interest. A single casual question is not enough.
- **No Duplicates Among New Facts**: Do not extract multiple new facts that are semantically identical to each other. If two mentions refer to the same single topic, keep one. But do NOT merge distinct topics into one fact. Note: if a fact matches an existing stored fact, you MUST still reference it — see the output format section.
- **Respect Negations**: Do not attribute a technology or preference to the user if they explicitly state they "don't need," "dislike," or are "just asking about" it.
- **Query vs. Preference**: Only extract "technical" facts if the user confirms usage. A question like "How does Rust work?" is NOT a preference. "I use Rust for my backend" IS a preference.
- **STRICT: User Messages Only**: ONLY extract facts from the user's own messages. Assistant messages are provided ONLY to help you understand what the user was talking about and to correct spelling or grammar in the user's messages. Do NOT derive, infer, or extract any facts from assistant responses. If the assistant mentions a technology, topic, or detail, that is NOT a user fact. Only the user's own words count.
- If there are no meaningful facts, return an empty array.
`.trim();

function buildOutputFormatPrompt(existingFacts?: ExistingFactRef[]): string {
  if (existingFacts && existingFacts.length > 0) {
    const factsList = existingFacts
      .map((f, i) => `[${i}] (${f.category}) ${f.fact}`)
      .join("\n");

    return `
### 3. EXISTING FACTS
Below are facts already stored. If a new fact is semantically the same as an existing one, reference it by index instead of creating a duplicate.

${factsList}

### 4. OUTPUT FORMAT
Respond with ONLY a valid JSON array of objects. No markdown, no explanation.
Each item is either:
- {"type":"existing","index":0} — matches existing fact at that index
- {"type":"new","category":"core","fact":"Some new fact"} — a genuinely new fact

Example:
[{"type":"existing","index":0},{"type":"new","category":"project","fact":"Building a personal AI chat app called Brain using Next.js"}]
`.trim();
  }

  return `
### 3. OUTPUT FORMAT
Respond with ONLY a valid JSON array of objects. No markdown, no explanation.
Each object must have "category" (one of: core, technical, project, transient) and "fact" (string).

Example:
[{"category":"core","fact":"Lives in Sri Lanka"},{"category":"technical","fact":"Prefers SQLite with better-sqlite3 for local databases"},{"category":"project","fact":"Building a personal AI chat app called Brain using Next.js"}]
`.trim();
}

/**
 * Extracts facts from a conversation. Gets session internally (auth required).
 * When existingFacts are provided, the AI can reference them by index instead of creating duplicates.
 */
export async function extractFactsFromConversation(
  conversationId: string,
  existingFacts?: ExistingFactRef[]
): Promise<ExtractFactsResult> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const conversation = await getConversation(session.userId, conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const allMessages = await getConversationMessages(session.userId, conversationId);
  if (!allMessages || allMessages.length === 0) {
    return { results: [] };
  }

  // Only process messages created after the last fact extraction
  const lastExtracted = conversation.last_fact_extracted_at;
  const messages = lastExtracted
    ? allMessages.filter((m) => m.created_at > lastExtracted)
    : allMessages;

  if (messages.length === 0) {
    return { results: [] };
  }

  const filteredMessages = messages
    .filter((m) => m.role !== "summary")
    .map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? truncateToWords(m.content, 50) : m.content,
    }));

  const fullPrompt = EXTRACT_FACTS_PROMPT + "\n\n" + buildOutputFormatPrompt(existingFacts);

  let fullResponse: string;

  if (EXTRACTION_MODEL === "grok") {
    fullResponse = await extractWithGrok(filteredMessages, fullPrompt);
  } else {
    fullResponse = await extractWithGemini(filteredMessages, fullPrompt);
  }

  return parseFactsResponse(fullResponse, existingFacts);
}

/**
 * Saves extraction results to DB: inserts new facts, records extractions for existing ones,
 * and updates the conversation's last_fact_extracted_at timestamp.
 */
export async function saveExtractedFacts(
  conversationId: string,
  results: ExtractionResultItem[]
): Promise<SavedFactResult[]> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  const userId = session.userId;

  const saved: SavedFactResult[] = [];

  for (const item of results) {
    if (item.type === "new") {
      const factId = randomUUID();
      await addFact(userId, factId, item.category, item.fact);
      await addFactExtraction(randomUUID(), factId, conversationId);
      saved.push({
        fact: {
          id: factId,
          user_id: userId,
          category: item.category,
          fact: item.fact,
          created_at: new Date().toISOString(),
          extraction_count: 1,
        },
        action: "new",
      });
    } else {
      await addFactExtraction(randomUUID(), item.existingFactId, conversationId);
      const allFacts = await getUserFacts(userId);
      const updatedFact = allFacts.find((f) => f.id === item.existingFactId);
      if (updatedFact) {
        saved.push({ fact: updatedFact, action: "referenced" });
      }
    }
  }

  await updateConversationFactExtractedAt(conversationId);

  return saved;
}

/**
 * Extracts facts for a given user (no session required, for worker use).
 */
export async function extractFactsForUser(
  userId: string,
  conversationId: string,
  existingFacts?: ExistingFactRef[]
): Promise<ExtractFactsResult> {
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const allMessages = await getConversationMessages(userId, conversationId);
  if (!allMessages || allMessages.length === 0) {
    return { results: [] };
  }

  const lastExtracted = conversation.last_fact_extracted_at;
  const messages = lastExtracted
    ? allMessages.filter((m) => m.created_at > lastExtracted)
    : allMessages;

  if (messages.length === 0) {
    return { results: [] };
  }

  const filteredMessages = messages
    .filter((m) => m.role !== "summary")
    .map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? truncateToWords(m.content, 50) : m.content,
    }));

  const fullPrompt = EXTRACT_FACTS_PROMPT + "\n\n" + buildOutputFormatPrompt(existingFacts);

  let fullResponse: string;

  if (EXTRACTION_MODEL === "grok") {
    fullResponse = await extractWithGrok(filteredMessages, fullPrompt);
  } else {
    fullResponse = await extractWithGemini(filteredMessages, fullPrompt);
  }

  return parseFactsResponse(fullResponse, existingFacts);
}

/**
 * Saves extraction results for a given user (no session required, for worker use).
 */
export async function saveExtractedFactsForUser(
  userId: string,
  conversationId: string,
  results: ExtractionResultItem[]
): Promise<SavedFactResult[]> {
  const saved: SavedFactResult[] = [];

  for (const item of results) {
    if (item.type === "new") {
      const factId = randomUUID();
      await addFact(userId, factId, item.category, item.fact);
      await addFactExtraction(randomUUID(), factId, conversationId);
      saved.push({
        fact: {
          id: factId,
          user_id: userId,
          category: item.category,
          fact: item.fact,
          created_at: new Date().toISOString(),
          extraction_count: 1,
        },
        action: "new",
      });
    } else {
      await addFactExtraction(randomUUID(), item.existingFactId, conversationId);
      const allFacts = await getUserFacts(userId);
      const updatedFact = allFacts.find((f) => f.id === item.existingFactId);
      if (updatedFact) {
        saved.push({ fact: updatedFact, action: "referenced" });
      }
    }
  }

  await updateConversationFactExtractedAt(conversationId);

  return saved;
}

async function extractWithGemini(
  messages: { role: string; content: string }[],
  prompt: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  const client = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

  const contents: Content[] = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  contents.push({
    role: "user",
    parts: [{ text: prompt }],
  });

  let fullResponse = "";
  let lastUsageMetadata: any = null;

  const stream = await client.models.generateContentStream({
    model: modelName,
    contents,
    config: {
      thinkingConfig: {
        includeThoughts: false,
        thinkingLevel: ThinkingLevel.MEDIUM,
      },
    },
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      fullResponse += chunk.text;
    }
    if (chunk.usageMetadata) {
      lastUsageMetadata = chunk.usageMetadata;
    }
  }

  if (lastUsageMetadata) {
    logGeminiUsage('FactExtraction', lastUsageMetadata, modelName);
  }

  return fullResponse;
}

async function extractWithGrok(
  messages: { role: string; content: string }[],
  prompt: string
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set");
  }

  const xai = createOpenAI({
    baseURL: "https://api.x.ai/v1",
    apiKey,
  });

  const aiMessages: Array<{ role: "user" | "assistant"; content: string }> =
    messages.map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

  aiMessages.push({
    role: "user",
    content: prompt,
  });

  const result = streamText({
    model: xai("grok-4-1-fast-reasoning"),
    messages: aiMessages,
  });

  let fullResponse = "";
  for await (const chunk of result.textStream) {
    fullResponse += chunk;
  }

  const usage = await result.usage;
  if (usage) {
    logXAIUsage('FactExtraction', usage, 'grok-4-1-fast-reasoning');
  }

  return fullResponse;
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "...";
}

function isValidCategory(c: string): c is FactCategory {
  return FACT_CATEGORIES.includes(c as FactCategory);
}

function parseFactsResponse(
  response: string,
  existingFacts?: ExistingFactRef[]
): ExtractFactsResult {
  const cleaned = response.trim();

  function parseArray(arr: unknown[]): ExtractionResultItem[] {
    const results: ExtractionResultItem[] = [];

    for (const item of arr) {
      if (typeof item !== "object" || item === null) continue;

      const obj = item as Record<string, unknown>;

      // Check if it's an existing fact reference
      if (obj.type === "existing" && typeof obj.index === "number" && existingFacts) {
        const idx = obj.index;
        if (idx >= 0 && idx < existingFacts.length) {
          results.push({ type: "existing", existingFactId: existingFacts[idx].id });
        }
        continue;
      }

      // Check if it's a new fact (with or without type field)
      const category = obj.category;
      const fact = obj.fact;
      if (typeof category === "string" && typeof fact === "string" && isValidCategory(category)) {
        results.push({ type: "new", category: category as FactCategory, fact });
      }
    }

    return results;
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return { results: parseArray(parsed) };
    }
  } catch {
    // Try to extract JSON array from the response if it has surrounding text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return { results: parseArray(parsed) };
        }
      } catch {
        // Fall through
      }
    }
  }

  return { results: [] };
}
