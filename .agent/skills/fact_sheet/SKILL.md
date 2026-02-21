---
name: Fact Sheet
description: Scored fact sheet generation — scoring, assembly, context injection, UI, and periodic regeneration after extraction.
---

# Fact Sheet Generation

After each fact extraction cycle, the system generates a scored "fact sheet" — a curated top-100 list of facts ranked by category weight and recency. Chat and highlights workers use this instead of raw facts.

## Architecture Overview

```
Fact Extraction Worker (per user, after all conversations)
        │
        ▼
  generateAndSaveFactSheet(userId)
        │
        ├─ getUserFacts()                 ──► all facts from DB
        ├─ getRecentFactExtractions(1200) ──► recent extraction refs
        ├─ computeReferenceScores()       ──► time-decay scoring
        ├─ scoreFacts()                   ──► category weight × ref score
        ├─ assembleFacts()                ──► top 100 with category limits
        └─ saveFactSheet()               ──► fact_sheets table
                                          └─ deleteOldFactSheets() (7-day retention)

Usage:
  fact-extraction-worker (dedup)
        ├─ getLatestFactSheet(userId) → fact IDs for dedup
        ├─ getRecentFacts(userId, 30) → supplement with recent facts
        └─ Merge by ID → existingFactRefs for AI extraction

  chat-worker / highlights-worker (context injection)
        ├─ getLatestFactSheet(userId)
        ├─ Parse facts_json → FactSheetEntry[]
        └─ Pass to injectContextMessages({ facts })
```

## Database Schema

### `fact_sheets` table (`src/lib/db/db-schema.ts`)

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT FK | References users(id) ON DELETE CASCADE |
| facts_json | TEXT | JSON stringified `FactSheetEntry[]` |
| dedup_log | TEXT | JSON array of dropped fact IDs (nullable) |
| fact_count | INTEGER | Count of facts in sheet |
| created_at | DATETIME | Auto-set |

Index: `(user_id, created_at DESC)`

### Types (`src/lib/db/db-types.ts`)

```typescript
interface FactSheet { id, user_id, facts_json, dedup_log, fact_count, created_at }
interface FactSheetEntry { id: string; category: string; fact: string; score: number }
```

The `id` field references the original fact ID from the `facts` table. This allows the fact extraction worker to use fact sheet entries directly for deduplication.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai/fact-sheet.ts` | Core generation: scoring, assembly, main `generateAndSaveFactSheet()` |
| `src/lib/db/db-fact-sheets.ts` | DB operations: save, get latest, delete old, get extractions |
| `src/lib/db/db-types.ts` | `FactSheet` and `FactSheetEntry` types |
| `src/workers/fact-extraction-worker.ts` | Triggers generation after extraction (line ~111) |
| `src/workers/chat-worker.ts` | Loads fact sheet for chat context (lines 87-94) |
| `src/workers/highlights-worker.ts` | Loads fact sheet for highlights context (lines 77-85) |
| `src/app/api/fact-sheet/route.ts` | GET API for /me page |
| `src/app/api/fact-sheet/generate/route.ts` | Test-only POST trigger |
| `src/app/(main)/me/page.tsx` | Fact Sheet tab in /me page |
| `e2e/fact-sheet.spec.ts` | E2E tests for scoring, assembly, pipeline, UI |

## Scoring Algorithm (`src/lib/ai/fact-sheet.ts`)

```
score = categoryWeight × referenceScore
```

### Category Weights (line 16-21)

| Category | Weight |
|----------|--------|
| core | 10 |
| technical | 6 |
| project | 4 |
| transient | 2 |

### Time-Decay Points (`getDecayPoints()`, lines 36-45)

Each `fact_extractions` record contributes points based on age:

| Age | Points |
|-----|--------|
| < 1 hour | 10 |
| < 6 hours | 8 |
| < 24 hours | 6 |
| < 3 days | 4 |
| < 7 days | 3 |
| < 14 days | 2 |
| < 30 days | 1 |
| >= 30 days | 0.5 |

Reference score = sum of all extraction points per fact. A fact mentioned 3 times today = `3 × 10 = 30`. One mentioned once two weeks ago = `1 × 1 = 1`.

### Category Slot Limits (lines 24-29)

| Category | Min (guaranteed) | Max (cap) |
|----------|------------------|-----------|
| core | 5 | 30 |
| technical | 3 | 25 |
| project | 3 | 25 |
| transient | 20 | 40 |

Total max: 100 facts per sheet.

### Assembly Process (`assembleFacts()`, lines 170-248)

1. Group facts by category, sort each by score descending
2. Take minimum guaranteed facts per category
3. Fill up to max per category with next highest-scored
4. Fill remaining slots (up to 100) with highest-scored across all categories
5. Final sort: category order (core → technical → project → transient), then score descending

## AI Dedup — DISABLED

The `aiDedupFacts()` function exists in code (lines 52-126) but is not called.

**Reason:** With ~60 facts, Grok reasoning spends ~8800 output tokens to drop just 1 fact, costing ~$0.009 per run. Runs every 30 min per user — adds up with minimal value.

**Re-enable when:** A cheaper model is available, or we switch to a batch/offline approach (e.g. daily).

**Design:** Sends all facts (with category labels) to AI for cross-category dedup. Can catch contradictions like "Prefers Brain" vs "Avoids Brain" across categories.

## DB Operations (`src/lib/db/db-fact-sheets.ts`)

| Function | Purpose |
|----------|---------|
| `saveFactSheet(id, userId, factsJson, dedupLog, factCount)` | Insert new sheet |
| `getLatestFactSheet(userId)` | Most recent sheet (`ORDER BY created_at DESC LIMIT 1`) |
| `deleteOldFactSheets(userId)` | Remove sheets older than 7 days |
| `getRecentFactExtractions(userId, limit)` | Get recent extraction refs for scoring |

## Context Injection

Chat worker and highlights worker load the latest fact sheet:

```typescript
const factSheet = await getLatestFactSheet(userId);
if (factSheet) {
  const entries: FactSheetEntry[] = JSON.parse(factSheet.facts_json);
  facts = entries.map(e => ({ category: e.category, fact: e.fact }));
}
```

Facts are passed to `injectContextMessages()` and formatted by `buildFactsContextPrompt()` in `src/lib/ai/system-prompts.ts`.

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/fact-sheet` | Session | Latest fact sheet with metadata |
| POST | `/api/fact-sheet/generate` | Session + TEST_MODE | Manual generation trigger |

GET response: `{ facts: FactSheetEntry[], created_at, fact_count, dedup_log }`

## UI — /me Page Fact Sheet Tab

`src/app/(main)/me/page.tsx` — Third tab alongside Memory and Facts.

- Lazy-loaded from `/api/fact-sheet` when tab clicked
- Shows category badges (`.me-fact-badge-{category}`) and scores (`.me-fact-score`)
- Meta info: fact count and generation timestamp (`.me-fact-sheet-meta`)
- Empty state when no sheet exists (`.me-empty-state`)

## E2E Tests (`e2e/fact-sheet.spec.ts`)

| Test Suite | Tests |
|------------|-------|
| Scoring & Assembly | Correct scoring by recency, category max limits, DB structure |
| Extraction Pipeline | End-to-end: seed messages → extract → verify sheet generated |
| UI | Empty state display, fact sheet with scores and categories |

Helper functions: `seedFacts()`, `seedFactExtractions()`, `getFactSheetFromDb()`, `seedFactSheet()`, `seedChatMessages()` — all use direct DB access via `better-sqlite3`.

## Common Modifications

### Adjusting category weights
Edit `CATEGORY_WEIGHTS` in `src/lib/ai/fact-sheet.ts:16-21`.

### Changing category slot limits
Edit `CATEGORY_LIMITS` in `src/lib/ai/fact-sheet.ts:24-29`.

### Changing max facts per sheet
Edit `MAX_FACTS` in `src/lib/ai/fact-sheet.ts:31`.

### Re-enabling AI dedup
In `generateAndSaveFactSheet()` (~line 263), replace the disabled block with:
```typescript
const droppedIds = await aiDedupFacts(allFacts);
```

### Changing retention period
Edit the `'-7 days'` in `deleteOldFactSheets()` in `src/lib/db/db-fact-sheets.ts`.
