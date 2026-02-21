import { v4 as uuid } from "uuid";
import {
  createConversation,
  addMessage,
  getConversation,
  updateConversationResponseMode,
  updateConversationAIProvider,
  addFileAttachment,
  setConversationActiveJob,
  ResponseMode,
} from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createJob, startJob } from "@/lib/jobs";
import { rateLimit } from "@/lib/rate-limit";
import { ChatJobInput } from "@/workers/chat-worker";
import { AIFileData } from "@/lib/ai/types";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const userId = session.userId;

    // 30 messages per minute per user
    if (!rateLimit(`chat:${userId}`, 30, 60 * 1000)) {
      return new Response(JSON.stringify({ error: "Too many requests. Please slow down." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    const {
      message,
      conversationId,
      thinking,
      mode,
      folderId,
      image,
      files,
      aiProvider = 'gemini',
      skipProviderUpdate,
      documentIds = [],
      location
    } = await request.json();

    // Prepare image data if provided
    const imageData = image ? { mimeType: image.mimeType, base64: image.base64 } : undefined;

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate provider
    if (aiProvider !== 'gemini' && aiProvider !== 'gemini-pro' && aiProvider !== 'xai') {
      return new Response(JSON.stringify({ error: "Invalid AI provider" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let currentConversationId = conversationId;
    let isNewConversation = false;
    let useMode: ResponseMode = mode === 'quick' ? 'quick' : 'detailed';
    let currentDocumentIds: string[] = Array.isArray(documentIds) ? documentIds : [];

    // Get existing conversation or create new one
    if (currentConversationId) {
      const conv = await getConversation(userId, currentConversationId);
      if (conv) {
        // Update provider if it changed
        if (conv.ai_provider !== aiProvider && !skipProviderUpdate) {
          await updateConversationAIProvider(userId, currentConversationId, aiProvider);
        }

        // Always update response mode from request
        useMode = mode === 'quick' ? 'quick' : 'detailed';
        await updateConversationResponseMode(userId, currentConversationId, useMode);

        // Use existing document ID from conversation if not provided in request
        if (currentDocumentIds.length === 0 && conv.document_ids && conv.document_ids.length > 0) {
          currentDocumentIds = conv.document_ids;
        }
      } else {
        // Conversation not found or unauthorized
        return new Response(JSON.stringify({ error: "Conversation not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      currentConversationId = uuid();
      // Create conversation with optional default folder and provider
      await createConversation(userId, currentConversationId, "New Chat", false, useMode, folderId || null, aiProvider, currentDocumentIds);
      isNewConversation = true;
    }

    // Save user message
    const userMessageId = uuid();
    await addMessage(userId, userMessageId, currentConversationId, "user", message);

    // Save file attachments if provided
    if (files && Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        const fileAttachmentId = uuid();
        await addFileAttachment(
          fileAttachmentId,
          userMessageId,
          file.uri,
          file.fileName,
          file.mimeType,
          0, // Size not needed from client
          file.uploadedAt
        );
      }
    }

    // Convert files to AIFileData format for the job
    const fileData: AIFileData[] | undefined = files && Array.isArray(files) && files.length > 0
      ? files.map((f: any) => ({ fileUri: f.uri, mimeType: f.mimeType }))
      : undefined;

    // Create and start job
    const job = await createJob('chat', undefined, userId);

    const jobInput: ChatJobInput = {
      userId,
      conversationId: currentConversationId,
      userMessageId,
      message,
      thinking: Boolean(thinking),
      mode: useMode,
      aiProvider,
      location,
      documentIds: currentDocumentIds,
      fileData,
      imageData,
    };

    await startJob(job.id, jobInput);

    // Set active job ID on conversation for SSR resume
    await setConversationActiveJob(userId, currentConversationId, job.id);

    return new Response(JSON.stringify({
      jobId: job.id,
      conversationId: currentConversationId,
      isNewConversation,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process message" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
