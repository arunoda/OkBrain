import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { randomUUID } from 'crypto';
import {
  getUserFacts,
  getRecentFactExtractions,
  saveFactSheet,
  deleteOldFactSheets,
} from '@/lib/db';
import type { Fact, FactSheetEntry } from '@/lib/db';
import { logXAIUsage } from './adapters/xai-adapter';

const LOG_PREFIX = '[FactSheet]';

// Category weights for scoring
const CATEGORY_WEIGHTS: Record<string, number> = {
  core: 10,
  technical: 6,
  project: 4,
  transient: 2,
};

// Category slot limits
const CATEGORY_LIMITS: Record<string, { min: number; max: number }> = {
  core: { min: 5, max: 30 },
  technical: { min: 3, max: 25 },
  project: { min: 3, max: 25 },
  transient: { min: 20, max: 40 },
};

const MAX_FACTS = 100;

/**
 * Compute time-decay points for a fact extraction based on age.
 */
function getDecayPoints(hoursAgo: number): number {
  if (hoursAgo < 1) return 10;
  if (hoursAgo < 6) return 8;
  if (hoursAgo < 24) return 6;
  if (hoursAgo < 72) return 4;   // 3 days
  if (hoursAgo < 168) return 3;  // 7 days
  if (hoursAgo < 336) return 2;  // 14 days
  if (hoursAgo < 720) return 1;  // 30 days
  return 0.5;
}

/**
 * AI dedup of all facts — asks Grok which ones to drop.
 * Only runs when >5 facts exist.
 * Returns array of dropped fact IDs.
 */
async function aiDedupFacts(
  facts: Fact[]
): Promise<string[]> {
  if (facts.length <= 5) {
    return [];
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.warn(`${LOG_PREFIX} XAI_API_KEY not set, skipping AI dedup`);
    return [];
  }

  const factsList = facts
    .map((f, i) => `[${i}] (${f.category}) ${f.fact}`)
    .join('\n');

  const prompt = `You are a fact deduplication engine. Below is a list of facts about a user, organized by category (core, technical, project, transient). Some may be outdated or superseded by newer/more accurate facts — even across categories.

Your task: identify which facts should be DROPPED because they are superseded, contradicted, or made redundant by another fact in the list. Only drop facts that are clearly redundant or outdated — when in doubt, keep them.

Facts:
${factsList}

Respond with ONLY a valid JSON object: {"drop": [0, 2, 5]} where the values are the INDEX numbers of facts to drop. If nothing should be dropped, respond with {"drop": []}.`;

  try {
    const xai = createOpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey,
    });

    const result = streamText({
      model: xai('grok-4-1-fast-reasoning'),
      messages: [{ role: 'user', content: prompt }],
    });

    let fullResponse = '';
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
    }

    const usage = await result.usage;
    if (usage) {
      logXAIUsage('FactSheetDedup', usage, 'grok-4-1-fast-reasoning');
    }

    // Parse response
    const cleaned = fullResponse.trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (parsed && Array.isArray(parsed.drop)) {
      const droppedIds: string[] = [];
      for (const idx of parsed.drop) {
        if (typeof idx === 'number' && idx >= 0 && idx < facts.length) {
          droppedIds.push(facts[idx].id);
        }
      }
      console.log(`${LOG_PREFIX} AI dedup: dropping ${droppedIds.length} facts`);
      return droppedIds;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} AI dedup failed, keeping all facts:`, error);
  }

  return [];
}

/**
 * Score all facts based on category weight and reference score from extractions.
 */
function scoreFacts(
  facts: Fact[],
  extractionsByFactId: Map<string, number>
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const fact of facts) {
    const categoryWeight = CATEGORY_WEIGHTS[fact.category] || 1;
    const referenceScore = extractionsByFactId.get(fact.id) || 0;
    scores.set(fact.id, categoryWeight * referenceScore);
  }

  return scores;
}

/**
 * Compute reference scores from raw extractions.
 */
function computeReferenceScores(
  extractions: { fact_id: string; created_at: string }[]
): Map<string, number> {
  const now = Date.now();
  const scoresByFact = new Map<string, number>();

  for (const ext of extractions) {
    const extTime = new Date(ext.created_at).getTime();
    const hoursAgo = (now - extTime) / (1000 * 60 * 60);
    const points = getDecayPoints(hoursAgo);

    const current = scoresByFact.get(ext.fact_id) || 0;
    scoresByFact.set(ext.fact_id, current + points);
  }

  return scoresByFact;
}

/**
 * Assemble the final fact sheet from scored facts.
 */
function assembleFacts(
  facts: Fact[],
  scores: Map<string, number>
): FactSheetEntry[] {
  // Group facts by category
  const byCategory = new Map<string, Fact[]>();
  for (const fact of facts) {
    const list = byCategory.get(fact.category) || [];
    list.push(fact);
    byCategory.set(fact.category, list);
  }

  // Sort each category by score descending
  for (const [cat, catFacts] of byCategory) {
    catFacts.sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));
    byCategory.set(cat, catFacts);
  }

  const selected: { fact: Fact; score: number }[] = [];
  const selectedIds = new Set<string>();

  // Step 1: Ensure min facts per category
  for (const [cat, limits] of Object.entries(CATEGORY_LIMITS)) {
    const catFacts = byCategory.get(cat) || [];
    const toTake = Math.min(limits.min, catFacts.length);
    for (let i = 0; i < toTake; i++) {
      selected.push({ fact: catFacts[i], score: scores.get(catFacts[i].id) || 0 });
      selectedIds.add(catFacts[i].id);
    }
  }

  // Step 2: Fill up to max per category
  for (const [cat, limits] of Object.entries(CATEGORY_LIMITS)) {
    if (selected.length >= MAX_FACTS) break;
    const catFacts = byCategory.get(cat) || [];
    const currentCount = selected.filter(s => s.fact.category === cat).length;
    const canAdd = Math.min(limits.max - currentCount, MAX_FACTS - selected.length);

    for (const fact of catFacts) {
      if (canAdd <= 0 || selected.filter(s => s.fact.category === cat).length >= limits.max) break;
      if (selected.length >= MAX_FACTS) break;
      if (!selectedIds.has(fact.id)) {
        selected.push({ fact, score: scores.get(fact.id) || 0 });
        selectedIds.add(fact.id);
      }
    }
  }

  // Step 3: Fill remaining slots with highest-scored facts across all categories
  if (selected.length < MAX_FACTS) {
    const remaining = facts
      .filter(f => !selectedIds.has(f.id))
      .sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));

    for (const fact of remaining) {
      if (selected.length >= MAX_FACTS) break;
      // Respect max limits
      const catCount = selected.filter(s => s.fact.category === fact.category).length;
      const limits = CATEGORY_LIMITS[fact.category];
      if (limits && catCount >= limits.max) continue;
      selected.push({ fact, score: scores.get(fact.id) || 0 });
      selectedIds.add(fact.id);
    }
  }

  // Sort final list by category then score
  const categoryOrder = ['core', 'technical', 'project', 'transient'];
  selected.sort((a, b) => {
    const catDiff = categoryOrder.indexOf(a.fact.category) - categoryOrder.indexOf(b.fact.category);
    if (catDiff !== 0) return catDiff;
    return b.score - a.score;
  });

  return selected.map(s => ({
    id: s.fact.id,
    category: s.fact.category,
    fact: s.fact.fact,
    score: Math.round(s.score * 100) / 100,
  }));
}

/**
 * Main function: generates and saves a fact sheet for a user.
 */
export async function generateAndSaveFactSheet(userId: string): Promise<void> {
  console.log(`${LOG_PREFIX} Generating fact sheet for user ${userId}`);

  // Get all facts for the user
  const allFacts = await getUserFacts(userId);
  if (allFacts.length === 0) {
    console.log(`${LOG_PREFIX} No facts found for user ${userId}, skipping`);
    return;
  }

  // AI dedup disabled for now — cost too high relative to value
  // TODO: re-enable when we have a cheaper model or batch approach
  const droppedIds: string[] = [];
  const survivingFacts = allFacts;

  // Get recent extractions for scoring
  const extractions = await getRecentFactExtractions(userId, 1200);

  // Compute reference scores
  const referenceScores = computeReferenceScores(extractions);

  // Score all surviving facts
  const scores = scoreFacts(survivingFacts, referenceScores);

  // Assemble top facts
  const entries = assembleFacts(survivingFacts, scores);

  // Save fact sheet
  const sheetId = randomUUID();
  const factsJson = JSON.stringify(entries);
  const dedupLog = droppedIds.length > 0 ? JSON.stringify(droppedIds) : null;

  await saveFactSheet(sheetId, userId, factsJson, dedupLog, entries.length);
  console.log(`${LOG_PREFIX} Saved fact sheet ${sheetId}: ${entries.length} facts (${droppedIds.length} deduped)`);

  // Clean up old fact sheets
  await deleteOldFactSheets(userId);
}
