---
name: Recent Conversations
description: Bridges the gap between conversations and fact extraction by injecting recent conversation context into chat.
---

# Recent Conversations

Injects conversations that happened **after the last fact-sheet generation** into chat context (max 5). Once the fact sheet regenerates, those conversations automatically drop out — zero redundancy with the fact system.

## Architecture Overview

```
Chat message received
        │
        ▼
  chat-worker.ts
        │  loads latest fact sheet → gets created_at timestamp
        │  queries conversations updated after that timestamp
        ▼
  getRecentConversationsWithUserMessages()
        │  up to 5 conversations (excluding current)
        │  up to 5 user messages per conversation
        │  truncated to 500 chars each
        ▼
  injectContextMessages()
        │  injected as user/assistant message pair
        │  lower priority than facts and user memory
        ▼
  AI receives context
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/db/db-conversations.ts:344-393` | `getRecentConversationsWithUserMessages()` DB query |
| `src/lib/db.ts:176-178` | Facade wrapper |
| `src/lib/ai/system-prompts.ts:218-232` | `buildRecentConversationsPrompt()` formatter |
| `src/lib/ai/system-prompts.ts:240` | `buildContextAcknowledgement('recentConversations')` |
| `src/lib/ai/context.ts:22` | `recentConversations` in `AIContext` interface |
| `src/lib/ai/context.ts:73-83` | Injection block in `injectContextMessages()` |
| `src/workers/chat-worker.ts:96-100` | Wiring: loads recent convos using fact sheet timestamp |
| `e2e/recent-conversations.spec.ts` | E2E tests |

## DB Query (`getRecentConversationsWithUserMessages`)

**Parameters:**
- `userId` — current user
- `excludeConversationId` — current conversation (excluded from results)
- `sinceDate?` — if provided, only conversations with `updated_at > sinceDate`; if omitted, returns last 5
- `limit` — max conversations (default 5)

**Returns:** `Array<{ id, title, userMessages: string[] }>`

**Behavior:**
- Queries conversations ordered by `updated_at DESC`
- For each, fetches last 5 user-role messages (`ORDER BY created_at DESC LIMIT 5`)
- Truncates messages longer than 500 chars
- Skips conversations with no user messages

## Context Injection

### Injection Order (earliest → latest in conversation)

1. Events context
2. Timezone instructions
3. **Recent Conversations** ← injected here
4. User Facts (from fact sheet)
5. User Memory
6. Documents
7. Original messages

Being earlier in the list means lower priority — facts and user memory take precedence.

### Prompt Format

```
RECENT CONVERSATIONS (Last few conversations for context):

[Conversation Title]
- user message 1
- user message 2

[Another Title]
- user message 1

(Use for context continuity, but don't proactively reference unless the user brings up a related topic.)
```

## Fact Sheet Integration

The `sinceDate` parameter is set to `factSheet.created_at` from `getLatestFactSheet(userId)`. This means:

- **Fact sheet exists:** Only conversations updated after the sheet was generated are included
- **No fact sheet:** Falls back to last 5 conversations (no date filter)
- **Fact sheet regenerates:** Previously "recent" conversations drop out automatically

## E2E Tests (`e2e/recent-conversations.spec.ts`)

1. **No fact sheet** — Seeds conversations, starts chat, verifies AI references recent topics
2. **Filters by fact sheet date** — Seeds old conversations + fact sheet + new conversations, verifies only post-fact-sheet topics appear

### Seeding Helpers

- `seedConversationsWithMessages(userId, conversations)` — creates conversations with titles, messages, and optional `updatedAt` timestamps
- `seedFactSheet(userId, createdAt)` — inserts a fact sheet row with controlled `created_at`

## Common Modifications

### Changing max conversations
Edit the `limit` default (5) in `getRecentConversationsWithUserMessages()` in `src/lib/db/db-conversations.ts`.

### Changing max messages per conversation
Edit the `LIMIT 5` in the messages sub-query in `getRecentConversationsWithUserMessages()`.

### Changing message truncation length
Edit the `500` char check in the `map` call in `getRecentConversationsWithUserMessages()`.

### Changing injection priority
Move the injection block in `src/lib/ai/context.ts` relative to the other `unshift` blocks. Earlier `unshift` = lower priority.
