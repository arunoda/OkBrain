---
name: Fact Extraction
description: Automatic fact extraction from conversations — extraction logic, storage, context injection, periodic worker, and UI.
---

# Fact Extraction

The fact extraction system automatically extracts atomic personal facts from user conversations using AI, stores them in SQLite, and injects them into future chat context for personalization.

## Architecture Overview

```
Periodic trigger (30min)
        │
        ▼
  fact-extraction job
        │
        ▼
  fact-extraction-worker
        │  queries eligible conversations
        │  groups by user
        ▼
  extractFactsForUser()        ──► Gemini/Grok AI call
        │                            with EXTRACT_FACTS_PROMPT
        ▼
  saveExtractedFactsForUser()  ──► facts table + fact_extractions table
        │
        ▼
  generateAndSaveFactSheet()   ──► scored fact sheet (see Fact Sheet skill)
        │
        ▼
  Chat context injection       ──► getLatestFactSheet() → injectContextMessages()
  (on every chat message)           facts shown as USER FACTS block
```

## Database Schema

### `facts` table (`src/lib/db/db-schema.ts:646`)

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT FK | References users(id) |
| category | TEXT | CHECK constraint: `core`, `technical`, `project`, `transient` |
| fact | TEXT | The atomic fact text |
| created_at | DATETIME | Auto-set |

Indexes: `(user_id)`, `(user_id, category)`

### `fact_extractions` table (`src/lib/db/db-schema.ts:666`)

Tracks which fact was found in which conversation (many-to-many).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| fact_id | TEXT FK | References facts(id) ON DELETE CASCADE |
| conversation_id | TEXT FK | References conversations(id) ON DELETE CASCADE |
| created_at | DATETIME | Auto-set |

Indexes: `(fact_id)`, `(conversation_id)`, `(created_at)`

### `conversations` table addition

`last_fact_extracted_at DATETIME` — tracks when facts were last extracted, so only new messages are processed on next run.

## Fact Categories

| Category | Description | Decay |
|----------|-------------|-------|
| `core` | Identity, family, personality, long-term beliefs | None |
| `technical` | Programming languages, tech stack, hardware preferences | Slow |
| `project` | Active work, specific apps/features being built | Standard |
| `transient` | News tracking, short-term interests, shopping research | Fast |

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai/facts.ts` | Core extraction logic, AI prompts, parsing |
| `src/lib/db/db-facts.ts` | All DB operations for facts |
| `src/workers/fact-extraction-worker.ts` | Background worker processing |
| `src/lib/periodic/fact-extraction.ts` | 30-minute interval trigger |
| `src/lib/ai/context.ts` | Context injection into chat messages |
| `src/lib/ai/system-prompts.ts:201-217` | `buildFactsContextPrompt()` formatter |
| `src/app/api/facts/route.ts` | GET/DELETE API endpoints |
| `src/app/api/facts/extract/route.ts` | Test-only extraction trigger |
| `src/app/(main)/me/page.tsx` | Facts UI in /me page (Facts tab) |
| `src/app/(main)/me/me.css` | Facts styling and category badge colors |
| `src/instrumentation.ts` | Worker registration + periodic trigger startup |
| `e2e/facts.spec.ts` | E2E tests for deletion, extraction, context injection |

## Extraction Logic (`src/lib/ai/facts.ts`)

### AI Model

Configured via `EXTRACTION_MODEL` constant (line 39). Currently set to `"gemini"`. Options: `"gemini"` or `"grok"`.

- **Gemini**: Uses `@google/genai` SDK with thinking mode (HIGH level) for better extraction quality
- **Grok**: Uses `@ai-sdk/openai` with XAI base URL, model `grok-4-1-fast-reasoning`

### Extraction Prompt Rules

The `EXTRACT_FACTS_PROMPT` instructs the AI to:

- **One concept per fact** (atomic) — never combine multiple subjects
- **Under 15 words** per fact
- **Third-person, no "User" prefix** — "Prefers SQLite" not "User prefers SQLite"
- **Direct facts only** — "Interested in ThinkPad X2" not "Researching ThinkPad X2"
- **No noise** — skip greetings, generic requests, action commands
- **High confidence threshold** — when in doubt, don't extract
- **User messages only** — NEVER extract from assistant responses
- **Deduplication** — reference existing facts by index instead of creating duplicates

### Output Format

When existing facts are provided, the AI returns a mix of:
- `{"type":"existing","index":0}` — references existing fact at that index
- `{"type":"new","category":"core","fact":"Some new fact"}` — genuinely new fact

### Two Function Variants

| Function | Auth | Use Case |
|----------|------|----------|
| `extractFactsFromConversation()` | Session required | API route calls |
| `extractFactsForUser(userId, ...)` | No session | Worker/background use |

Both follow the same flow:
1. Get conversation messages
2. Filter to messages created after `last_fact_extracted_at`
3. Exclude `summary` role messages
4. Build prompt with existing facts for deduplication
5. Call AI model and parse response

### Save Logic

| Function | Auth | Use Case |
|----------|------|----------|
| `saveExtractedFacts()` | Session required | API route calls |
| `saveExtractedFactsForUser(userId, ...)` | No session | Worker/background use |

For each result:
- **New fact**: `addFact()` + `addFactExtraction()` (link to conversation)
- **Existing fact reference**: `addFactExtraction()` only (just records the link)
- Finally: `updateConversationFactExtractedAt()` to mark conversation as processed

## DB Queries (`src/lib/db/db-facts.ts`)

### `getUserFacts(userId)`
Returns all facts with `extraction_count` (via LEFT JOIN with fact_extractions), ordered by most recently referenced.

### `getRecentFacts(userId, limit?)`
Returns the most recent `limit` facts (default 30) ordered by `created_at DESC`. Used by the extraction worker to supplement the fact sheet with recently created facts that may not yet be in the sheet.

### `getConversationsForFactExtraction()`
Finds eligible conversations: updated in last 2 days AND (never extracted OR updated since last extraction).

### `addFact(userId, id, category, fact)`
Inserts into facts table.

### `deleteFact(userId, factId)`
Deletes fact_extractions first, then the fact itself.

### `addFactExtraction(id, factId, conversationId)`
Records a fact-to-conversation link.

### `updateConversationFactExtractedAt(conversationId)`
Sets `last_fact_extracted_at = CURRENT_TIMESTAMP`.

## Periodic Worker

### Trigger (`src/lib/periodic/fact-extraction.ts`)

- `setInterval` every 30 minutes (default)
- Initial run after 10-second startup delay
- Creates a `fact-extraction` job via `createJob()` + `startJob()`
- Skipped in `TEST_MODE`

### Worker (`src/workers/fact-extraction-worker.ts`)

Job type: `fact-extraction`, max concurrency: 1

Flow:
1. `getConversationsForFactExtraction()` — find eligible conversations
2. Group by `user_id`
3. Per user: build dedup list from **fact sheet (top 100 scored) + recent 30 facts** (merged by ID), then process each conversation sequentially. This avoids sending all facts to the AI while covering important and recent ones.
4. New facts from each conversation are appended to the dedup list for subsequent conversations
5. Each conversation wrapped in try/catch — one failure doesn't stop the batch
6. Progress via `ctx.status()`, summary via `ctx.emit()`

Console logging prefix: `[FactExtraction]`

### Registration (`src/instrumentation.ts`)

```typescript
await import('./workers/fact-extraction-worker');  // line 10
// After startWorkers():
if (!process.env.TEST_MODE) {
  const { startPeriodicFactExtraction } = await import('./lib/periodic/fact-extraction');
  startPeriodicFactExtraction();
}
```

## Context Injection

> **Note:** Chat and highlights workers now use the **fact sheet** (scored, curated top-100) instead of raw facts. See the [Fact Sheet skill](../fact_sheet/SKILL.md) for details.

### Loading (`src/workers/chat-worker.ts:87-94`)

```typescript
const factSheet = await getLatestFactSheet(userId);
if (factSheet) {
  const entries: FactSheetEntry[] = JSON.parse(factSheet.facts_json);
  facts = entries.map(e => ({ category: e.category, fact: e.fact }));
}
```

### Injection (`src/lib/ai/context.ts:72-83`)

Facts are injected as a user/assistant message pair at conversation start. Injection order (earliest to latest):
1. Events context
2. Timezone instructions
3. **User facts** (lower priority)
4. User memory (higher priority — takes precedence if conflicts)
5. Documents
6. Original messages

### Format (`src/lib/ai/system-prompts.ts:201-217`)

`buildFactsContextPrompt()` groups facts by category:

```
USER FACTS (Auto-extracted from conversations):

[core]
- Lives in Sri Lanka

[technical]
- Prefers TypeScript over JavaScript

(These facts were auto-extracted from past conversations. Use them for context,
but if they conflict with USER MEMORY above, prefer USER MEMORY...)
```

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/facts` | Session | Fetch all user facts with extraction counts |
| DELETE | `/api/facts` | Session | Delete a fact by `{ factId }` |
| POST | `/api/facts/extract` | Session + TEST_MODE | Trigger extraction job (E2E testing only) |

## UI — /me Page Facts Tab

`src/app/(main)/me/page.tsx` — Two tabs: Memory and Facts

Facts tab features:
- Lazy-loaded when tab first opened
- Category badges with color coding (core=blue, technical=green, project=orange, transient=gray)
- Extraction count badge (shown when > 1)
- Delete button (appears on hover, with confirmation dialog)
- Optimistic UI deletion with rollback on error

## E2E Tests (`e2e/facts.spec.ts`)

Three tests:
1. **Fact Deletion** — Seeds facts, navigates to /me, deletes via UI, verifies UI + DB
2. **Fact Extraction** — Seeds conversations, triggers extraction via test API, verifies facts in DB and API
3. **Context Injection** — Seeds conversations with distinctive facts (Rust, cat named Whiskers), extracts, starts new chat, asks AI about pet, verifies response uses injected facts

## Common Modifications

### Changing the extraction model
Edit `EXTRACTION_MODEL` in `src/lib/ai/facts.ts:39`. Options: `"gemini"` or `"grok"`.

### Adjusting extraction frequency
Change `DEFAULT_INTERVAL_MS` in `src/lib/periodic/fact-extraction.ts:12` (default: 30 minutes).

### Modifying fact categories
Update the `CHECK` constraint in `db-schema.ts`, the `FACT_CATEGORIES` array in `facts.ts:16`, and category badge styles in `me.css`.

### Changing how many facts are injected
Edit the `.slice(0, 100)` in `src/workers/chat-worker.ts:90`.

### Modifying the extraction prompt
Edit `EXTRACT_FACTS_PROMPT` in `src/lib/ai/facts.ts:41-63`.
