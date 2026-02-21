import { getSharedLink, getConversation, getConversationMessages, getDocument, getSnapshotById } from "@/lib/db";
import { notFound } from "next/navigation";
import SharedConversationView from "@/app/components/SharedConversationView";
import SharedDocumentView from "@/app/components/SharedDocumentView";
import { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const sharedLink = await getSharedLink(id);

  if (!sharedLink) return { title: "Not Found" };

  let title = "Shared Content";
  if (sharedLink.type === 'conversation') {
    const conv = await getConversation(sharedLink.user_id, sharedLink.resource_id);
    if (conv) title = conv.title;
  } else if (sharedLink.type === 'snapshot') {
    const snap = await getSnapshotById(sharedLink.resource_id);
    if (snap) title = snap.title;
  } else {
    const doc = await getDocument(sharedLink.user_id, sharedLink.resource_id);
    if (doc) title = doc.title;
  }

  return {
    title: `${title} | Shared on OkBrain`,
    description: `Publicly shared ${sharedLink.type} from OkBrain AI Assistant`,
  };
}

export default async function SharedPage({ params }: Props) {
  const { id } = await params;
  const sharedLink = await getSharedLink(id);

  if (!sharedLink) {
    notFound();
  }

  if (sharedLink.type === 'conversation') {
    const conversation = await getConversation(sharedLink.user_id, sharedLink.resource_id);
    const messages = await getConversationMessages(sharedLink.user_id, sharedLink.resource_id);

    if (!conversation) notFound();

    // Filter out private data and transform for view
    const safeMessages = messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      model: msg.model,
      sources: msg.sources,
      wasGrounded: !!msg.was_grounded,
      thoughts: msg.thoughts,
      thinking_duration: msg.thinking_duration
    }));

    return (
      <main style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg-primary)', WebkitOverflowScrolling: 'touch' }}>
        <SharedConversationView
          title={conversation.title}
          messages={safeMessages}
        />
      </main>
    );
  } else if (sharedLink.type === 'snapshot') {
    const snapshot = await getSnapshotById(sharedLink.resource_id);

    if (!snapshot) notFound();

    return (
      <main style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg-primary)', WebkitOverflowScrolling: 'touch' }}>
        <SharedDocumentView
          title={snapshot.title}
          content={snapshot.content}
          snapshotMessage={snapshot.message}
          snapshotDate={snapshot.created_at}
        />
      </main>
    );
  } else {
    const document = await getDocument(sharedLink.user_id, sharedLink.resource_id);

    if (!document) notFound();

    return (
      <main style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg-primary)', WebkitOverflowScrolling: 'touch' }}>
        <SharedDocumentView
          title={document.title}
          content={document.content}
        />
      </main>
    );
  }
}
