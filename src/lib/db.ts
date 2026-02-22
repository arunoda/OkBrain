import { DbWrapper } from './db/db-types';
import { initializeSchema } from './db/db-schema';

const localModule = require('./db-local')
const dbWrapper: DbWrapper = localModule.dbWrapper
const resetLocalDb: (() => void) | undefined = localModule.resetDb

// Initialize database schema
let initPromise: Promise<void> | null = null
export async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initializeSchema(dbWrapper)
  }

  try {
    await initPromise
  } catch (error) {
    // If initialization fails, reset the promise so we can try again on the next request
    console.error('[DB] Initialization failed:', error)
    initPromise = null
    throw error
  }
}

// Reset database connection (useful for testing)
export function resetDb(): void {
  if (resetLocalDb) {
    resetLocalDb();
  }
  initPromise = null;
}

// Re-export all types
export * from './db/db-types';

// Import all operation modules
import * as userOps from './db/db-users';
import * as conversationOps from './db/db-conversations';
import * as folderOps from './db/db-folders';
import * as documentOps from './db/db-documents';
import * as eventOps from './db/db-events';
import * as attachmentOps from './db/db-attachments';
import * as snapshotOps from './db/db-snapshots';
import * as sharedLinkOps from './db/db-shared-links';
import * as memoryOps from './db/db-memory';
import * as factOps from './db/db-facts';
import * as factSheetOps from './db/db-fact-sheets';
import * as jobOps from './db/db-jobs';
import * as uploadOps from './db/db-uploads';

// User operations
export async function createUser(id: string, email: string, passwordHashed: string) {
  return userOps.createUser(dbWrapper, ensureInitialized, id, email, passwordHashed);
}

export async function getUserById(id: string) {
  return userOps.getUserById(dbWrapper, ensureInitialized, id);
}

export async function getUserByEmail(email: string) {
  return userOps.getUserByEmail(dbWrapper, ensureInitialized, email);
}

// Conversation operations
export async function createConversation(
  userId: string,
  id: string,
  title: string,
  groundingEnabled: boolean = false,
  responseMode: 'quick' | 'detailed' = 'detailed',
  folderId: string | null = null,
  aiProvider: string = 'gemini',
  documentIds: string[] = []
) {
  return conversationOps.createConversation(
    dbWrapper,
    ensureInitialized,
    userId,
    id,
    title,
    groundingEnabled,
    responseMode,
    folderId,
    aiProvider,
    documentIds
  );
}

export async function updateConversationGrounding(userId: string, id: string, groundingEnabled: boolean) {
  return conversationOps.updateConversationGrounding(dbWrapper, ensureInitialized, userId, id, groundingEnabled);
}

export async function updateConversationResponseMode(userId: string, id: string, responseMode: 'quick' | 'detailed') {
  return conversationOps.updateConversationResponseMode(dbWrapper, ensureInitialized, userId, id, responseMode);
}

export async function updateConversationAIProvider(userId: string, id: string, aiProvider: string) {
  return conversationOps.updateConversationAIProvider(dbWrapper, ensureInitialized, userId, id, aiProvider);
}

export async function getConversation(userId: string, id: string) {
  return conversationOps.getConversation(dbWrapper, ensureInitialized, userId, id);
}

export async function getConversationDocuments(userId: string, conversationId: string) {
  return conversationOps.getConversationDocuments(dbWrapper, ensureInitialized, userId, conversationId);
}

export async function getAllConversations(userId: string) {
  return conversationOps.getAllConversations(dbWrapper, ensureInitialized, userId);
}

export async function updateConversationTitle(userId: string, id: string, title: string) {
  return conversationOps.updateConversationTitle(dbWrapper, ensureInitialized, userId, id, title);
}

export async function updateConversationTimestamp(userId: string, id: string) {
  return conversationOps.updateConversationTimestamp(dbWrapper, ensureInitialized, userId, id);
}

export async function setConversationActiveJob(userId: string, id: string, jobId: string | null) {
  return conversationOps.setConversationActiveJob(dbWrapper, ensureInitialized, userId, id, jobId);
}

export async function deleteConversation(userId: string, id: string) {
  return conversationOps.deleteConversation(dbWrapper, ensureInitialized, userId, id);
}

export async function moveConversationToFolder(userId: string, conversationId: string, folderId: string | null) {
  return conversationOps.moveConversationToFolder(
    dbWrapper,
    ensureInitialized,
    (uid, fid) => getFolder(uid, fid),
    userId,
    conversationId,
    folderId
  );
}

export async function getConversationsByFolder(userId: string, folderId: string | null) {
  return conversationOps.getConversationsByFolder(dbWrapper, ensureInitialized, userId, folderId);
}

export async function getRecentConversationsWithUserMessages(userId: string, excludeConversationId: string, sinceDate?: string) {
  return conversationOps.getRecentConversationsWithUserMessages(dbWrapper, ensureInitialized, userId, excludeConversationId, sinceDate);
}

// Message operations
export async function addMessage(
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
) {
  return conversationOps.addMessage(
    dbWrapper,
    ensureInitialized,
    userId,
    id,
    conversationId,
    role,
    content,
    model,
    sources,
    wasGrounded,
    thoughts,
    thoughtSignature,
    thinkingDuration
  );
}

export async function getMessage(id: string) {
  return conversationOps.getMessage(dbWrapper, ensureInitialized, id);
}

export async function deleteMessage(userId: string, id: string) {
  return conversationOps.deleteMessage(dbWrapper, ensureInitialized, userId, id);
}

export async function updateMessageFeedback(userId: string, id: string, feedback: number | null) {
  return conversationOps.updateMessageFeedback(dbWrapper, ensureInitialized, userId, id, feedback);
}

export async function deleteConversationMessages(userId: string, conversationId: string) {
  return conversationOps.deleteConversationMessages(dbWrapper, ensureInitialized, userId, conversationId);
}

export async function getConversationMessages(userId: string, conversationId: string) {
  return conversationOps.getConversationMessages(dbWrapper, ensureInitialized, userId, conversationId);
}

export async function getSidebarItems(
  userId: string,
  type: 'uncategorized' | 'folder',
  folderId: string | null = null,
  limit: number = 50,
  offset: number = 0
) {
  return conversationOps.getSidebarItems(dbWrapper, ensureInitialized, userId, type, folderId, limit, offset);
}

// Folder operations
export async function createFolder(userId: string, id: string, name: string) {
  return folderOps.createFolder(dbWrapper, ensureInitialized, userId, id, name);
}

export async function getFolder(userId: string, id: string) {
  return folderOps.getFolder(dbWrapper, ensureInitialized, userId, id);
}

export async function getAllFolders(userId: string) {
  return folderOps.getAllFolders(dbWrapper, ensureInitialized, userId);
}

export async function updateFolderName(userId: string, id: string, name: string) {
  return folderOps.updateFolderName(dbWrapper, ensureInitialized, userId, id, name);
}

export async function deleteFolder(userId: string, id: string) {
  return folderOps.deleteFolder(dbWrapper, ensureInitialized, userId, id);
}

// Document operations
export async function createDocument(userId: string, id: string, title: string, content: string = '', folderId: string | null = null) {
  return documentOps.createDocument(dbWrapper, ensureInitialized, userId, id, title, content, folderId);
}

export async function getDocument(userId: string, id: string) {
  return documentOps.getDocument(dbWrapper, ensureInitialized, userId, id);
}

export async function getAllDocuments(userId: string) {
  return documentOps.getAllDocuments(dbWrapper, ensureInitialized, userId);
}

export async function updateDocumentTitle(userId: string, id: string, title: string) {
  return documentOps.updateDocumentTitle(dbWrapper, ensureInitialized, userId, id, title);
}

export async function updateDocumentContent(userId: string, id: string, content: string) {
  return documentOps.updateDocumentContent(dbWrapper, ensureInitialized, userId, id, content);
}

export async function updateDocument(userId: string, id: string, title: string, content: string) {
  return documentOps.updateDocument(dbWrapper, ensureInitialized, userId, id, title, content);
}

export async function deleteDocument(userId: string, id: string) {
  return documentOps.deleteDocument(dbWrapper, ensureInitialized, userId, id);
}

export async function moveDocumentToFolder(userId: string, documentId: string, folderId: string | null) {
  return documentOps.moveDocumentToFolder(
    dbWrapper,
    ensureInitialized,
    (uid, fid) => getFolder(uid, fid),
    userId,
    documentId,
    folderId
  );
}

export async function getDocumentsByFolder(userId: string, folderId: string | null) {
  return documentOps.getDocumentsByFolder(dbWrapper, ensureInitialized, userId, folderId);
}

export async function getDocumentConversations(userId: string, documentId: string) {
  return documentOps.getDocumentConversations(dbWrapper, ensureInitialized, userId, documentId);
}

// Event operations
export async function createEvent(
  userId: string,
  id: string,
  title: string,
  description: string,
  location: string,
  startDatetime: string,
  endDatetime: string | null = null,
  recurrenceType: string | null = null,
  recurrenceEndDate: string | null = null
) {
  return eventOps.createEvent(
    dbWrapper,
    ensureInitialized,
    userId,
    id,
    title,
    description,
    location,
    startDatetime,
    endDatetime,
    recurrenceType,
    recurrenceEndDate
  );
}

export async function getEvent(userId: string, id: string) {
  return eventOps.getEvent(dbWrapper, ensureInitialized, userId, id);
}

export async function getAllEvents(userId: string) {
  return eventOps.getAllEvents(dbWrapper, ensureInitialized, userId);
}

export async function updateEvent(
  userId: string,
  id: string,
  title: string,
  description: string,
  location: string,
  startDatetime: string,
  endDatetime: string | null,
  recurrenceType: string | null = null,
  recurrenceEndDate: string | null = null
) {
  return eventOps.updateEvent(
    dbWrapper,
    ensureInitialized,
    userId,
    id,
    title,
    description,
    location,
    startDatetime,
    endDatetime,
    recurrenceType,
    recurrenceEndDate
  );
}

export async function deleteEvent(userId: string, id: string) {
  return eventOps.deleteEvent(dbWrapper, ensureInitialized, userId, id);
}

export async function searchEvents(userId: string, searchQuery: string) {
  return eventOps.searchEvents(dbWrapper, ensureInitialized, userId, searchQuery);
}

export async function getEventsByDateRange(userId: string, startDate: string, endDate: string) {
  return eventOps.getEventsByDateRange(dbWrapper, ensureInitialized, userId, startDate, endDate);
}

export async function getUpcomingEvents(userId: string, limit: number = 5) {
  return eventOps.getUpcomingEvents(dbWrapper, ensureInitialized, userId, limit);
}

export async function getPastEvents(userId: string, limit: number = 10) {
  return eventOps.getPastEvents(dbWrapper, ensureInitialized, userId, limit);
}

// File attachment operations
export async function addFileAttachment(
  id: string,
  messageId: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
  fileSize: number,
  uploadedAt: string
) {
  return attachmentOps.addFileAttachment(
    dbWrapper,
    ensureInitialized,
    id,
    messageId,
    fileUri,
    fileName,
    mimeType,
    fileSize,
    uploadedAt
  );
}

export async function getFileAttachment(id: string) {
  return attachmentOps.getFileAttachment(dbWrapper, ensureInitialized, id);
}

export async function getMessageFileAttachments(messageId: string) {
  return attachmentOps.getMessageFileAttachments(dbWrapper, ensureInitialized, messageId);
}

export async function getConversationFileAttachments(userId: string, conversationId: string) {
  return attachmentOps.getConversationFileAttachments(
    dbWrapper,
    ensureInitialized,
    (uid, cid) => getConversation(uid, cid),
    userId,
    conversationId
  );
}

export async function deleteFileAttachment(id: string) {
  return attachmentOps.deleteFileAttachment(dbWrapper, ensureInitialized, id);
}

// Snapshot operations
export async function createSnapshot(userId: string, documentId: string, id: string, message: string, title: string, content: string) {
  return snapshotOps.createSnapshot(dbWrapper, ensureInitialized, userId, documentId, id, message, title, content);
}

export async function getDocumentSnapshots(userId: string, documentId: string) {
  return snapshotOps.getDocumentSnapshots(dbWrapper, ensureInitialized, userId, documentId);
}

export async function getDocumentSnapshot(userId: string, snapshotId: string) {
  return snapshotOps.getDocumentSnapshot(dbWrapper, ensureInitialized, userId, snapshotId);
}

export async function getSnapshotById(snapshotId: string) {
  return snapshotOps.getSnapshotById(dbWrapper, ensureInitialized, snapshotId);
}

export async function deleteSnapshot(userId: string, snapshotId: string) {
  return snapshotOps.deleteSnapshot(dbWrapper, ensureInitialized, userId, snapshotId);
}

// Shared link operations
export async function createSharedLink(userId: string, type: 'conversation' | 'document' | 'snapshot', resourceId: string, id: string) {
  return sharedLinkOps.createSharedLink(dbWrapper, ensureInitialized, userId, type, resourceId, id);
}

export async function getSharedLink(id: string) {
  return sharedLinkOps.getSharedLink(dbWrapper, ensureInitialized, id);
}

export async function getSharedLinkByResource(userId: string, type: 'conversation' | 'document' | 'snapshot', resourceId: string) {
  return sharedLinkOps.getSharedLinkByResource(dbWrapper, ensureInitialized, userId, type, resourceId);
}

// User memory operations
export async function getUserMemory(userId: string) {
  return memoryOps.getUserMemory(dbWrapper, ensureInitialized, userId);
}

export async function updateUserMemory(userId: string, memoryText: string) {
  return memoryOps.updateUserMemory(dbWrapper, ensureInitialized, userId, memoryText);
}

// Fact operations
export async function getUserFacts(userId: string) {
  return factOps.getUserFacts(dbWrapper, ensureInitialized, userId);
}

export async function getRecentFacts(userId: string, limit?: number) {
  return factOps.getRecentFacts(dbWrapper, ensureInitialized, userId, limit);
}

export async function addFact(userId: string, id: string, category: string, fact: string) {
  return factOps.addFact(dbWrapper, ensureInitialized, userId, id, category, fact);
}

export async function deleteFact(userId: string, factId: string) {
  return factOps.deleteFact(dbWrapper, ensureInitialized, userId, factId);
}

export async function updateFact(userId: string, factId: string, category: string, fact: string) {
  return factOps.updateFact(dbWrapper, ensureInitialized, userId, factId, category, fact);
}

export async function addFactExtraction(id: string, factId: string, conversationId: string) {
  return factOps.addFactExtraction(dbWrapper, ensureInitialized, id, factId, conversationId);
}

export async function updateConversationFactExtractedAt(conversationId: string) {
  return factOps.updateConversationFactExtractedAt(dbWrapper, ensureInitialized, conversationId);
}

export async function getConversationsForFactExtraction() {
  return factOps.getConversationsForFactExtraction(dbWrapper, ensureInitialized);
}

// Fact Sheet operations
export async function saveFactSheet(id: string, userId: string, factsJson: string, dedupLog: string | null, factCount: number) {
  return factSheetOps.saveFactSheet(dbWrapper, ensureInitialized, id, userId, factsJson, dedupLog, factCount);
}

export async function getLatestFactSheet(userId: string) {
  return factSheetOps.getLatestFactSheet(dbWrapper, ensureInitialized, userId);
}

export async function deleteOldFactSheets(userId: string) {
  return factSheetOps.deleteOldFactSheets(dbWrapper, ensureInitialized, userId);
}

export async function getRecentFactExtractions(userId: string, limit?: number) {
  return factSheetOps.getRecentFactExtractions(dbWrapper, ensureInitialized, userId, limit);
}

// User KV operations
import * as kvOps from './db/db-kv';

export async function getUserKV(userId: string, key: string) {
  return kvOps.getUserKV(dbWrapper, ensureInitialized, userId, key);
}

export async function setUserKV(userId: string, key: string, value: string) {
  return kvOps.setUserKV(dbWrapper, ensureInitialized, userId, key, value);
}

export async function deleteUserKV(userId: string, key: string) {
  return kvOps.deleteUserKV(dbWrapper, ensureInitialized, userId, key);
}

// Job operations
export async function createJob(id: string, type: string) {
  return jobOps.createJob(dbWrapper, ensureInitialized, id, type);
}

export async function getJob(id: string) {
  return jobOps.getJob(dbWrapper, ensureInitialized, id);
}

export async function updateJobState(id: string, state: import('./db/db-types').JobState) {
  return jobOps.updateJobState(dbWrapper, ensureInitialized, id, state);
}

export async function addJobEvent(id: string, jobId: string, seq: number, kind: string, payload: string) {
  return jobOps.addJobEvent(dbWrapper, ensureInitialized, id, jobId, seq, kind, payload);
}

export async function getJobEvents(jobId: string, sinceSeq: number = 0) {
  return jobOps.getJobEvents(dbWrapper, ensureInitialized, jobId, sinceSeq);
}

export async function enqueueJob(id: string, jobId: string, input: string, priority: number = 0) {
  return jobOps.enqueueJob(dbWrapper, ensureInitialized, id, jobId, input, priority);
}

export async function claimNextJob(workerId: string, jobType?: string) {
  return jobOps.claimNextJob(dbWrapper, ensureInitialized, workerId, jobType);
}

export async function completeQueueItem(
  queueId: string,
  jobId: string,
  state: 'done' | 'failed',
  jobState: import('./db/db-types').JobState
) {
  return jobOps.completeQueueItem(dbWrapper, ensureInitialized, queueId, jobId, state, jobState);
}

// Embedding operations
import * as embeddingOps from './db/db-embeddings';

export async function saveFactEmbedding(factId: string, userId: string, embedding: Float32Array) {
  return embeddingOps.saveFactEmbedding(dbWrapper, ensureInitialized, factId, userId, embedding);
}

export async function deleteFactEmbedding(factId: string) {
  return embeddingOps.deleteFactEmbedding(dbWrapper, ensureInitialized, factId);
}

export async function searchFactsByEmbedding(userId: string, queryEmbedding: Float32Array, limit?: number, maxDistance?: number) {
  return embeddingOps.searchFactsByEmbedding(dbWrapper, ensureInitialized, userId, queryEmbedding, limit, maxDistance);
}

export async function getFactsWithoutEmbeddings(userId?: string) {
  return embeddingOps.getFactsWithoutEmbeddings(dbWrapper, ensureInitialized, userId);
}

// Upload operations
export async function createUpload(id: string, userId: string, filename: string) {
  return uploadOps.createUpload(dbWrapper, ensureInitialized, id, userId, filename);
}

export async function getUploadByFilename(filename: string) {
  return uploadOps.getUploadByFilename(dbWrapper, ensureInitialized, filename);
}

// Export the wrapper for advanced usage
export default dbWrapper;
