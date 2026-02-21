/**
 * Chat Worker
 *
 * Processes chat jobs using AI providers (Gemini/XAI).
 * Streams responses through job events for real-time updates.
 */

import { v4 as uuid } from 'uuid';
import { registerWorker, ClaimedJob, WorkerContext } from '../lib/jobs';
import { getAIProvider, injectContextMessages } from '../lib/ai';
import { AIFileData } from '../lib/ai/types';
import {
  getConversationMessages,
  addMessage,
  updateConversationTitle,
  getConversation,
  getUserMemory,
  getConversationDocuments,
  deleteMessage,
  deleteConversation,
  getLatestFactSheet,
  getRecentConversationsWithUserMessages,
  searchFactsByEmbedding,
  ResponseMode,
} from '../lib/db';
import type { FactSheetEntry } from '../lib/db';
import { getUpcomingEventsContext } from '../lib/ai/tools/events';
import { embedQuery, isOllamaAvailable } from '../lib/ai/embeddings';

export interface ChatJobInput {
  userId: string;
  conversationId: string;
  userMessageId: string;
  message: string;
  thinking: boolean;
  mode: ResponseMode;
  aiProvider: 'gemini' | 'gemini-pro' | 'xai';
  location?: string;
  documentIds: string[];
  fileData?: AIFileData[];
  imageData?: { mimeType: string; base64: string };
}

async function handleChatJob(job: ClaimedJob, ctx: WorkerContext): Promise<void> {
  const input = job.input as ChatJobInput;
  const {
    userId,
    conversationId,
    userMessageId,
    message,
    thinking,
    mode,
    aiProvider,
    location,
    documentIds,
    fileData,
    imageData,
  } = input;

  console.log(`[ChatWorker] Processing job ${job.jobId} for conversation: ${conversationId}`);

  // Get AI provider
  const ai = getAIProvider(aiProvider, { thinking });

  // Get conversation messages (includes the just-saved user message)
  const messages = await getConversationMessages(userId, conversationId);
  const filteredMessages = messages.filter(m => m.role !== 'summary');

  // Build AI messages array
  const baseMessages = filteredMessages.map((m, index) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
    model: m.model,
    // Include thought_signature for assistant messages (for thought continuity)
    ...(m.role === 'assistant' && m.thought_signature ? { thoughtSignature: m.thought_signature } : {}),
    // Attach image to the last message only (current user message)
    ...(index === filteredMessages.length - 1 && imageData ? { image: imageData } : {}),
    // Attach files to the last message only (current user message)
    ...(index === filteredMessages.length - 1 && fileData ? { files: fileData } : {}),
  }));

  // Get context data
  const userMemory = await getUserMemory(userId);
  const eventsContext = await getUpcomingEventsContext(userId, 5);
  const docs = documentIds.length > 0
    ? await getConversationDocuments(userId, conversationId)
    : [];

  // Load facts from fact sheet
  let facts: Array<{ category: string; fact: string }> = [];
  const factSheet = await getLatestFactSheet(userId);
  if (factSheet) {
    const entries: FactSheetEntry[] = JSON.parse(factSheet.facts_json);
    facts = entries.map(e => ({ category: e.category, fact: e.fact }));
  } else {
    console.warn(`[ChatWorker] No fact sheet found for user ${userId}`);
  }

  // Load recent conversations (since last fact sheet generation)
  const recentConversations = await getRecentConversationsWithUserMessages(
    userId,
    conversationId,
    factSheet?.created_at
  );

  // RAG: find semantically relevant facts for the current user message
  let ragFacts: Array<{ fact: string; category: string; distance: number; last_extracted_at: string | null }> = [];
  try {
    const lastUserMessage = baseMessages.filter(m => m.role === 'user').pop();
    if (lastUserMessage?.content && await isOllamaAvailable()) {
      const queryEmbedding = await embedQuery(lastUserMessage.content);
      ragFacts = await searchFactsByEmbedding(userId, queryEmbedding, 10);
    }
  } catch (e) {
    // RAG search failure should never break chat
  }

  // Inject context as message pairs
  const aiMessages = injectContextMessages(baseMessages, {
    modelName: ai.getModelName(),
    userMemory,
    facts,
    ragFacts,
    eventsContext,
    documents: docs,
    includeTimezone: true,
    recentConversations,
  });

  // Stream the AI response
  let fullResponse = '';
  let allThoughts = '';
  let sources: Array<{ uri?: string; title?: string }> | undefined;
  let thoughtSignature: string | undefined;
  let thinkingStartTime: number | null = null;
  let thinkingDuration: number | undefined;

  // AbortController to stop the stream when stop is requested
  const abortController = new AbortController();

  // Emit init event
  await ctx.emit('output', {
    type: 'init',
    conversationId,
    model: ai.getModelName(),
  });

  // Emit initial status so UI shows something during early processing
  const modelDisplayName = ai.getModelName().split(' ')[0];
  await ctx.emit('status', { status: `Talking to ${modelDisplayName}` });

  try {
    await ai.generateStream(
      aiMessages,
      async (chunk) => {
        // Check stop request and abort the stream
        if (await ctx.stopRequested()) {
          console.log(`[ChatWorker] Stop requested for job ${job.jobId}, aborting stream`);
          abortController.abort();
          return;
        }

        if (chunk.status) {
          await ctx.emit('status', { status: chunk.status });
        }

        // Stream thoughts for live display and accumulate for saving
        if (chunk.thought && !chunk.done) {
          if (thinkingStartTime === null) {
            thinkingStartTime = Date.now();
          }
          allThoughts += chunk.thought;
          await ctx.emit('thought', { text: chunk.thought });
        }

        if (chunk.text) {
          // Calculate thinking duration when content starts
          if (thinkingStartTime !== null && thinkingDuration === undefined) {
            thinkingDuration = Math.round((Date.now() - thinkingStartTime) / 1000);
          }
          fullResponse += chunk.text;
          await ctx.emit('output', { text: chunk.text });
        }

        if (chunk.done) {
          // Extract sources if available
          if (chunk.sources && chunk.sources.length > 0) {
            sources = chunk.sources;
          }
          // Capture final accumulated thoughts and signature
          if (chunk.thought) {
            allThoughts = chunk.thought;
          }
          if (chunk.thoughtSignature) {
            thoughtSignature = chunk.thoughtSignature;
          }
        }
      },
      { thinking: Boolean(thinking), mode, location, userId, signal: abortController.signal }
    );
  } catch (error) {
    console.error(`[ChatWorker] Stream error for job ${job.jobId}:`, error);
    let errorMessage = 'Failed to generate response';
    if (error instanceof Error) {
      // Try to extract a human-readable message from nested JSON errors
      // Gemini API errors can be double-nested: error.message is JSON containing an error.message that is also JSON
      let msg = error.message;
      try {
        for (let i = 0; i < 3; i++) {
          const parsed = JSON.parse(msg);
          if (parsed?.error?.message) {
            msg = parsed.error.message;
          } else if (parsed?.message) {
            msg = parsed.message;
          } else {
            break;
          }
        }
      } catch {
        // msg is no longer JSON — it's the final human-readable string
      }
      if (msg && msg !== '[object Object]') {
        errorMessage = msg;
      }
    }
    await ctx.emit('output', {
      final: true,
      error: errorMessage,
    });
    await ctx.complete(false);
    return;
  }

  // Check if stopped during streaming
  if (await ctx.stopRequested()) {
    // Clean up: if first message, delete the entire conversation; otherwise just delete the user message
    const isFirstMessage = filteredMessages.length === 1;
    if (isFirstMessage) {
      // Delete the entire conversation (cascades to messages)
      await deleteConversation(userId, conversationId);
      console.log(`[ChatWorker] Stopped: deleted new conversation ${conversationId}`);
    } else {
      // Delete just the user message that was added for this request
      await deleteMessage(userId, userMessageId);
      console.log(`[ChatWorker] Stopped: deleted user message ${userMessageId}`);
    }

    await ctx.emit('output', {
      final: true,
      stopped: true,
    });
    await ctx.complete(true);
    return;
  }

  // If stream completed but produced no content, treat as error
  if (!fullResponse.trim()) {
    await ctx.emit('output', {
      final: true,
      error: 'The model returned an empty response. It may be temporarily unavailable — please try again.',
    });
    await ctx.complete(false);
    return;
  }

  // Save assistant message
  const assistantMessageId = uuid();
  await addMessage(
    userId,
    assistantMessageId,
    conversationId,
    'assistant',
    fullResponse,
    ai.getModelName(),
    sources ? JSON.stringify(sources) : undefined,
    false,
    allThoughts || undefined,
    thoughtSignature,
    thinkingDuration
  );

  // Check if this is a new conversation (only user message exists)
  const isNewConversation = filteredMessages.length === 1;
  let title: string | undefined;
  let conversation: any | undefined;

  if (isNewConversation && fullResponse) {
    try {
      title = await ai.generateTitle(message);
      await updateConversationTitle(userId, conversationId, title);
      conversation = await getConversation(userId, conversationId);
    } catch (e) {
      console.error('[ChatWorker] Failed to generate title:', e);
    }
  }

  // Emit final done event
  await ctx.emit('output', {
    final: true,
    messageId: assistantMessageId,
    sources,
    model: ai.getModelName(),
    thinkingDuration,
    title,
    conversation,
  });

  await ctx.complete(true);
}

registerWorker({
  jobType: 'chat',
  pollIntervalMs: 100,
  maxConcurrency: 10,
  onJob: handleChatJob,
  onError: (error, job) => {
    console.error('[ChatWorker] Job failed:', error, job?.jobId);
  },
});
