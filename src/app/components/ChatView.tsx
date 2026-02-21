"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import ImageGallery, { parseImageBlocks } from "./ImageGallery";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useChatContext } from "../context/ChatContext";
import FileExpirationWarning from "./FileExpirationWarning";
import { Brain, Paperclip, ShieldCheck, FileText, MessageSquare, Globe, Sparkles, Search, MoreVertical, Printer, Share2, ChevronDown, Check, MapPin, MapPinOff, FolderOpen, AlertTriangle } from "lucide-react";
import MoveToFolderModal from "./MoveToFolderModal";
import { Button } from "./primitive/Button";
import Select from "./primitive/Select";
import ShareModal from "./ShareModal";
import HighlightsSection, { HighlightData } from "./HighlightsSection";
import "./primitive/ContentStyles.module.css";
import "./Markdown.module.css";
import "highlight.js/styles/vs2015.css";

export interface Message {
  id: string;
  role: "user" | "assistant" | "summary";
  content: string;
  model?: string;
  sources?: string;
  fileCount?: number;
  wasGrounded?: boolean;
  status?: string;
  thoughts?: string; // Model's thinking text (for display only)
  thinking_duration?: number; // Duration in seconds the model spent thinking
  error?: string; // Error message if generation failed
}

export interface FileAttachment {
  id: string;
  message_id: string;
  file_uri: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  folder_id?: string | null;
  grounding_enabled?: number;
  response_mode?: string;
  ai_provider?: string;
  document_ids?: string[];
  created_at: string;
  updated_at: string;
}

function unescapeContent(content: string): string {
  return content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r');
}

interface ChatViewProps {
  initialConversationId?: string | null;
  initialMessages?: Message[];
  initialConversation?: Conversation | null;
  onConversationCreated?: (id: string) => void;
  onConversationReset?: () => void;
  initialDocumentContexts?: { id: string; title: string }[] | null;
  initialHighlightsData?: HighlightData | null;
  initialActiveJobId?: string | null;
  initialStreamingContent?: string;
  initialStreamingThoughts?: string;
  initialStreamingStatus?: string;
  initialStreamingRole?: 'assistant' | 'summary';
  initialLastSeq?: number;
  initialVerifyModel?: string | null;
}

export default function ChatView({
  initialConversationId = null,
  initialMessages = [],
  initialConversation = null,
  onConversationCreated,
  onConversationReset,
  initialDocumentContexts = [],
  initialHighlightsData,
  initialActiveJobId = null,
  initialStreamingContent = "",
  initialStreamingThoughts = "",
  initialStreamingStatus = "",
  initialStreamingRole = 'assistant',
  initialLastSeq = 0,
  initialVerifyModel = null,
}: ChatViewProps) {
  const {
    modelsConfig,
    setConversations, defaultFolderId, folders, moveConversationToFolder,
    input, setInput, isLoading, setIsLoading, isCancelling, setIsCancelling, thinking, responseMode, setResponseMode, aiProvider, setAiProvider, sendMessageRef,
    stopStreamingRef, focusInputRef,
    imageAttachment, clearImageAttachment,
    fileAttachments, clearFileAttachments,
    conversations,
    location: locationContext
  } = useChatContext();

  // Helper to get model name from ID
  const getModelName = useCallback((modelId: string) => {
    return modelsConfig.models.find(m => m.id === modelId)?.name ?? modelId;
  }, [modelsConfig.models]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldScroll = searchParams.get('scroll') === 'true';

  // Compute initial streaming state for SSR resume
  const initialStreamingMessageId = initialActiveJobId
    ? `temp-assistant-resume-${initialActiveJobId}`
    : null;
  const initialProvider = initialConversation?.ai_provider || modelsConfig.defaultModelId;
  const initialModelName = modelsConfig.models.find(m => m.id === initialProvider)?.name ?? initialProvider;
  const defaultStatus = initialActiveJobId
    ? (initialStreamingStatus || (initialStreamingRole === 'summary' ? 'Summarizing' : `Talking to ${initialModelName.split(' ')[0]}`))
    : '';

  // Include streaming message in initial state for SSR
  const computedInitialMessages = initialActiveJobId
    ? [
      ...initialMessages,
      {
        id: initialStreamingMessageId!,
        role: initialStreamingRole,
        content: initialStreamingContent || '',
        model: initialModelName,
        wasGrounded: false,
        status: defaultStatus,
      },
    ]
    : initialMessages;

  const [messages, setMessages] = useState<Message[]>(computedInitialMessages);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [conversation, setConversation] = useState<Conversation | null>(initialConversation);
  const [conversationAttachments, setConversationAttachments] = useState<FileAttachment[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(initialStreamingMessageId);
  const [streamingThoughts, setStreamingThoughts] = useState<string>(initialStreamingThoughts || "");
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set()); // Track which messages have expanded thoughts
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [thinkingDuration, setThinkingDuration] = useState<number | null>(null);
  const [finalThoughts, setFinalThoughts] = useState<string>(""); // Preserved after stream ends
  const [documentContexts, setDocumentContexts] = useState<{ id: string; title: string }[]>(initialDocumentContexts || []);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMoveToFolderModal, setShowMoveToFolderModal] = useState(false);
  const [showVerifyMenu, setShowVerifyMenu] = useState(false);
  const [verifyModel, setVerifyModel] = useState<string>(initialVerifyModel || 'xai');
  const [lastOpenedItem, setLastOpenedItem] = useState<{ type: string; id: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingConversationIdRef = useRef<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const streamingMessageRef = useRef<HTMLDivElement>(null);
  const hasScrolledToStreamRef = useRef(false);
  const thoughtsContainerRef = useRef<HTMLDivElement>(null);

  const lastInitializedIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const lastSentMessageRef = useRef<string>("");
  const lastMessageSourceRef = useRef<'user' | 'action'>('user');
  const messagesAddedRef = useRef<number>(0);
  const isNewConversationRef = useRef(false);

  // Save verify model preference when changed
  const handleVerifyModelChange = useCallback((model: string) => {
    setVerifyModel(model);
    fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'verify:model', value: model }),
    }).catch(() => {/* ignore errors */ });
  }, []);

  // Sync internal state when conversation identity changes
  useEffect(() => {
    // Only run initialization if the conversation ID has changed
    // distinct from the last one we initialized.
    // This prevents re-running initialization (and resetting context) when
    // stable dependencies like context setters might change identity.
    if (initialConversationId !== lastInitializedIdRef.current) {
      lastInitializedIdRef.current = initialConversationId;

      setConversationId(initialConversationId);
      // Use computed messages that include streaming message if resuming
      setMessages(computedInitialMessages);
      setConversation(initialConversation);
      // Preserve streaming state if resuming an active job
      setStreamingMessageId(initialStreamingMessageId);
      setStreamingThoughts(initialStreamingThoughts || "");

      // Update context settings from initial conversation
      if (initialConversation) {
        if (initialConversation.ai_provider) {
          setAiProvider(initialConversation.ai_provider);
        }
        if (initialConversation.response_mode) {
          setResponseMode(initialConversation.response_mode as 'quick' | 'detailed');
        }
      }

      // Scroll to bottom or restore scroll position after initial load
      if (initialMessages.length > 0) {
        const restoreScroll = searchParams.get('restoreScroll') === 'true';
        if (restoreScroll && initialConversationId) {
          const savedPos = localStorage.getItem(`scrollPos:chat:${initialConversationId}`);
          if (savedPos) {
            setTimeout(() => {
              const container = messagesContainerRef.current;
              if (container) container.scrollTop = parseInt(savedPos, 10);
            }, 100);
          }
        } else if (shouldScroll) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
          }, 100);
        }
      }
    }
  }, [initialConversationId, initialMessages, initialConversation, setAiProvider, setResponseMode]);

  // Load attachments if conversationId exists
  useEffect(() => {
    if (conversationId) {
      loadAttachments();
    }
  }, [conversationId]);

  // Hydrate lastOpenedItem from localStorage after mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastOpenedItem');
      if (saved) setLastOpenedItem(JSON.parse(saved));
    } catch { }
  }, []);

  // Track last opened item in localStorage
  useEffect(() => {
    if (conversationId) {
      const item = { type: 'chat', id: conversationId };
      localStorage.setItem('lastOpenedItem', JSON.stringify(item));
      setLastOpenedItem(item);
    }
  }, [conversationId]);

  // Save scroll position on scroll (debounced)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !conversationId) return;

    let timeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        localStorage.setItem(`scrollPos:chat:${conversationId}`, String(container.scrollTop));
      }, 300);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      clearTimeout(timeout);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [conversationId]);

  const loadAttachments = async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}/attachments`);
      const data = await res.json();
      if (data.success && data.attachments) {
        setConversationAttachments(data.attachments);
      }
    } catch (error) {
      console.error("Failed to load attachments:", error);
    }
  }


  // No client-side document fetching anymore as it is passed from the server
  useEffect(() => {
    if (initialDocumentContexts && initialDocumentContexts.length > 0) {
      setDocumentContexts(initialDocumentContexts);
    }
  }, [initialDocumentContexts]);

  // Resume streaming if there's an active job on mount
  // Note: The streaming message is already included in initial state for SSR
  useEffect(() => {
    if (initialActiveJobId && initialConversation) {
      // Use the same message ID as computed in initial state
      const tempAssistantMessageId = `temp-assistant-resume-${initialActiveJobId}`;
      const provider = initialConversation.ai_provider || modelsConfig.defaultModelId;

      // Message is already in initial state, just set loading and connect
      messagesAddedRef.current = 1;
      setIsLoading(true);

      // Scroll to bottom when resuming stream
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
      }, 100);

      // Connect to job stream, starting from where we left off
      connectToJobStream(initialActiveJobId, tempAssistantMessageId, provider, undefined, initialLastSeq);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialActiveJobId]);

  // Helper to connect to job stream and handle events
  const connectToJobStream = useCallback((
    jobId: string,
    tempAssistantMessageId: string,
    finalProvider: string,
    onDone?: () => void,
    sinceSeq: number = 0
  ) => {
    let accumulatedThoughts = "";
    let localThinkingStartTime: number | null = null;
    let localThinkingDuration: number | undefined;

    const streamUrl = sinceSeq > 0
      ? `/api/jobs/${jobId}/stream?since_seq=${sinceSeq}`
      : `/api/jobs/${jobId}/stream`;
    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;
    currentJobIdRef.current = jobId;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Stream ended
        if (data.done) {
          eventSource.close();
          eventSourceRef.current = null;
          currentJobIdRef.current = null;
          streamingConversationIdRef.current = null;
          isNewConversationRef.current = false;
          setStreamingMessageId(null);
          setIsLoading(false);
          onDone?.();
          return;
        }

        // Handle different event kinds from job stream
        if (data.kind === 'output') {
          const payload = data.payload;

          // Init event
          if (payload.type === 'init') {
            streamingConversationIdRef.current = payload.conversationId;
            return;
          }

          // Final done event
          if (payload.final) {
            if (payload.error) {
              console.error("Chat error:", payload.error);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempAssistantMessageId
                    ? { ...msg, error: payload.error }
                    : msg
                )
              );
              setStreamingMessageId(null);
              setIsLoading(false);
              return;
            }

            const sourcesJson = payload.sources ? JSON.stringify(payload.sources) : undefined;
            const finalDuration = payload.thinkingDuration ?? localThinkingDuration;
            if (finalDuration !== undefined) {
              setThinkingDuration(finalDuration);
            }
            const thoughtsForMessage = accumulatedThoughts || undefined;
            if (thoughtsForMessage) {
              setFinalThoughts(thoughtsForMessage);
            }

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === tempAssistantMessageId
                  ? {
                    ...msg,
                    id: payload.messageId || msg.id,
                    sources: sourcesJson,
                    model: payload.model || (modelsConfig.models.find(m => m.id === finalProvider)?.name ?? finalProvider),
                    wasGrounded: false,
                    thoughts: thoughtsForMessage,
                    thinking_duration: finalDuration
                  }
                  : msg
              )
            );

            // Handle title update for new conversations
            if (payload.title && payload.conversation) {
              setConversation(payload.conversation);
              setConversations((prev) => {
                const exists = prev.find((c) => c.id === payload.conversation.id);
                if (exists) {
                  return prev.map((c) =>
                    c.id === payload.conversation.id ? payload.conversation : c
                  );
                }
                return [payload.conversation, ...prev];
              });
            }

            setStreamingMessageId(null);
            return;
          }

          // Streaming text chunk
          if (payload.text) {
            // When content starts, calculate thinking duration and preserve thoughts
            if (accumulatedThoughts && localThinkingDuration === undefined) {
              if (localThinkingStartTime) {
                localThinkingDuration = Math.round((Date.now() - localThinkingStartTime) / 1000);
                setThinkingDuration(localThinkingDuration);
              }
              setFinalThoughts(accumulatedThoughts);
            }
            setStreamingThoughts((prevThoughts) => {
              if (prevThoughts) {
                setFinalThoughts(prevThoughts);
                setThinkingStartTime((startTime) => {
                  if (startTime) {
                    const duration = Math.round((Date.now() - startTime) / 1000);
                    setThinkingDuration(duration);
                  }
                  return null;
                });
              }
              return "";
            });
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === tempAssistantMessageId
                  ? { ...msg, content: msg.content + payload.text }
                  : msg
              )
            );
            if (!hasScrolledToStreamRef.current) {
              hasScrolledToStreamRef.current = true;
              setTimeout(() => {
                if (streamingMessageRef.current) {
                  streamingMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }, 50);
            }
          }
        } else if (data.kind === 'thought') {
          // Thought event
          if (localThinkingStartTime === null) {
            localThinkingStartTime = Date.now();
          }
          setThinkingStartTime((prev) => prev === null ? Date.now() : prev);
          accumulatedThoughts += data.payload.text;
          setStreamingThoughts((prev) => prev + data.payload.text);
          setTimeout(() => {
            if (thoughtsContainerRef.current) {
              thoughtsContainerRef.current.scrollTop = thoughtsContainerRef.current.scrollHeight;
            }
          }, 10);
        } else if (data.kind === 'status') {
          // Status event
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantMessageId
                ? { ...msg, status: data.payload.status }
                : msg
            )
          );
        }
      } catch (e) {
        console.warn("Parse error for event:", event.data, e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
      currentJobIdRef.current = null;
      streamingConversationIdRef.current = null;
      setStreamingMessageId(null);
      setIsLoading(false);
    };

    return eventSource;
  }, [setConversations, setIsLoading, modelsConfig.models]);

  const sendMessage = useCallback(async (options?: {
    message?: string;
    provider?: string;
    skipProviderUpdate?: boolean;
    endpoint?: string;
    thinking?: boolean;
  }) => {
    const finalInput = options?.message || input.trim();
    const finalProvider = options?.provider || aiProvider;
    const finalThinking = options?.thinking !== undefined ? options.thinking : thinking;
    const endpoint = options?.endpoint || "/api/chat";
    const skipProviderUpdate = options?.skipProviderUpdate;

    if (!finalInput || isLoading) return;

    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const isSummary = endpoint === "/api/summarize";

    const isUserTyping = !options?.message && endpoint === "/api/chat";
    lastMessageSourceRef.current = isUserTyping ? 'user' : 'action';

    if (isUserTyping) {
      lastSentMessageRef.current = finalInput;
    } else {
      lastSentMessageRef.current = "";
    }

    const userMessage = finalInput;
    const currentImage = imageAttachment ? {
      mimeType: imageAttachment.mimeType,
      base64: imageAttachment.base64,
    } : null;
    const currentFiles = fileAttachments.map(f => ({
      uri: f.uri,
      mimeType: f.mimeType,
      fileName: f.fileName,
      uploadedAt: f.uploadedAt,
      expirationTime: f.expirationTime,
    }));

    if (!options?.message) {
      setInput("");
      clearImageAttachment();
      clearFileAttachments();
    }
    setIsLoading(true);
    streamingConversationIdRef.current = null;

    const tempUserMessageId = `temp-user-${Date.now()}`;
    const tempAssistantMessageId = `temp-assistant-${Date.now()}`;
    const fileCount = currentFiles.length;
    let messagesAdded = 0;

    if (!isSummary) {
      setMessages((prev) => [
        ...prev,
        { id: tempUserMessageId, role: "user" as const, content: userMessage, fileCount },
      ]);
      messagesAdded++;
    }

    const currentModelName = modelsConfig.models.find(m => m.id === finalProvider)?.name ?? finalProvider;
    setMessages((prev) => [
      ...prev,
      {
        id: tempAssistantMessageId,
        role: isSummary ? "summary" : "assistant",
        content: "",
        model: currentModelName,
        wasGrounded: false
      },
    ]);
    messagesAdded++;
    messagesAddedRef.current = messagesAdded;

    setStreamingMessageId(tempAssistantMessageId);
    setStreamingThoughts("");
    setThinkingStartTime(null);
    setThinkingDuration(null);
    setFinalThoughts("");
    hasScrolledToStreamRef.current = false;

    setTimeout(() => {
      if (streamingMessageRef.current) {
        streamingMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);

    // Get user location if possible
    let location: string | undefined;

    try {
      // Use existing location if available (optimistic), or wait for fresh one
      if (locationContext.isTrackingEnabled) {
        // If we need to wait, show a status update
        location = await locationContext.getLocation((status) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantMessageId
                ? { ...msg, status }
                : msg
            )
          );
        });
      }
    } catch (e) {
      console.log("Location fetch skipped:", e);
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          conversationId: conversationId,
          grounding: false,
          thinking: finalThinking,
          mode: responseMode,
          folderId: defaultFolderId,
          image: currentImage,
          files: currentFiles.length > 0 ? currentFiles : undefined,
          aiProvider: finalProvider,
          location,
          skipProviderUpdate,
          documentIds: documentContexts.map(doc => doc.id),
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const result = await response.json();

      // Handle new conversation
      if (result.isNewConversation && result.conversationId) {
        isNewConversationRef.current = true;
        setConversationId(result.conversationId);
        streamingConversationIdRef.current = result.conversationId;
        if (onConversationCreated) {
          onConversationCreated(result.conversationId);
        }
      }

      // Connect to job stream
      if (result.jobId) {
        connectToJobStream(result.jobId, tempAssistantMessageId, finalProvider);
      } else {
        throw new Error("No job ID returned");
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Failed to send message:", error);
      }
      setStreamingMessageId(null);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [input, isLoading, conversationId, thinking, responseMode, aiProvider, defaultFolderId, onConversationCreated, setInput, setIsLoading, imageAttachment, clearImageAttachment, fileAttachments, clearFileAttachments, documentContexts, connectToJobStream, modelsConfig.models, locationContext]);

  const stopStreaming = useCallback(async () => {
    // Immediately enter cancelling state and restore input
    setIsCancelling(true);

    // Restore the last sent message to the input ONLY if it was a user typed message
    if (lastMessageSourceRef.current === 'user' && lastSentMessageRef.current) {
      setInput(lastSentMessageRef.current);
    }

    // Update the streaming message status to show "Cancelling..."
    if (streamingMessageId) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === streamingMessageId
            ? { ...msg, status: 'Cancelling' }
            : msg
        )
      );
    }

    // Close EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Request job stop via API and wait for it to complete (server does cleanup)
    if (currentJobIdRef.current) {
      try {
        await fetch(`/api/jobs/${currentJobIdRef.current}/stop`, { method: 'POST' });
      } catch {
        // Ignore errors
      }
      currentJobIdRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Remove the messages added during this session
    // For regular chat: removes 2 (user message + assistant placeholder)
    // For summary: removes 1 (summary placeholder logic might vary if we didn't add user message)
    // We rely on messagesAddedRef to know exactly how many to remove.
    const countToRemove = messagesAddedRef.current || 2; // Default to 2 for safety if ref is 0 (shouldn't happen)
    setMessages(prev => prev.slice(0, -countToRemove));

    // If this was a newly created conversation, the server will delete it on cancel.
    // Reset conversationId so the next send creates a fresh conversation.
    if (isNewConversationRef.current) {
      setConversationId(null);
      onConversationReset?.();
      isNewConversationRef.current = false;
    }

    setIsLoading(false);
    setIsCancelling(false);
    setStreamingMessageId(null);
    setStreamingThoughts("");
    streamingConversationIdRef.current = null;

    // Focus input and move cursor to end after cancellation is complete
    if (lastMessageSourceRef.current === 'user' && lastSentMessageRef.current) {
      setTimeout(() => {
        focusInputRef.current?.();
      }, 0);
    }
  }, [setIsLoading, setIsCancelling, setInput, setMessages, focusInputRef, streamingMessageId, onConversationReset]);

  // Register sendMessage and stopStreaming with context
  useEffect(() => {
    sendMessageRef.current = sendMessage;
    stopStreamingRef.current = stopStreaming;
    return () => {
      sendMessageRef.current = null;
      stopStreamingRef.current = null;
    };
  }, [sendMessage, stopStreaming, sendMessageRef, stopStreamingRef]);

  // Failsafe to ensure streaming state is cleared when loading stops
  // Track if we've ever been in loading state to avoid clearing on initial mount
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (isLoading) {
      wasLoadingRef.current = true;
    } else if (wasLoadingRef.current) {
      // Only clear if we transitioned from loading to not loading
      setStreamingMessageId(null);
    }
  }, [isLoading]);

  const handleVerify = () => {
    // Use the selected verify model
    sendMessage({ message: "Can you verify", provider: verifyModel, skipProviderUpdate: true, thinking: true });
  };

  const handleSummarize = () => {
    // We use a standalone endpoint for summary
    sendMessage({ message: "Summarize this conversation", provider: 'gemini', skipProviderUpdate: true, endpoint: "/api/summarize" });
  };

  const handleOpenLast = () => {
    const saved = localStorage.getItem('lastOpenedItem');
    if (saved) {
      try {
        const item = JSON.parse(saved);
        if (item.type === 'chat' && item.id) {
          router.push(`/chat/${item.id}?restoreScroll=true`);
          return;
        } else if (item.type === 'doc' && item.id) {
          router.push(`/doc/${item.id}?restoreScroll=true`);
          return;
        }
      } catch { }
    }
    // Fallback: open latest conversation
    if (conversations.length > 0) {
      const latest = [...conversations].sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )[0];
      router.push(`/chat/${latest.id}?scroll=true`);
    }
  };

  const handleTodayNews = () => {
    if (isLoading) return;
    sendMessage({ message: "Analyze the top 10 most impactful global news stories from today from diverse credible sources. For each story, provide a clear headline and a concise 1-2 sentence summary. Prioritize major geopolitical, technological, and scientific developments. Also, please check my personal context/memory and include any major news that is specifically relevant to me." });
  };

  const handlePrint = () => {
    setShowMenu(false);
    window.print();
  };



  const renderDocumentContext = () => {
    if (!documentContexts || documentContexts.length === 0) return null;
    return documentContexts.map(doc => (
      <div
        key={doc.id}
        className="document-context-card"
        onClick={() => router.push(`/doc/${doc.id}`)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          marginBottom: '24px',
          cursor: 'pointer',
          maxWidth: '400px',
          transition: 'all 0.2s ease',
          marginLeft: 'auto',
          alignSelf: 'flex-end'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-hover)';
          e.currentTarget.style.background = 'var(--bg-tertiary)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.background = 'var(--bg-secondary)';
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)'
        }}>
          <FileText size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
            Document Context
          </div>
          <div style={{
            fontSize: '0.9rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {doc.title}
          </div>
        </div>
      </div>
    ));
  };

  return (
    <div className="messages-container" ref={messagesContainerRef}>
      {/* Print-only conversation title */}
      {conversation && messages.length > 0 && (
        <div className="chat-print-title">
          {conversation.title}
        </div>
      )}

      {/* Chat header with title and menu - only show when there's a conversation */}
      {conversation && messages.length > 0 && (
        <div className="chat-header">
          <h1 className="chat-title">{conversation.title}</h1>
          <div className="chat-menu-container">
            <button
              className="chat-menu-button"
              onClick={() => setShowMenu(!showMenu)}
              aria-label="More options"
            >
              <MoreVertical size={20} />
            </button>
            {showMenu && (
              <>
                <div
                  className="chat-menu-overlay"
                  onClick={() => setShowMenu(false)}
                />
                <div className="chat-menu-dropdown">
                  <button
                    className="chat-menu-item"
                    onClick={() => {
                      setShowMenu(false);
                      setShowMoveToFolderModal(true);
                    }}
                  >
                    <FolderOpen size={16} />
                    <span>Move</span>
                  </button>
                  <button
                    className="chat-menu-item"
                    onClick={() => {
                      setShowMenu(false);
                      setShowShareModal(true);
                    }}
                  >
                    <Share2 size={16} />
                    <span>Share</span>
                  </button>
                  <button
                    className="chat-menu-item"
                    onClick={handlePrint}
                  >
                    <Printer size={16} />
                    <span>Print</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="messages-wrapper" style={messages.length === 0 ? { flex: 1, display: 'flex', flexDirection: 'column' } : {}}>
        {renderDocumentContext()}
        {messages.length === 0 ? (
          <div className="empty-state" style={{ flex: 1, margin: 0, maxWidth: 'none', justifyContent: 'flex-start', paddingTop: '60px', position: 'relative' }}>
            {/* Location Toggle - Top Right */}
            <div style={{ position: 'absolute', top: '0', right: '0', zIndex: 10 }}>
              <button
                className={`location-toggle-btn ${locationContext.isTrackingEnabled ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  locationContext.toggleTracking();
                }}
                title={locationContext.isTrackingEnabled ? "Location is ON. Click to turn off tracking." : "Location is OFF. Click to turn on tracking for local context."}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: locationContext.isTrackingEnabled ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-hover)';
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
              >
                {locationContext.isTrackingEnabled ? <MapPin size={20} /> : <MapPinOff size={20} />}
              </button>
            </div>
            {conversation?.title ? (
              <h2>{conversation.title}</h2>
            ) : null}

            <div style={{ marginTop: 'auto', paddingBottom: '20px' }}>
              <HighlightsSection initialData={initialHighlightsData} />
              <div className="home-action-buttons" style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'center',
              }}>
                <Button
                  onClick={handleOpenLast}
                  icon={lastOpenedItem?.type === 'doc' ? <FileText size={14} /> : <MessageSquare size={14} />}
                  fullWidth={false}
                  disabled={(!lastOpenedItem && conversations.length === 0) || isLoading}
                >
                  Open Last
                </Button>
                <Button
                  onClick={handleTodayNews}
                  icon={<Globe size={14} />}
                  fullWidth={false}
                  disabled={isLoading}
                >
                  Today News
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => {
              const isStreaming = message.id === streamingMessageId;
              return (
                <div
                  key={message.id}
                  ref={isStreaming ? streamingMessageRef : null}
                  className={`message ${message.role} ${isStreaming ? 'streaming' : ''}`}
                >
                  <div className="message-content">
                    <div className="message-text">
                      {message.role === "assistant" || message.role === "summary" ? (
                        message.error ? (
                          <div className="chat-error-message">
                            <AlertTriangle size={16} />
                            <span>{message.error}</span>
                          </div>
                        ) : isStreaming && !message.content ? (
                          <div>
                            {/* Clickable Thinking indicator */}
                            {streamingThoughts && (
                              <div className="thoughts-container" style={{ marginBottom: '12px' }}>
                                <div
                                  onClick={() => {
                                    const newSet = new Set(expandedThoughts);
                                    if (newSet.has(message.id)) {
                                      newSet.delete(message.id);
                                    } else {
                                      newSet.add(message.id);
                                    }
                                    setExpandedThoughts(newSet);
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.8rem',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border)',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                                    e.currentTarget.style.borderColor = 'var(--border-hover)';
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.background = 'var(--bg-secondary)';
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                  }}
                                >
                                  <Brain size={14} />
                                  <span>Thinking</span>
                                  <span className="loading-dots-wrapper">
                                    <span className="loading-dot">.</span>
                                    <span className="loading-dot">.</span>
                                    <span className="loading-dot">.</span>
                                  </span>
                                  <span style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: '4px' }}>
                                    {expandedThoughts.has(message.id) ? '▲' : '▼'}
                                  </span>
                                </div>
                                {expandedThoughts.has(message.id) && (
                                  <div
                                    ref={thoughtsContainerRef}
                                    className="content-styles"
                                    style={{
                                      maxHeight: '150px',
                                      overflowY: 'auto',
                                      fontSize: '0.8rem',
                                      color: 'var(--text-muted)',
                                      background: 'var(--bg-secondary)',
                                      borderRadius: '8px',
                                      padding: '12px 14px',
                                      marginTop: '8px',
                                      lineHeight: 1.5,
                                      border: '1px solid var(--border)',
                                    }}
                                  >
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {streamingThoughts}
                                    </ReactMarkdown>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="typing-indicator" style={{
                              fontSize: '0.85rem',
                              color: 'var(--text-muted)',
                              padding: '12px 0 24px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: 500,
                              lineHeight: 1
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                {(() => {
                                  if (message.status) {
                                    if (message.status.toLowerCase().includes('search')) {
                                      return <Search size={14} strokeWidth={2.5} />;
                                    }
                                    return <Globe size={14} strokeWidth={2.5} />;
                                  }
                                  if (streamingThoughts) {
                                    return null; // Don't show duplicate brain icon
                                  }
                                  if (message.role === 'summary') {
                                    return <Sparkles size={14} strokeWidth={2.5} />;
                                  }
                                  return <Brain size={14} strokeWidth={2.5} />;
                                })()}
                              </div>
                              <span className="message-status" style={{ display: 'flex', alignItems: 'baseline' }}>
                                {message.status ? message.status.replace(/\.\.\.+$/, '').trim() : (
                                  streamingThoughts ? '' : (message.role === 'summary' ? 'Summarizing' : `Talking to ${message.model?.split(' ')[0] || 'AI'}`)
                                )}
                                {!streamingThoughts && (
                                  <span className="loading-dots-wrapper">
                                    <span className="loading-dot">.</span>
                                    <span className="loading-dot">.</span>
                                    <span className="loading-dot">.</span>
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="content-styles">
                            {message.model && message.role === "assistant" && (
                              <div className="model-tag" style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                marginBottom: '4px',
                                opacity: 0.7,
                                fontWeight: 500
                              }}>
                                {message.model}
                              </div>
                            )}
                            {/* "Thought for X seconds" - show for messages with thoughts (either live session or saved) */}
                            {(() => {
                              // Only use live session state for the message that is/was streaming
                              // All other messages use their saved thoughts from the database
                              const isCurrentStreamingMessage = message.id === streamingMessageId ||
                                (streamingMessageId === null && finalThoughts && message.id === messages[messages.length - 1]?.id);

                              // Use live session thoughts only for the current/just-finished streaming message
                              const thoughtsToShow = isCurrentStreamingMessage && finalThoughts ? finalThoughts : message.thoughts;
                              const durationToShow = isCurrentStreamingMessage && thinkingDuration !== null ? thinkingDuration : message.thinking_duration;

                              // Only show if we have thoughts and a duration
                              if (!thoughtsToShow || durationToShow === undefined || durationToShow === null) return null;

                              return (
                                <div className="thoughts-container" style={{ marginBottom: '12px' }}>
                                  <div
                                    onClick={() => {
                                      const newSet = new Set(expandedThoughts);
                                      if (newSet.has(message.id)) {
                                        newSet.delete(message.id);
                                      } else {
                                        newSet.add(message.id);
                                      }
                                      setExpandedThoughts(newSet);
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '0.75rem',
                                      color: 'var(--text-muted)',
                                      cursor: 'pointer',
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      background: 'var(--bg-secondary)',
                                      border: '1px solid var(--border)',
                                      transition: 'all 0.15s ease',
                                      opacity: 0.85,
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.background = 'var(--bg-tertiary)';
                                      e.currentTarget.style.borderColor = 'var(--border-hover)';
                                      e.currentTarget.style.opacity = '1';
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.background = 'var(--bg-secondary)';
                                      e.currentTarget.style.borderColor = 'var(--border)';
                                      e.currentTarget.style.opacity = '0.85';
                                    }}
                                  >
                                    <Brain size={12} />
                                    <span>Thought for {durationToShow}s</span>
                                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>
                                      {expandedThoughts.has(message.id) ? '▲' : '▼'}
                                    </span>
                                  </div>
                                  {expandedThoughts.has(message.id) && (
                                    <div
                                      ref={isCurrentStreamingMessage ? thoughtsContainerRef : undefined}
                                      className="content-styles"
                                      style={{
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        fontSize: '0.8rem',
                                        color: 'var(--text-muted)',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: '8px',
                                        padding: '12px 14px',
                                        marginTop: '8px',
                                        lineHeight: 1.5,
                                        border: '1px solid var(--border)',
                                      }}
                                    >
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {thoughtsToShow}
                                      </ReactMarkdown>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {parseImageBlocks(unescapeContent(message.content)).map((segment, segIdx) =>
                              segment.type === 'images' ? (
                                <ImageGallery key={segIdx} images={segment.images} loading={segment.loading} />
                              ) : (
                                <ReactMarkdown
                                  key={segIdx}
                                  remarkPlugins={[remarkGfm]}
                                  rehypePlugins={[rehypeHighlight]}
                                  urlTransform={(url) => url}
                                  components={{
                                    ul: ({ ...props }) => <ul className="markdown-list" {...props} />,
                                    ol: ({ ...props }) => <ol className="markdown-list" {...props} />,
                                    li: ({ children, ...props }) => <li className="markdown-list-item" {...props}>{children}</li>,
                                    p: ({ ...props }) => <p className="markdown-paragraph" {...props} />,
                                    strong: ({ ...props }) => <strong className="markdown-strong" {...props} />,
                                    code: ({ inline, ...props }: any) =>
                                      inline ? <code className="markdown-inline-code" {...props} /> : <code className="markdown-code" {...props} />,
                                    pre: ({ ...props }) => <pre className="markdown-pre" {...props} />,
                                    table: ({ ...props }) => <div className="markdown-table-wrapper"><table className="markdown-table" {...props} /></div>,
                                    thead: ({ ...props }) => <thead className="markdown-thead" {...props} />,
                                    tbody: ({ ...props }) => <tbody className="markdown-tbody" {...props} />,
                                    tr: ({ ...props }) => <tr className="markdown-tr" {...props} />,
                                    th: ({ ...props }) => <th className="markdown-th" {...props} />,
                                    td: ({ ...props }) => <td className="markdown-td" {...props} />,
                                    hr: ({ ...props }) => <hr className="markdown-hr" {...props} />,
                                    a: ({ children, ...props }) => {
                                      const childrenArray = Array.isArray(children) ? children : [children];
                                      const text = childrenArray
                                        .map(child => (typeof child === 'string' || typeof child === 'number') ? child : '')
                                        .join('')
                                        .trim();
                                      const isCitation = /^\[\d+\]$/.test(text) || /^\d+$/.test(text) || text === 'source' || text === '[source]';
                                      return (
                                        <a
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={isCitation ? "markdown-citation" : ""}
                                          {...props}
                                        >
                                          {isCitation ? text.replace(/[\[\]]/g, "") : children}
                                        </a>
                                      );
                                    },
                                  }}
                                >
                                  {segment.content}
                                </ReactMarkdown>
                              )
                            )}
                          </div>
                        )
                      ) : (
                        <>
                          <p>{message.content}</p>
                          {(message.fileCount ?? 0) > 0 && (
                            <div className="message-meta">
                              <div className="message-file-badge">
                                <Paperclip size={14} /> {message.fileCount} file{message.fileCount! > 1 ? 's' : ''}
                              </div>
                              <FileExpirationWarning
                                messageId={message.id}
                                role={message.role}
                                attachments={conversationAttachments.filter(a => a.message_id === message.id)}
                              />
                            </div>
                          )}
                        </>
                      )}
                      {message.role === "assistant" && !isStreaming && (() => {
                        if (!message.sources) return null;
                        try {
                          const sources = typeof message.sources === 'string'
                            ? JSON.parse(message.sources)
                            : message.sources;
                          if (Array.isArray(sources) && sources.length > 0) {
                            return (
                              <div className="message-sources">
                                <div className="message-sources-list">
                                  {sources.map((source: any, idx: number) => {
                                    const url = source.uri || '';
                                    let domain = '';
                                    try {
                                      if (url) domain = new URL(url).hostname.replace('www.', '');
                                    } catch (e) { }

                                    const displayText = (source.title && !/^\d+$/.test(source.title.trim()))
                                      ? source.title
                                      : (domain || url || `Source ${idx + 1}`);

                                    return (
                                      <a
                                        key={idx}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="message-source-link"
                                        title={source.title || url}
                                      >
                                        <span className="message-source-text">
                                          {displayText}
                                        </span>
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        } catch (e) {
                          return null;
                        }
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
            {messages.length > 0 && !isLoading && !streamingMessageId && (
              <div className="action-container" style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                padding: '16px 0',
                marginTop: '8px'
              }}>
                <Button
                  onClick={handleSummarize}
                  className="summarize-button"
                  icon={<FileText size={14} />}
                  fullWidth={false}
                >
                  Summarize
                </Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div className="verify-split-button" style={{ display: 'flex', position: 'relative' }}>
                    <Button
                      onClick={handleVerify}
                      className="verify-button-main"
                      icon={<ShieldCheck size={14} />}
                      fullWidth={false}
                      style={{
                        borderTopRightRadius: 0,
                        borderBottomRightRadius: 0,
                        borderRight: 'none',
                        paddingRight: '10px'
                      }}
                      title={`Verify with ${getModelName(verifyModel)}`}
                    >
                      Verify with {getModelName(verifyModel)}
                    </Button>
                    <button
                      onClick={() => setShowVerifyMenu(!showVerifyMenu)}
                      className="verify-button-arrow"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--border)',
                        borderLeft: '1px solid var(--border-light)', // Subtle separator
                        borderRadius: '0 4px 4px 0',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        padding: '0 6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                    >
                      <ChevronDown size={14} />
                    </button>

                    {showVerifyMenu && (
                      <>
                        <div
                          className="menu-overlay"
                          style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 999,
                          }}
                          onClick={() => setShowVerifyMenu(false)}
                        />
                        <div
                          className="verify-menu-dropdown"
                          style={{
                            position: 'absolute',
                            bottom: '100%',
                            right: 0,
                            marginBottom: '4px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                            zIndex: 1000,
                            minWidth: '160px',
                            padding: '4px',
                            overflow: 'hidden'
                          }}
                        >
                          {modelsConfig.models.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                handleVerifyModelChange(model.id);
                                setShowVerifyMenu(false);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                padding: '8px 12px',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                textAlign: 'left',
                              }}
                              onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <span>{model.name}</span>
                              {verifyModel === model.id && <Check size={14} style={{ opacity: 0.7 }} />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      {conversationId && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          type="conversation"
          resourceId={conversationId}
        />
      )}
      {conversationId && (
        <MoveToFolderModal
          isOpen={showMoveToFolderModal}
          onClose={() => setShowMoveToFolderModal(false)}
          currentFolderId={conversation?.folder_id ?? null}
          folders={folders}
          onMove={(folderId) => moveConversationToFolder(conversationId, folderId)}
        />
      )}
    </div>
  );
}
