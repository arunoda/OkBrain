/**
 * Worker Registry
 *
 * Starts all registered workers when the app initializes.
 * Import this module and call startWorkers() to start all workers.
 */

import { runWorker, getRegisteredWorkers, cleanupStaleJobs } from './index';
import { v4 as uuidv4 } from 'uuid';

const WORKER_ID_PREFIX = `worker-${uuidv4().slice(0, 8)}`;

// Track if workers have been started
let workersStarted = false;

export async function startWorkers() {
  if (workersStarted) {
    return;
  }
  workersStarted = true;

  // Clean up any jobs that were running when app restarted
  try {
    const staleCount = await cleanupStaleJobs();
    if (staleCount > 0) {
      console.log(`[Workers] Cleaned up ${staleCount} stale job(s) from previous run`);
    }
  } catch (error) {
    console.error('[Workers] Error cleaning up stale jobs:', error);
  }

  const workers = getRegisteredWorkers();
  console.log(`[Workers] Starting ${workers.length} registered workers...`);

  for (const worker of workers) {
    const workerId = `${WORKER_ID_PREFIX}-${worker.jobType}`;

    runWorker({
      workerId,
      jobType: worker.jobType,
      pollIntervalMs: worker.pollIntervalMs ?? 100,
      maxConcurrency: worker.maxConcurrency ?? 1,
      onJob: worker.onJob,
      onError: worker.onError ?? ((error, job) => {
        console.error(`[Worker ${workerId}] Error processing job ${job?.jobId}:`, error);
      })
    });

    console.log(`[Workers] Started worker for job type: ${worker.jobType}`);
  }
}
