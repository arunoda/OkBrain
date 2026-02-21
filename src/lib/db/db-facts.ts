import { DbWrapper, Fact } from './db-types';

export async function getUserFacts(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string
): Promise<Fact[]> {
  await ensureInitialized();
  const results = await dbWrapper.prepare(`
    SELECT f.id, f.user_id, f.category, f.fact, f.created_at,
           COUNT(fe.id) as extraction_count
    FROM facts f
    LEFT JOIN fact_extractions fe ON fe.fact_id = f.id
    WHERE f.user_id = ?
    GROUP BY f.id
    ORDER BY COALESCE(MAX(fe.created_at), f.created_at) DESC
  `).all(userId);
  return results as Fact[];
}

export async function getRecentFacts(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  limit: number = 30
): Promise<Fact[]> {
  await ensureInitialized();
  const results = await dbWrapper.prepare(`
    SELECT f.id, f.user_id, f.category, f.fact, f.created_at,
           COUNT(fe.id) as extraction_count
    FROM facts f
    LEFT JOIN fact_extractions fe ON fe.fact_id = f.id
    WHERE f.user_id = ?
    GROUP BY f.id
    ORDER BY f.created_at DESC
    LIMIT ?
  `).all(userId, limit);
  return results as Fact[];
}

export async function addFact(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  category: string,
  fact: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    INSERT INTO facts (id, user_id, category, fact)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, category, fact);
}

export async function deleteFact(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  factId: string
): Promise<void> {
  await ensureInitialized();
  // Delete associated extractions first, then the fact itself
  await dbWrapper.prepare(`
    DELETE FROM fact_extractions WHERE fact_id = ?
  `).run(factId);
  await dbWrapper.prepare(`
    DELETE FROM facts WHERE id = ? AND user_id = ?
  `).run(factId, userId);
}

export async function updateFact(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  factId: string,
  category: string,
  fact: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    UPDATE facts SET category = ?, fact = ? WHERE id = ? AND user_id = ?
  `).run(category, fact, factId, userId);
}

export async function addFactExtraction(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  id: string,
  factId: string,
  conversationId: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    INSERT INTO fact_extractions (id, fact_id, conversation_id)
    VALUES (?, ?, ?)
  `).run(id, factId, conversationId);
}

export async function updateConversationFactExtractedAt(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  conversationId: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    UPDATE conversations
    SET last_fact_extracted_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(conversationId);
}

export async function getConversationsForFactExtraction(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
): Promise<{ id: string; user_id: string; last_fact_extracted_at: string | null }[]> {
  await ensureInitialized();
  const results = await dbWrapper.prepare(`
    SELECT c.id, c.user_id, c.last_fact_extracted_at
    FROM conversations c
    WHERE c.updated_at > datetime('now', '-2 days')
      AND (c.last_fact_extracted_at IS NULL OR c.updated_at > c.last_fact_extracted_at)
    ORDER BY c.updated_at ASC
  `).all();
  return results as { id: string; user_id: string; last_fact_extracted_at: string | null }[];
}
