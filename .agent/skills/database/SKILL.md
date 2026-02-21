---
name: Database
description: SQLite database setup, schema, modules, and configuration for local and cloud modes.
---

# Database

Brain uses **SQLite** for all data storage, via `better-sqlite3` (local file).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./brain.db` | Path for local database file |
| `TEST_MODE` | — | Set to `true` or `1` to use the test database |
| `TEST_DB_PATH` | `brain.test.db` | Path to the test database file |

## Local Mode

The default for development. Uses `better-sqlite3` with a single file (`brain.db`) in the project root. No configuration needed — the database file and schema are created automatically on first run.

SQLite pragmas enabled:
- `journal_mode = WAL` — Write-Ahead Logging for better concurrency
- `foreign_keys = ON` — Enforce foreign key constraints

The `sqlite-vec` extension is loaded when available for vector search support.

## Testing

Tests use a separate database (`brain.test.db`) so they don't touch production data. Both variables are set in `.env.test`:

```env
TEST_MODE=true
TEST_DB_PATH=brain.test.db
```

## Schema

Schema is defined in `src/lib/db/db-schema.ts` and initialized automatically via `initializeSchema()` on first access. Uses `CREATE TABLE IF NOT EXISTS` for safe initialization.

Migrations are handled inline in the same file using `ALTER TABLE` statements with try/catch (no separate migration system).

### Tables

| Table | Description |
|---|---|
| `users` | User accounts (email, password) |
| `folders` | Organization folders for conversations and documents |
| `conversations` | Chat conversations with settings (AI provider, grounding, response mode) |
| `messages` | Chat messages with thinking/thoughts support |
| `documents` | User documents |
| `document_snapshots` | Version history for documents |
| `conversation_documents` | Many-to-many: conversations ↔ documents |
| `file_attachments` | Files attached to messages |
| `events` | Calendar events with recurrence |
| `events_fts` | Full-text search virtual table for events |
| `user_memory` | User memory/notes |
| `user_kv_store` | Key-value store for user preferences |
| `shared_links` | Shared links for conversations, documents, snapshots |
| `jobs` | Background job tracking |
| `job_events` | Streaming events for jobs |
| `job_queue` | Job queue with priority and claiming |
| `facts` | Knowledge facts with categories |
| `fact_extractions` | Many-to-many: facts ↔ conversations |
| `fact_sheets` | Aggregated fact sheets with dedup log |
| `fact_vec` | Vector embeddings for semantic search (sqlite-vec virtual table) |

## Architecture

### DbWrapper

Both local and cloud modules export a `dbWrapper` conforming to the `DbWrapper` interface (`src/lib/db/db-types.ts`). This provides a common async API:

- `prepare(sql)` → returns `{ all(), get(), run() }` (all async)
- `exec(sql)` — execute raw SQL
- `transaction(fn)` — wrap operations in a transaction

Note: `better-sqlite3` is synchronous under the hood. The async wrapper provides API consistency.

### Module Organization

All database operations live in `src/lib/db/` and are re-exported through `src/lib/db.ts` as the public facade. Each module receives `dbWrapper` and `ensureInitialized` as parameters.

| Module | Domain |
|---|---|
| `db-schema.ts` | Schema creation and migrations |
| `db-types.ts` | TypeScript interfaces |
| `db-users.ts` | User CRUD |
| `db-conversations.ts` | Conversations, messages, sidebar |
| `db-folders.ts` | Folder management |
| `db-documents.ts` | Document management |
| `db-events.ts` | Calendar events |
| `db-attachments.ts` | File attachments |
| `db-snapshots.ts` | Document snapshots |
| `db-shared-links.ts` | Shared links |
| `db-memory.ts` | User memory |
| `db-facts.ts` | Fact storage and extraction |
| `db-fact-sheets.ts` | Fact sheet aggregation |
| `db-jobs.ts` | Job system operations |
| `db-embeddings.ts` | Vector embeddings (sqlite-vec) |
| `db-kv.ts` | Key-value store |

### Adding a New Table

1. Add `CREATE TABLE IF NOT EXISTS` in `src/lib/db/db-schema.ts`
2. Create a new `src/lib/db/db-<name>.ts` module with operations
3. Import and re-export functions from `src/lib/db.ts`
4. Add TypeScript types to `src/lib/db/db-types.ts` if needed

## Key Files

- `src/lib/db.ts` — Main facade, re-exports all operations
- `src/lib/db-local.ts` — SQLite connection (better-sqlite3)
- `src/lib/db/db-schema.ts` — Schema definitions and inline migrations
- `src/lib/db/db-types.ts` — TypeScript interfaces (DbWrapper, row types)

## Backup

```bash
sqlite3 brain.db ".backup backup.db"
```
