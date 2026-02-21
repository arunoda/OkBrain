import { DbWrapper, DocumentSnapshot } from './db-types';

export async function createSnapshot(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  documentId: string,
  id: string,
  message: string,
  title: string,
  content: string
): Promise<DocumentSnapshot> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    INSERT INTO document_snapshots (id, document_id, user_id, message, title, content) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, documentId, userId, message, title, content);

  return (await getDocumentSnapshot(dbWrapper, ensureInitialized, userId, id))!;
}

export async function getDocumentSnapshots(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  documentId: string
): Promise<Pick<DocumentSnapshot, 'id' | 'message' | 'created_at'>[]> {
  await ensureInitialized();
  const results = await dbWrapper.prepare(
    "SELECT id, message, created_at FROM document_snapshots WHERE document_id = ? AND user_id = ? ORDER BY created_at DESC"
  ).all(documentId, userId);
  return results as Pick<DocumentSnapshot, 'id' | 'message' | 'created_at'>[];
}

export async function getDocumentSnapshot(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  snapshotId: string
): Promise<DocumentSnapshot | null> {
  await ensureInitialized();
  const result = await dbWrapper.prepare(
    "SELECT * FROM document_snapshots WHERE id = ? AND user_id = ?"
  ).get(snapshotId, userId);
  return (result as DocumentSnapshot | undefined) || null;
}

export async function getSnapshotById(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  snapshotId: string
): Promise<DocumentSnapshot | null> {
  await ensureInitialized();
  const result = await dbWrapper.prepare(
    "SELECT * FROM document_snapshots WHERE id = ?"
  ).get(snapshotId);
  return (result as DocumentSnapshot | undefined) || null;
}

export async function deleteSnapshot(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  snapshotId: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(
    "DELETE FROM document_snapshots WHERE id = ? AND user_id = ?"
  ).run(snapshotId, userId);
}
