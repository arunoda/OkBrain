import { DbWrapper, Folder } from './db-types';

export async function createFolder(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  name: string
): Promise<Folder> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    INSERT INTO folders (id, name, user_id) VALUES (?, ?, ?)
  `).run(id, name, userId);

  return (await getFolder(dbWrapper, ensureInitialized, userId, id))!;
}

export async function getFolder(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string
): Promise<Folder | null> {
  await ensureInitialized();
  const result = await dbWrapper.prepare("SELECT * FROM folders WHERE id = ? AND user_id = ?").get(id, userId);
  return (result as Folder | undefined) || null;
}

export async function getAllFolders(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string
): Promise<Folder[]> {
  await ensureInitialized();
  const results = await dbWrapper.prepare(
    "SELECT * FROM folders WHERE user_id = ? ORDER BY name ASC"
  ).all(userId);
  return results as Folder[];
}

export async function updateFolderName(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  name: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    UPDATE folders SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?
  `).run(name, id, userId);
}

export async function deleteFolder(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string
): Promise<void> {
  await ensureInitialized();
  // Ensure folder belongs to user
  const folder = await getFolder(dbWrapper, ensureInitialized, userId, id);
  if (!folder) return;

  // First, unassign all conversations from this folder (that belong to the user)
  await dbWrapper.prepare(`
    UPDATE conversations SET folder_id = NULL WHERE folder_id = ? AND user_id = ?
  `).run(id, userId);
  // Also unassign all documents from this folder (that belong to the user)
  await dbWrapper.prepare(`
    UPDATE documents SET folder_id = NULL WHERE folder_id = ? AND user_id = ?
  `).run(id, userId);
  // Then delete the folder
  await dbWrapper.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").run(id, userId);
}
