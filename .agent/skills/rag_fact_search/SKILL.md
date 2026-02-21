---
name: RAG Fact Search
description: Local semantic search over extracted facts using Ollama embeddings, sqlite-vec, and a search UI on the /me page.
---

# RAG Fact Search

Local RAG pipeline on top of the fact extraction system. Facts are embedded using `nomic-embed-text:v1.5` via Ollama, stored in a sqlite-vec virtual table, and exposed via a semantic search API with a search UI on the `/me` page Facts tab.

## Architecture Overview

```
Fact saved (in fact-extraction-worker)
        │
        ▼
  embedDocument(text)            ──► Ollama /api/embeddings
        │                            (prefix: "search_document: ")
        ▼
  fact_vec virtual table         ──► sqlite-vec vec0 (float[768])

Search query (from /me page)
        │
        ▼
  embedQuery(query)              ──► Ollama /api/embeddings
        │                            (prefix: "search_query: ")
        ▼
  KNN query on fact_vec          ──► sqlite-vec MATCH + ORDER BY distance
        │
        ▼
  Join with facts table          ──► fact + category + distance + last_extracted_at
```

## Embedding Model

**Model**: `nomic-embed-text:v1.5` via Ollama (768 dimensions)

**Task prefixes** (required for retrieval quality):
- `search_document: ` — when embedding facts for storage
- `search_query: ` — when embedding user queries for search

Without these prefixes the model still works but retrieval quality degrades significantly.

## Dependencies

- **npm**: `sqlite-vec` — SQLite extension for vector operations (loaded dynamically in `db-local.ts`)
- **System**: Ollama — local model runner (required for dev, installed as systemd service in production)
- **Next.js config**: `sqlite-vec` added to `serverExternalPackages` in `next.config.ts`

## Database Schema

### `fact_vec` virtual table (`src/lib/db/db-schema.ts:706`)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS fact_vec USING vec0(
  fact_id TEXT PRIMARY KEY,
  user_id TEXT partition key,
  embedding float[768] distance_metric=cosine
);
```

- **`vec0`**: sqlite-vec's virtual table type — KNN search natively in SQLite
- **`user_id` partition key**: filters by user during KNN without post-filtering
- **`fact_id`**: foreign key link to `facts` table

### KNN search query

```sql
SELECT fv.fact_id, fv.distance
FROM fact_vec fv
WHERE fv.embedding MATCH ? AND fv.user_id = ?
ORDER BY fv.distance
LIMIT ?;
```

Distance filtering (`maxDistance`) is applied in application code after the KNN query.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai/embeddings.ts` | Ollama client: `embedDocument`, `embedDocumentBatch`, `embedQuery`, `isOllamaAvailable` |
| `src/lib/db/db-embeddings.ts` | DB ops: `saveFactEmbedding`, `deleteFactEmbedding`, `searchFactsByEmbedding`, `getFactsWithoutEmbeddings` |
| `src/lib/db-local.ts:4-10` | Dynamic sqlite-vec loading (graceful if unavailable) |
| `src/lib/db/db-schema.ts:706-713` | `fact_vec` virtual table creation |
| `src/lib/db.ts` | Facade exports for embedding operations |
| `src/app/api/facts/search/route.ts` | Search API endpoint |
| `src/app/api/facts/route.ts` | PATCH re-embeds, DELETE cleans up embeddings |
| `src/workers/fact-extraction-worker.ts:118-125` | Embeds new facts after extraction |
| `src/app/(main)/me/page.tsx` | Search UI in Facts tab |
| `src/app/(main)/me/me.css` | Search input, slider, distance badge styles |
| `scripts/ensure-ollama.mjs` | Dev startup: ensures Ollama is running + model is pulled |
| `scripts/embed-facts.ts` | Backfill script for existing facts (batched) |
| `scripts/deploy/remote-setup.sh` | Production: installs Ollama + pulls model |
| `e2e/fact-search.spec.ts` | E2E tests: semantic search, empty state, strictness slider |

## Ollama Client (`src/lib/ai/embeddings.ts`)

```typescript
const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBEDDING_MODEL = 'nomic-embed-text:v1.5';
```

### Functions

| Function | Prefix | API | Use |
|----------|--------|-----|-----|
| `embedDocument(text)` | `search_document: ` | `POST /api/embeddings` | Embedding facts for storage |
| `embedDocumentBatch(texts)` | `search_document: ` | `POST /api/embed` | Backfill script (batched) |
| `embedQuery(text)` | `search_query: ` | `POST /api/embeddings` | Embedding search queries |
| `isOllamaAvailable()` | — | `GET /` | Health check (3s timeout) |

## DB Operations (`src/lib/db/db-embeddings.ts`)

Follows the `DbWrapper` pattern (same as `db-facts.ts`).

### `saveFactEmbedding(factId, userId, embedding)`
Upserts into `fact_vec` — deletes existing row then inserts (atomic replacement). Safe to call on existing facts.

### `deleteFactEmbedding(factId)`
Removes from `fact_vec`. Called when a fact is deleted.

### `searchFactsByEmbedding(userId, queryEmbedding, limit?, maxDistance?)`
1. KNN query on `fact_vec` with `MATCH` and partition key filter
2. Filter results by `maxDistance` (default 1.0)
3. Join with `facts` + `fact_extractions` for full details
4. Returns results in distance order with `{ id, fact, category, last_extracted_at, distance }`

### `getFactsWithoutEmbeddings(userId?)`
LEFT JOIN `facts` with `fact_vec` to find unembedded facts. Used by the backfill script.

## Embedding Lifecycle

### New facts (automatic)
`fact-extraction-worker.ts` → after `saveExtractedFactsForUser()`, each new fact is embedded via `embedDocument()` → `saveFactEmbedding()`. Wrapped in try/catch — embedding failure never fails the extraction job.

### Fact updated (PATCH `/api/facts`)
`route.ts` → after `updateFact()`, re-embeds with `embedDocument()` → `saveFactEmbedding()` (upsert). Embed-first pattern: if Ollama fails, old embedding stays intact.

### Fact deleted (DELETE `/api/facts`)
`route.ts` → after `deleteFact()`, calls `deleteFactEmbedding()`. Wrapped in try/catch.

### Backfill existing facts
```bash
npx tsx scripts/embed-facts.ts
# or
npm run embed-facts
```
Batches 50 facts at a time via `embedDocumentBatch()`. Idempotent — skips already-embedded facts.

## API

### `GET /api/facts/search`

| Param | Default | Description |
|-------|---------|-------------|
| `q` | required | Search query text |
| `limit` | 10 | Max results (1–50) |
| `max_distance` | 1.0 | Distance threshold (lower = stricter) |

**Response**: `{ results: [{ id, fact, category, last_extracted_at, distance }] }`

Returns 503 if Ollama is unavailable, 400 if `q` is missing, 401 if not authenticated.

## UI — /me Page Facts Tab

Search UI is rendered above the facts list:

- **Search input**: Magnifying glass icon, debounced (300ms), clear button
- **Strictness slider**: Range 0.5–1.5, step 0.1, default 1.0 — maps to `max_distance`
- **Results**: Replace the full fact list while a query is active. Each result shows category badge, fact text, distance score, and last extracted time
- **Empty state**: "No matching facts found" when query returns zero results
- **Loading state**: "Searching..." during API call

CSS classes: `.me-fact-search`, `.me-fact-search-input-wrap`, `.me-fact-search-slider`, `.me-fact-distance`, `.me-fact-time`

## sqlite-vec Loading

`db-local.ts` loads sqlite-vec dynamically via `require()` wrapped in try/catch. If the native binary isn't available (cloud mode, missing platform package), the DB still works — vector operations will just fail at query time with a table-not-found error. The `isOllamaAvailable()` check in the search API prevents queries from reaching sqlite-vec when Ollama is down.

```typescript
let sqliteVec = null;
try { sqliteVec = require("sqlite-vec"); } catch { /* warn */ }
// In getDb():
if (sqliteVec) { sqliteVec.load(db); }
```

## Ollama Lifecycle

### Development
`scripts/ensure-ollama.mjs` runs before `next dev` (via package.json `dev` script):
1. Checks if `ollama` CLI is installed (exits with boxed install instructions if not)
2. Starts `ollama serve` if not already running
3. Pulls `nomic-embed-text:v1.5` if not available

### Production
`scripts/deploy/remote-setup.sh` installs Ollama via official install script (sets up systemd service) and pulls the model.

## Chat Context Injection (RAG)

Every chat message triggers a RAG search to find the top 10 semantically relevant facts, which are injected into the conversation as context for the AI.

### Flow

```
User sends message
        │
        ▼
  chat-worker.ts: get last user message
        │
        ▼
  isOllamaAvailable() → embedQuery(message)
        │
        ▼
  searchFactsByEmbedding(userId, embedding, 10)
        │
        ▼
  injectContextMessages(..., { ragFacts })
        │
        ▼
  AI sees facts right before conversation messages
```

### Cache-Friendly Positioning

RAG facts change with every message (different query = different results). To preserve prompt caching of stable context, they are injected **right before** the conversation messages — not at the beginning with other context.

**Message order in the AI request:**
```
[events] [timezone] [fact sheet] [recent convos] [memory] [docs]  ← cached prefix (stable)
[RAG facts user msg] [RAG facts ack]                               ← dynamic (changes per message)
[conversation messages...]                                         ← user's chat history
```

The `splice(result.length - messages.length)` approach inserts RAG facts at the boundary between stable context and conversation messages.

### Prompt Wording

The RAG facts prompt (`buildRagFactsContextPrompt` in `system-prompts.ts`) includes:
- Header: "POSSIBLY RELATED FACTS (Semantic search results based on the current message)"
- Each fact with `[category]`, text, and `(last extracted: <time>)` if available
- Strict disclaimer: "These facts were found via semantic text matching and could be completely unrelated to the current question — do NOT assume relevance. Only use a fact if it clearly and directly applies."

### Key Implementation Details

- **Wrapped in try/catch** — RAG failure never breaks chat (`chat-worker.ts:108-116`)
- **Ollama check first** — skips entirely if Ollama is unavailable
- **10 fact limit** — hardcoded in `searchFactsByEmbedding` call
- **No maxDistance filter** — uses default 1.0 from `searchFactsByEmbedding`
- **Lower priority than fact sheet** — fact sheet is in the cached prefix (closer to system prompt), RAG facts are near the end

### Files

| File | Role |
|------|------|
| `src/workers/chat-worker.ts:106-116` | RAG search before context injection |
| `src/lib/ai/context.ts:128-143` | Splice-based injection before conversation messages |
| `src/lib/ai/system-prompts.ts:239-251` | `buildRagFactsContextPrompt()` |
| `e2e/fact-search.spec.ts:217-248` | E2E test verifying AI uses RAG facts in chat |

## Common Modifications

### Changing the embedding model
Edit `EMBEDDING_MODEL` in `src/lib/ai/embeddings.ts:2`. Update the dimension in `db-schema.ts` `fact_vec` table if the new model uses different dimensions. Re-run `npm run embed-facts` to re-embed all facts.

### Adjusting search strictness default
Change the default `maxDistance` parameter in `searchFactsByEmbedding()` (db-embeddings.ts:33) and the slider default in `me/page.tsx`.

### Adding embedding to a new entity
Follow the `db-embeddings.ts` pattern: create a new vec0 virtual table, add embed-on-save logic, add a search function, wire through `db.ts`.

### Changing the Ollama URL
Set `OLLAMA_URL` environment variable (defaults to `http://localhost:11434`).
