---
name: Job System
description: A background job system with streaming support for long-running tasks.
---

# Job System

The job system enables background processing of long-running tasks with real-time streaming of events. Jobs are processed by workers that poll for new work.

## Core Concepts

- **Job**: A task container with a type, state, and event history
- **Worker**: A processor that claims and executes jobs of a specific type
- **Events**: Streaming outputs from a job (input, output, thought, status)
- **Queue**: Jobs are queued and claimed atomically by workers

## Job States

| State | Description |
|-------|-------------|
| `idle` | Job created, not yet started |
| `running` | Job is being processed by a worker |
| `stopping` | Stop requested, worker will exit gracefully |
| `stopped` | Job was stopped before completion |
| `succeeded` | Job completed successfully |
| `failed` | Job failed with an error |

## API Endpoints

### Create a Job
```
POST /api/jobs
Body: { type: string, id?: string }
Response: { id, type, user_id, state, last_seq, created_at, updated_at }
```

### Get Job Details
```
GET /api/jobs/:jobId
Response: { id, type, user_id, state, last_seq, ... }
```

### Start a Job
```
POST /api/jobs/:jobId/start
Body: { input: any, priority?: number }
Response: { ...job, queueId, inputSeq }
```
- Returns 409 if job is already running or stopping

### Stop a Job
```
POST /api/jobs/:jobId/stop
Response: { ...job, state: 'stopping' }
```

### Get Job History
```
GET /api/jobs/:jobId/history?since_seq=0
Response: { events: [...], next_seq: number }
```

### Stream Job Events (SSE)
```
GET /api/jobs/:jobId/stream?since_seq=0
Response: Server-Sent Events stream
```

## Ownership

Jobs have a `user_id` field for ownership:
- When authenticated, jobs are created with the current user's ID
- Only the owner can access/modify their jobs (returns 404 for others)
- Jobs without a `user_id` (null) are accessible by anyone

## Creating a Worker

Workers process jobs by registering handlers in `src/workers/`:

```typescript
// src/workers/my-worker.ts
import { registerWorker, ClaimedJob, WorkerContext } from '../lib/jobs';

async function handleJob(job: ClaimedJob, ctx: WorkerContext): Promise<void> {
  // job.jobId - the job ID
  // job.input - the input payload from startJob

  // Emit output events (persisted to DB)
  await ctx.emit('output', { text: 'Processing...' });

  // Emit status (ephemeral, for progress updates)
  ctx.status({ phase: 'working', progress: 50 });

  // Check if stop was requested
  if (await ctx.stopRequested()) {
    await ctx.emit('output', { text: '[Stopped]', final: true });
    await ctx.complete(true);
    return;
  }

  // Mark job as complete
  await ctx.complete(true); // true = success, false = failed
}

registerWorker({
  jobType: 'my-job-type',
  pollIntervalMs: 1000,
  onJob: handleJob,
  onError: (error, job) => console.error('Job failed:', error)
});
```

Workers must be imported in `src/instrumentation.ts` to be registered at startup.

## WorkerContext Methods

| Method | Description |
|--------|-------------|
| `emit(kind, payload)` | Emit a persistent event (stored in DB) |
| `status(payload)` | Emit ephemeral status (streaming only, not stored) |
| `stopRequested()` | Check if job should stop gracefully |
| `complete(success)` | Mark job as completed |

## Event Kinds

| Kind | Description |
|------|-------------|
| `input` | The input that started the job |
| `output` | Worker output (text, data, etc.) |
| `thought` | Internal reasoning/thinking |
| `status` | Progress updates (ephemeral) |

## Example: Using the Job System

```typescript
// 1. Create a job
const response = await fetch('/api/jobs', {
  method: 'POST',
  body: JSON.stringify({ type: 'my-job-type' })
});
const job = await response.json();

// 2. Start the job with input
await fetch(`/api/jobs/${job.id}/start`, {
  method: 'POST',
  body: JSON.stringify({ input: { message: 'Hello!' } })
});

// 3. Stream events
const eventSource = new EventSource(`/api/jobs/${job.id}/stream`);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.done) {
    eventSource.close();
    return;
  }
  console.log('Event:', data.kind, data.payload);
};

// 4. Or poll history
const history = await fetch(`/api/jobs/${job.id}/history`).then(r => r.json());
console.log('Events:', history.events);

// 5. Stop the job if needed
await fetch(`/api/jobs/${job.id}/stop`, { method: 'POST' });
```

## SSR Resume Pattern

When a page is reloaded during an active job, you can resume streaming from where it left off. This pattern uses JSONL log files as the source of truth during streaming.

### 1. Store Active Job ID

Store the job ID on the parent resource (e.g., conversation) when starting:

```typescript
// In API route (e.g., /api/chat or /api/summarize)
const job = await createJob('my-job-type', undefined, userId);
await startJob(job.id, jobInput);

// Store for SSR resume
await setConversationActiveJob(userId, conversationId, job.id);
```

### 2. Emit Init Event with Metadata

Workers should emit an init event with any metadata needed for resume (e.g., role):

```typescript
// In worker
await ctx.emit('output', {
  type: 'init',
  conversationId,
  model: ai.getModelName(),
  role: 'summary',  // Optional: helps SSR know the message type
});
```

### 3. Clear Active Job on Completion

Clear the active job ID when the worker completes:

```typescript
// In worker, before ctx.complete()
await setConversationActiveJob(userId, conversationId, null);
await ctx.complete(true);
```

### 4. SSR Page Resume

On page load, read from the log file and pass accumulated state to the component:

```typescript
// In page.tsx (server component)
import { getJob, readLogSince } from '@/lib/jobs';

if (conversation.active_job_id) {
  const activeJob = await getJob(conversation.active_job_id);

  // Only resume if job is still running
  if (activeJob && (activeJob.state === 'running' || activeJob.state === 'idle')) {
    const events = readLogSince(activeJob.id, 0);

    // Extract metadata from init event, with job type fallback
    // (init event may not be available yet due to timing)
    const initEvent = events.find(e =>
      e.kind === 'output' && e.payload?.type === 'init'
    );
    const role = initEvent?.payload?.role === 'summary' || activeJob.type === 'summarize'
      ? 'summary'
      : 'assistant';

    // Accumulate output text
    const content = events
      .filter(e => e.kind === 'output')
      .map(e => e.payload?.text || '')
      .join('');

    // Track last sequence for reconnection
    const lastSeq = events.length > 0 ? events[events.length - 1].seq : 0;

    // Pass to component
    return <ChatView
      initialActiveJobId={activeJob.id}
      initialStreamingContent={content}
      initialStreamingRole={role}
      initialLastSeq={lastSeq}
    />;
  }
}
```

### 5. Client Reconnection

The client component reconnects to the stream using `since_seq` to avoid replaying events:

```typescript
// Connect starting from where SSR left off
const eventSource = new EventSource(
  `/api/jobs/${jobId}/stream?since_seq=${lastSeq}`
);
```

### Key Points

- **JSONL logs** are the source of truth during streaming (not DB)
- Use `readLogSince(jobId, seq)` to read accumulated events
- Pass `since_seq` parameter to EventSource to avoid replaying
- Workers emit metadata in init event for SSR to determine message type
- Use job type as fallback when init event not yet available (timing edge case)
- Clear active job ID on all completion paths (success, error, stopped)

## Database Schema

```sql
-- Jobs table
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT,
  state TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  last_input_seq INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME,
  updated_at DATETIME
);

-- Job events (history)
CREATE TABLE job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at DATETIME
);

-- Job queue (for worker claiming)
CREATE TABLE job_queue (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  input TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  claimed_by TEXT,
  claimed_at DATETIME,
  created_at DATETIME,
  updated_at DATETIME
);
```

## Key Files

- `src/lib/jobs/index.ts` - Main job system API
- `src/lib/jobs/workers.ts` - Worker startup logic
- `src/lib/jobs/log.ts` - Log file utilities for streaming
- `src/lib/db/db-jobs.ts` - Database operations
- `src/workers/` - Worker implementations
- `src/app/api/jobs/` - API routes
