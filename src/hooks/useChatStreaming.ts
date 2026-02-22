import { useState, useRef, useEffect, useCallback } from "react";
import { Message, Conversation, FileAttachment } from "../app/components/ChatView";

interface UseChatStreamingOptions {
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    conversationId: string | null;
    setConversationId: (id: string | null) => void;
    conversation: Conversation | null;
    setConversation: (conv: Conversation | null) => void;
    modelsConfig: any;
    setConversations: any;
    input: string;
    setInput: (val: string) => void;
    isLoading: boolean;
    setIsLoading: (val: boolean) => void;
    isCancelling: boolean;
    setIsCancelling: (val: boolean) => void;
    thinking: boolean;
    responseMode: 'quick' | 'detailed';
    aiProvider: string;
    defaultFolderId: string | null;
    imageAttachment: any;
    clearImageAttachment: () => void;
    fileAttachments: any[];
    clearFileAttachments: () => void;
    onConversationCreated?: (id: string) => void;
    onConversationReset?: () => void;
    documentContexts: { id: string; title: string }[];
    locationContext: any;
    sendMessageRef: React.MutableRefObject<any>;
    stopStreamingRef: React.MutableRefObject<any>;
    focusInputRef: React.MutableRefObject<any>;
    streamingMessageRef: React.RefObject<HTMLDivElement | null>;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    thoughtsContainerRef: React.RefObject<HTMLDivElement | null>;
    initialStreamingMessageId: string | null;
    initialStreamingThoughts: string;
    initialActiveJobId: string | null;
    initialLastSeq: number;
}

export function useChatStreaming({
    messages,
    setMessages,
    conversationId,
    setConversationId,
    conversation,
    setConversation,
    modelsConfig,
    setConversations,
    input,
    setInput,
    isLoading,
    setIsLoading,
    isCancelling,
    setIsCancelling,
    thinking,
    responseMode,
    aiProvider,
    defaultFolderId,
    imageAttachment,
    clearImageAttachment,
    fileAttachments,
    clearFileAttachments,
    onConversationCreated,
    onConversationReset,
    documentContexts,
    locationContext,
    sendMessageRef,
    stopStreamingRef,
    focusInputRef,
    streamingMessageRef,
    messagesEndRef,
    thoughtsContainerRef,
    initialStreamingMessageId,
    initialStreamingThoughts,
    initialActiveJobId,
    initialLastSeq,
}: UseChatStreamingOptions) {
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(initialStreamingMessageId);
    const [streamingThoughts, setStreamingThoughts] = useState<string>(initialStreamingThoughts || "");
    const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set());
    const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
    const [thinkingDuration, setThinkingDuration] = useState<number | null>(null);
    const [finalThoughts, setFinalThoughts] = useState<string>("");

    const streamingConversationIdRef = useRef<string | null>(null);
    const hasScrolledToStreamRef = useRef(false);

    const abortControllerRef = useRef<AbortController | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const currentJobIdRef = useRef<string | null>(null);
    const lastSentMessageRef = useRef<string>("");
    const lastMessageSourceRef = useRef<'user' | 'action'>('user');
    const messagesAddedRef = useRef<number>(0);
    const isNewConversationRef = useRef(false);

    // Resume streaming if there's an active job on mount
    useEffect(() => {
        if (initialActiveJobId && conversation) {
            const tempAssistantMessageId = `temp-assistant-resume-${initialActiveJobId}`;
            const provider = conversation.ai_provider || modelsConfig.defaultModelId;

            messagesAddedRef.current = 1;
            setIsLoading(true);

            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
            }, 100);

            connectToJobStream(initialActiveJobId, tempAssistantMessageId, provider, undefined, initialLastSeq);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialActiveJobId]);

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

                if (data.kind === 'output') {
                    const payload = data.payload;

                    if (payload.type === 'init') {
                        streamingConversationIdRef.current = payload.conversationId;
                        return;
                    }

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
                                        model: payload.model || (modelsConfig.models.find((m: any) => m.id === finalProvider)?.name ?? finalProvider),
                                        wasGrounded: false,
                                        thoughts: thoughtsForMessage,
                                        thinking_duration: finalDuration
                                    }
                                    : msg
                            )
                        );

                        if (payload.title && payload.conversation) {
                            setConversation(payload.conversation);
                            setConversations((prev: any) => {
                                const exists = prev.find((c: any) => c.id === payload.conversation.id);
                                if (exists) {
                                    return prev.map((c: any) =>
                                        c.id === payload.conversation.id ? payload.conversation : c
                                    );
                                }
                                return [payload.conversation, ...prev];
                            });
                        }

                        setStreamingMessageId(null);
                        return;
                    }

                    if (payload.text) {
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

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
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
                { id: tempUserMessageId, role: "user" as const, content: userMessage, fileCount, created_at: new Date().toISOString() },
            ]);
            messagesAdded++;
        }

        const currentModelName = modelsConfig.models.find((m: any) => m.id === finalProvider)?.name ?? finalProvider;
        setMessages((prev) => [
            ...prev,
            {
                id: tempAssistantMessageId,
                role: isSummary ? "summary" : "assistant",
                content: "",
                model: currentModelName,
                wasGrounded: false,
                created_at: new Date().toISOString()
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

        let location: string | undefined;

        try {
            if (locationContext.isTrackingEnabled) {
                location = await locationContext.getLocation((status: string) => {
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

            if (result.isNewConversation && result.conversationId) {
                isNewConversationRef.current = true;
                setConversationId(result.conversationId);
                streamingConversationIdRef.current = result.conversationId;
                if (onConversationCreated) {
                    onConversationCreated(result.conversationId);
                }
            }

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
    }, [input, isLoading, conversationId, thinking, responseMode, aiProvider, defaultFolderId, onConversationCreated, setInput, setIsLoading, imageAttachment, clearImageAttachment, fileAttachments, clearFileAttachments, documentContexts, connectToJobStream, modelsConfig.models, locationContext, setMessages, setConversationId]);

    const stopStreaming = useCallback(async () => {
        setIsCancelling(true);

        if (lastMessageSourceRef.current === 'user' && lastSentMessageRef.current) {
            setInput(lastSentMessageRef.current);
        }

        if (streamingMessageId) {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === streamingMessageId
                        ? { ...msg, status: 'Cancelling' }
                        : msg
                )
            );
        }

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        if (currentJobIdRef.current) {
            try {
                await fetch(`/api/jobs/${currentJobIdRef.current}/stop`, { method: 'POST' });
            } catch {
            }
            currentJobIdRef.current = null;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        const countToRemove = messagesAddedRef.current || 2;
        setMessages(prev => prev.slice(0, -countToRemove));

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

        if (lastMessageSourceRef.current === 'user' && lastSentMessageRef.current) {
            setTimeout(() => {
                focusInputRef.current?.();
            }, 0);
        }
    }, [setIsLoading, setIsCancelling, setInput, setMessages, focusInputRef, streamingMessageId, onConversationReset, setConversationId]);

    useEffect(() => {
        sendMessageRef.current = sendMessage;
        stopStreamingRef.current = stopStreaming;
        return () => {
            sendMessageRef.current = null;
            stopStreamingRef.current = null;
        };
    }, [sendMessage, stopStreaming, sendMessageRef, stopStreamingRef]);

    const wasLoadingRef = useRef(false);
    useEffect(() => {
        if (isLoading) {
            wasLoadingRef.current = true;
        } else if (wasLoadingRef.current) {
            setStreamingMessageId(null);
        }
    }, [isLoading]);

    return {
        streamingMessageId,
        streamingThoughts,
        thinkingStartTime,
        thinkingDuration,
        finalThoughts,
        expandedThoughts,
        setExpandedThoughts,
        sendMessage,
        stopStreaming,
    };
}
