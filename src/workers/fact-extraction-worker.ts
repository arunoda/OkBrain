/**
 * Fact Extraction Worker
 *
 * Processes fact-extraction jobs triggered periodically.
 * Finds eligible conversations (updated in last 2 days with new messages)
 * and extracts facts from them using AI.
 */

import { registerWorker, ClaimedJob, WorkerContext } from '../lib/jobs';
import {
  getConversationsForFactExtraction,
  getLatestFactSheet,
  getRecentFacts,
  updateConversationFactExtractedAt,
} from '../lib/db';
import type { FactSheetEntry } from '../lib/db';
import {
  extractFactsForUser,
  saveExtractedFactsForUser,
} from '../lib/ai/facts';
import type { ExistingFactRef } from '../lib/ai/facts';
import { generateAndSaveFactSheet } from '../lib/ai/fact-sheet';
import { embedDocument } from '../lib/ai/embeddings';
import { saveFactEmbedding } from '../lib/db';

const LOG_PREFIX = '[FactExtraction]';

async function handleFactExtractionJob(job: ClaimedJob, ctx: WorkerContext): Promise<void> {
  console.log(`${LOG_PREFIX} Job ${job.jobId} started`);

  const conversations = await getConversationsForFactExtraction();

  if (conversations.length === 0) {
    console.log(`${LOG_PREFIX} No eligible conversations found`);
    await ctx.emit('output', { message: 'No eligible conversations' });
    await ctx.complete(true);
    return;
  }

  // Group by user_id
  const byUser = new Map<string, typeof conversations>();
  for (const conv of conversations) {
    const list = byUser.get(conv.user_id) || [];
    list.push(conv);
    byUser.set(conv.user_id, list);
  }

  console.log(`${LOG_PREFIX} Found ${conversations.length} conversations for ${byUser.size} users`);

  let totalNew = 0;
  let totalUpvoted = 0;
  let totalProcessed = 0;
  let conversationIndex = 0;

  for (const [userId, userConversations] of byUser) {
    console.log(`${LOG_PREFIX} Processing user ${userId}: ${userConversations.length} conversations`);

    // Load existing facts for deduplication: fact sheet (top scored) + recent facts
    // This avoids sending ALL facts to the AI while covering important + recent ones
    const existingFactRefs: ExistingFactRef[] = [];
    const seenIds = new Set<string>();

    // 1. Load fact sheet entries (top 100 scored facts with IDs)
    const factSheet = await getLatestFactSheet(userId);
    if (factSheet) {
      const entries: FactSheetEntry[] = JSON.parse(factSheet.facts_json);
      for (const entry of entries) {
        if (entry.id && !seenIds.has(entry.id)) {
          existingFactRefs.push({ id: entry.id, category: entry.category, fact: entry.fact });
          seenIds.add(entry.id);
        }
      }
    }

    // 2. Load recent 30 facts (catches newly created facts not yet in the sheet)
    const recentFacts = await getRecentFacts(userId, 30);
    for (const f of recentFacts) {
      if (!seenIds.has(f.id)) {
        existingFactRefs.push({ id: f.id, category: f.category, fact: f.fact });
        seenIds.add(f.id);
      }
    }

    for (const conv of userConversations) {
      conversationIndex++;

      if (await ctx.stopRequested()) {
        console.log(`${LOG_PREFIX} Stop requested, aborting`);
        await ctx.complete(true);
        return;
      }

      ctx.status({ message: `Processing conversation ${conversationIndex}/${conversations.length}` });
      console.log(`${LOG_PREFIX} Extracting facts from conversation ${conv.id}...`);

      try {
        const extraction = await extractFactsForUser(userId, conv.id, existingFactRefs);

        if (extraction.results.length === 0) {
          console.log(`${LOG_PREFIX} Conversation ${conv.id}: no facts found`);
          // Still update the timestamp so we don't re-process
          await updateConversationFactExtractedAt(conv.id);
          totalProcessed++;
          continue;
        }

        const saved = await saveExtractedFactsForUser(userId, conv.id, extraction.results);

        const newCount = saved.filter((s) => s.action === 'new').length;
        const referencedCount = saved.filter((s) => s.action === 'referenced').length;
        totalNew += newCount;
        totalUpvoted += referencedCount;
        totalProcessed++;

        console.log(`${LOG_PREFIX} Conversation ${conv.id}: ${newCount} new facts, ${referencedCount} referenced`);

        // Embed newly created facts
        for (const s of saved) {
          if (s.action === 'new') {
            try {
              const embedding = await embedDocument(s.fact.fact);
              await saveFactEmbedding(s.fact.id, userId, embedding);
            } catch (embedError) {
              console.error(`[FactEmbedding] Failed to embed fact ${s.fact.id}:`, embedError);
            }
          }
        }

        // Update existing facts refs for next conversation (include newly added facts)
        for (const s of saved) {
          if (s.action === 'new') {
            existingFactRefs.push({
              id: s.fact.id,
              category: s.fact.category,
              fact: s.fact.fact,
            });
          }
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Error processing conversation ${conv.id}:`, error);
        totalProcessed++;
      }
    }

    // Generate fact sheet after processing all conversations for this user
    try {
      await generateAndSaveFactSheet(userId);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error generating fact sheet for user ${userId}:`, error);
    }
  }

  console.log(`${LOG_PREFIX} Done. Processed ${totalProcessed} conversations, ${totalNew} new facts, ${totalUpvoted} referenced`);

  await ctx.emit('output', {
    processed: totalProcessed,
    newFacts: totalNew,
    referenced: totalUpvoted,
  });

  await ctx.complete(true);
}

registerWorker({
  jobType: 'fact-extraction',
  pollIntervalMs: 500,
  maxConcurrency: 1,
  onJob: handleFactExtractionJob,
  onError: (error, job) => {
    console.error(`${LOG_PREFIX} Job failed:`, error, job?.jobId);
  },
});
