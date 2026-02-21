"use client";

import ChatView from "../components/ChatView";
import { HighlightData } from "../components/HighlightsSection";

interface ChatWrapperProps {
  initialDocumentContexts?: { id: string; title: string }[] | null;
  initialHighlightsData?: HighlightData | null;
  initialVerifyModel?: string | null;
}

export default function ChatWrapper({
  initialDocumentContexts,
  initialHighlightsData,
  initialVerifyModel,
}: ChatWrapperProps) {
  const handleConversationCreated = (id: string) => {
    window.history.replaceState(null, '', `/chat/${id}`);
  };

  const handleConversationReset = () => {
    window.history.replaceState(null, '', '/');
  };

  return <ChatView
    onConversationCreated={handleConversationCreated}
    onConversationReset={handleConversationReset}
    initialDocumentContexts={initialDocumentContexts}
    initialHighlightsData={initialHighlightsData}
    initialVerifyModel={initialVerifyModel}
  />;
}
