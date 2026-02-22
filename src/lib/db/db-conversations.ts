import { DbWrapper, Conversation, Message, ResponseMode, Document, SidebarItem } from './db-types';

export async function createConversation(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  title: string,
  groundingEnabled: boolean = false,
  responseMode: ResponseMode = 'detailed',
  folderId: string | null = null,
  aiProvider: string = 'gemini',
  documentIds: string[] = []
): Promise<Conversation> {
  await ensureInitialized();

  await dbWrapper.prepare(`
    INSERT INTO conversations (id, title, grounding_enabled, response_mode, folder_id, ai_provider, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, groundingEnabled ? 1 : 0, responseMode, folderId, aiProvider, userId);

  // Link multiple documents
  for (const docId of documentIds) {
    await dbWrapper.prepare(`
      INSERT OR IGNORE INTO conversation_documents (conversation_id, document_id) VALUES (?, ?)
    `).run(id, docId);
  }

  return (await getConversation(dbWrapper, ensureInitialized, userId, id))!;
}

export async function updateConversationGrounding(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  groundingEnabled: boolean
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    UPDATE conversations SET grounding_enabled = ? WHERE id = ? AND user_id = ?
  `).run(groundingEnabled ? 1 : 0, id, userId);
}

export async function updateConversationResponseMode(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  responseMode: ResponseMode
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    UPDATE conversations SET response_mode = ? WHERE id = ? AND user_id = ?
  `).run(responseMode, id, userId);
}

export async function updateConversationAIProvider(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  aiProvider: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    UPDATE conversations SET ai_provider = ? WHERE id = ? AND user_id = ?
  `).run(aiProvider, id, userId);
}

export async function getConversation(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string
): Promise<Conversation | null> {
  await ensureInitialized();
  const result = await dbWrapper.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?").get(id, userId);
  if (!result) return null;

  const conversation = result as Conversation;

  // Fetch linked document IDs
  const docResults = await dbWrapper.prepare(`
    SELECT document_id FROM conversation_documents WHERE conversation_id = ?
  `).all(id);
  conversation.document_ids = docResults.map((dr: any) => dr.document_id);

  return conversation;
}

export async function getConversationDocuments(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  conversationId: string
): Promise<Document[]> {
  await ensureInitialized();
  // Ensure conversation belongs to user
  const conv = await getConversation(dbWrapper, ensureInitialized, userId, conversationId);
  if (!conv) return [];

  const results = await dbWrapper.prepare(`
    SELECT d.* FROM documents d
    JOIN conversation_documents cd ON d.id = cd.document_id
    WHERE cd.conversation_id = ? AND d.user_id = ?
  `).all(conversationId, userId);
  return results as Document[];
}

export async function getAllConversations(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string
): Promise<Conversation[]> {
  await ensureInitialized();
  const results = await dbWrapper.prepare(
    "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
  ).all(userId);
  return results as Conversation[];
}

export async function updateConversationTitle(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  title: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?
  `).run(title, id, userId);
}

export async function updateConversationTimestamp(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?
  `).run(id, userId);
}

export async function setConversationActiveJob(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  jobId: string | null
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare(`
    UPDATE conversations SET active_job_id = ? WHERE id = ? AND user_id = ?
  `).run(jobId, id, userId);
}

export async function deleteConversation(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string
): Promise<void> {
  await ensureInitialized();
  await dbWrapper.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(id, userId);
}

export async function moveConversationToFolder(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  getFolder: (userId: string, id: string) => Promise<any>,
  userId: string,
  conversationId: string,
  folderId: string | null
): Promise<void> {
  await ensureInitialized();
  // Ensure conversation belongs to user
  const conv = await getConversation(dbWrapper, ensureInitialized, userId, conversationId);
  if (!conv) return;

  // If folderId is provided, ensure folder belongs to user
  if (folderId) {
    const folder = await getFolder(userId, folderId);
    if (!folder) return;
  }

  await dbWrapper.prepare(`
    UPDATE conversations SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?
  `).run(folderId, conversationId, userId);
}

export async function getConversationsByFolder(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  folderId: string | null
): Promise<Conversation[]> {
  await ensureInitialized();
  if (folderId === null) {
    const results = await dbWrapper.prepare(
      "SELECT * FROM conversations WHERE folder_id IS NULL AND user_id = ? ORDER BY updated_at DESC"
    ).all(userId);
    return results as Conversation[];
  }
  const results = await dbWrapper.prepare(
    "SELECT * FROM conversations WHERE folder_id = ? AND user_id = ? ORDER BY updated_at DESC"
  ).all(folderId, userId);
  return results as Conversation[];
}

// Message operations

export async function addMessage(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  conversationId: string,
  role: "user" | "assistant" | "summary",
  content: string,
  model?: string,
  sources?: string,
  wasGrounded: boolean = false,
  thoughts?: string,
  thoughtSignature?: string,
  thinkingDuration?: number
): Promise<Message> {
  await ensureInitialized();
  // Check if conversation belongs to user
  const conv = await getConversation(dbWrapper, ensureInitialized, userId, conversationId);
  if (!conv) throw new Error("Conversation not found or unauthorized");

  await dbWrapper.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, model, sources, was_grounded, thoughts, thought_signature, thinking_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, role, content, model || null, sources || null, wasGrounded ? 1 : 0, thoughts || null, thoughtSignature || null, thinkingDuration || null);

  // Update conversation timestamp
  await updateConversationTimestamp(dbWrapper, ensureInitialized, userId, conversationId);

  return (await getMessage(dbWrapper, ensureInitialized, id))!;
}

export async function getMessage(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  id: string
): Promise<Message | null> {
  await ensureInitialized();
  const result = await dbWrapper.prepare("SELECT * FROM messages WHERE id = ?").get(id);
  return (result as Message | undefined) || null;
}

export async function updateMessageFeedback(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string,
  feedback: number | null
): Promise<void> {
  await ensureInitialized();

  // Verify message belongs to user
  const message = await getMessage(dbWrapper, ensureInitialized, id);
  if (!message) throw new Error("Message not found");

  const conv = await getConversation(dbWrapper, ensureInitialized, userId, message.conversation_id);
  if (!conv) throw new Error("Unauthorized to update message feedback");

  await dbWrapper.prepare(`
    UPDATE messages SET feedback = ? WHERE id = ?
  `).run(feedback, id);
}

export async function deleteMessage(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  id: string
): Promise<void> {
  await ensureInitialized();
  // Check if message belongs to user's conversation
  const message = await getMessage(dbWrapper, ensureInitialized, id);
  if (!message) return;
  const conv = await getConversation(dbWrapper, ensureInitialized, userId, message.conversation_id);
  if (!conv) throw new Error("Unauthorized to delete message");

  await dbWrapper.prepare("DELETE FROM messages WHERE id = ?").run(id);
}

export async function deleteConversationMessages(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  conversationId: string
): Promise<void> {
  await ensureInitialized();
  const conv = await getConversation(dbWrapper, ensureInitialized, userId, conversationId);
  if (!conv) throw new Error("Conversation not found or unauthorized");

  await dbWrapper.prepare("DELETE FROM messages WHERE conversation_id = ?").run(conversationId);
}

export async function getConversationMessages(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  conversationId: string
): Promise<Message[]> {
  await ensureInitialized();
  // Check if conversation belongs to user
  const conv = await getConversation(dbWrapper, ensureInitialized, userId, conversationId);
  if (!conv) return [];

  const results = await dbWrapper.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
  `).all(conversationId);
  return results as Message[];
}

export async function getSidebarItems(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  type: 'uncategorized' | 'folder',
  folderId: string | null = null,
  limit: number = 50,
  offset: number = 0
): Promise<SidebarItem[]> {
  await ensureInitialized();

  let query = "";
  let params: any[] = [];

  const baseQuery = `
    SELECT id, title, folder_id, updated_at, 'chat' as type FROM conversations WHERE user_id = ?
    UNION ALL
    SELECT id, title, folder_id, updated_at, 'document' as type FROM documents WHERE user_id = ?
    `;

  if (type === 'uncategorized') {
    query = `
      SELECT * FROM(${baseQuery})
      WHERE folder_id IS NULL
      ORDER BY updated_at DESC
  LIMIT ? OFFSET ?
    `;
    params = [userId, userId, limit, offset];
  } else {
    // For folder items, we might not need pagination yet, but logic is similar
    query = `
      SELECT * FROM(${baseQuery})
      WHERE folder_id = ?
    ORDER BY updated_at DESC
      `;
    params = [userId, userId, folderId];
  }

  const results = await dbWrapper.prepare(query).all(...params);
  return results as SidebarItem[];
}

export async function getRecentConversationsWithUserMessages(
  dbWrapper: DbWrapper,
  ensureInitialized: () => Promise<void>,
  userId: string,
  excludeConversationId: string,
  sinceDate?: string,
  limit: number = 5
): Promise<Array<{ id: string; title: string; userMessages: string[] }>> {
  await ensureInitialized();

  let conversations: Array<{ id: string; title: string }>;
  if (sinceDate) {
    conversations = await dbWrapper.prepare(`
      SELECT id, title FROM conversations
      WHERE user_id = ? AND id != ? AND updated_at > ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(userId, excludeConversationId, sinceDate, limit) as any;
  } else {
    conversations = await dbWrapper.prepare(`
      SELECT id, title FROM conversations
      WHERE user_id = ? AND id != ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(userId, excludeConversationId, limit) as any;
  }

  const result: Array<{ id: string; title: string; userMessages: string[] }> = [];

  for (const conv of conversations) {
    const messages = await dbWrapper.prepare(`
      SELECT content FROM messages
      WHERE conversation_id = ? AND role = 'user'
      ORDER BY created_at DESC
      LIMIT 5
    `).all(conv.id) as Array<{ content: string }>;

    if (messages.length === 0) continue;

    result.push({
      id: conv.id,
      title: conv.title || 'Untitled',
      userMessages: messages.map(m =>
        m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content
      ),
    });
  }

  return result;
}
