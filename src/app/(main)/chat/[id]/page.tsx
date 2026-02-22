import { getSession } from "@/lib/auth";
import { getConversation, getConversationMessages, getConversationDocuments, getUserKV } from "@/lib/db";
import { getJob, readLogSince } from "@/lib/jobs";
import { isValidModelId } from "@/lib/ai";
import ChatView from "../../../components/ChatView";
import { redirect } from "next/navigation";
import { Message as DBMessage } from "@/lib/db";
import { Message as ViewMessage } from "../../../components/ChatView";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const conversation = await getConversation(session.userId, conversationId);
  if (!conversation) {
    redirect('/');
  }

  const messages = await getConversationMessages(session.userId, conversationId);
  const realMessages: ViewMessage[] = messages
    .filter((msg: DBMessage) => !msg.id.startsWith('temp-'))
    .map((msg: DBMessage) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      model: msg.model || undefined,
      sources: msg.sources || undefined,
      wasGrounded: msg.was_grounded === 1,
      thoughts: msg.thoughts || undefined,
      thinking_duration: msg.thinking_duration || undefined,
      feedback: msg.feedback ?? null,
      created_at: msg.created_at
    }));

  const docs = await getConversationDocuments(session.userId, conversationId);
  const initialDocumentContexts = docs.map(doc => ({ id: doc.id, title: doc.title }));

  // Fetch verify model preference for SSR
  let initialVerifyModel: string | null = null;
  const verifyModelKV = await getUserKV(session.userId, "verify:model");
  if (verifyModelKV?.value && isValidModelId(verifyModelKV.value)) {
    initialVerifyModel = verifyModelKV.value;
  }

  // Check for active chat job using conversation's stored job ID
  let initialActiveJobId: string | null = null;
  let initialStreamingContent = "";
  let initialStreamingThoughts = "";
  let initialStreamingStatus = "";
  let initialStreamingRole: 'assistant' | 'summary' = 'assistant';
  let initialLastSeq = 0;

  if (conversation.active_job_id) {
    const activeJob = await getJob(conversation.active_job_id);
    // Only resume if job is still running
    if (activeJob && (activeJob.state === 'running' || activeJob.state === 'idle')) {
      initialActiveJobId = activeJob.id;
      // Read from log file (JSONL) - the source of truth during streaming
      const events = readLogSince(activeJob.id, 0);

      // Extract role from init event (workers can specify role in init payload)
      // Fallback to job type if init event not yet available (timing edge case)
      const initEvent = events.find((e: { kind: string; payload: any }) =>
        e.kind === 'output' && e.payload?.type === 'init'
      );
      if (initEvent?.payload?.role === 'summary' || activeJob.type === 'summarize') {
        initialStreamingRole = 'summary';
      }

      // Accumulate output text
      initialStreamingContent = events
        .filter((e: { kind: string }) => e.kind === 'output')
        .map((e: { payload: any }) => {
          const payload = e.payload;
          return payload?.text || "";
        })
        .join("");

      // Accumulate thoughts
      initialStreamingThoughts = events
        .filter((e: { kind: string }) => e.kind === 'thought')
        .map((e: { payload: any }) => {
          const payload = e.payload;
          return payload?.text || "";
        })
        .join("");

      // Get last status message
      const statusEvents = events.filter((e: { kind: string }) => e.kind === 'status');
      if (statusEvents.length > 0) {
        const lastStatus = statusEvents[statusEvents.length - 1];
        initialStreamingStatus = lastStatus.payload?.status || "";
      }

      // Track last sequence number to avoid replaying events
      if (events.length > 0) {
        initialLastSeq = events[events.length - 1].seq;
      }
    }
  }

  return (
    <ChatView
      initialConversationId={conversationId}
      initialMessages={realMessages}
      initialConversation={conversation ? {
        ...conversation,
        folder_id: conversation.folder_id ?? null,
        grounding_enabled: conversation.grounding_enabled ?? 0,
        response_mode: conversation.response_mode || 'detailed',
        ai_provider: conversation.ai_provider || 'gemini',
        document_ids: conversation.document_ids || [],
        created_at: conversation.created_at,
        updated_at: conversation.updated_at
      } : null}
      initialDocumentContexts={initialDocumentContexts}
      initialActiveJobId={initialActiveJobId}
      initialStreamingContent={initialStreamingContent}
      initialStreamingThoughts={initialStreamingThoughts}
      initialStreamingStatus={initialStreamingStatus}
      initialStreamingRole={initialStreamingRole}
      initialLastSeq={initialLastSeq}
      initialVerifyModel={initialVerifyModel}
    />
  );
}
