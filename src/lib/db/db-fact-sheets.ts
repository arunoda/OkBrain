import { DbWrapper, FactSheet } from './db-types';

export async function saveFactSheet(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  id: string,
  userId: string,
  factsJson: string,
  dedupLog: string | null,
  factCount: number
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    INSERT INTO fact_sheets (id, user_id, facts_json, dedup_log, fact_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, factsJson, dedupLog, factCount);
}

export async function getLatestFactSheet(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string
): Promise<FactSheet | null> {
  await ensureInitialized();
  const result = await dbWrapper.prepare(`
    SELECT id, user_id, facts_json, dedup_log, fact_count, created_at
    FROM fact_sheets
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId);
  return (result as FactSheet) || null;
}

export async function deleteOldFactSheets(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    DELETE FROM fact_sheets
    WHERE user_id = ? AND created_at < datetime('now', '-7 days')
  `).run(userId);
}

export async function getRecentFactExtractions(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  limit: number = 1200
): Promise<{ fact_id: string; created_at: string }[]> {
  await ensureInitialized();
  const results = await dbWrapper.prepare(`
    SELECT fe.fact_id, fe.created_at
    FROM fact_extractions fe
    JOIN facts f ON f.id = fe.fact_id
    WHERE f.user_id = ?
    ORDER BY fe.created_at DESC
    LIMIT ?
  `).all(userId, limit);
  return results as { fact_id: string; created_at: string }[];
}
