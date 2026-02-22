import React from 'react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import ImageGallery, { parseImageBlocks } from "./ImageGallery";
import FileExpirationWarning from "./FileExpirationWarning";
import { Brain, Search, Globe, Sparkles, Paperclip, AlertTriangle, ThumbsUp, ThumbsDown } from "lucide-react";
import styles from "./ChatMessage.module.css";
import { Message, FileAttachment } from "./ChatView";

function unescapeContent(content: string): string {
    return content
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
}

interface ChatMessageProps {
    message: Message;
    prevMessage?: Message;
    isFirst: boolean;
    isStreaming: boolean;
    streamingThoughts: string;
    finalThoughts: string;
    thinkingDuration: number | null;
    expandedThoughts: Set<string>;
    onToggleThoughts: (id: string) => void;
    onFeedback: (messageId: string, feedback: number | null) => void;
    streamingMessageRef?: React.RefObject<HTMLDivElement | null>;
    thoughtsContainerRef?: React.RefObject<HTMLDivElement | null>;
    attachments: FileAttachment[];
}

export default function ChatMessage({
    message,
    prevMessage,
    isFirst,
    isStreaming,
    streamingThoughts,
    finalThoughts,
    thinkingDuration,
    expandedThoughts,
    onToggleThoughts,
    onFeedback,
    streamingMessageRef,
    thoughtsContainerRef,
    attachments,
}: ChatMessageProps) {
    let dateSeparator = null;
    if (message.created_at) {
        const msgDate = new Date(message.created_at + (message.created_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
        const prevDate = prevMessage?.created_at
            ? new Date(prevMessage.created_at + (prevMessage.created_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
            : null;
        if (isFirst || msgDate !== prevDate) {
            dateSeparator = (
                <div className={`${styles.dateSeparator} ${isFirst ? styles.dateSeparatorFirst : ''}`}>
                    {msgDate}
                </div>
            );
        }
    }

    const thoughtsToShow = (isStreaming || finalThoughts) ? ((isStreaming ? streamingThoughts : finalThoughts) || message.thoughts) : message.thoughts;
    const durationToShow = (isStreaming || thinkingDuration !== null) ? thinkingDuration : message.thinking_duration;

    const isCurrentStreamingMessage = isStreaming ||
        (!isStreaming && finalThoughts && !message.thoughts && finalThoughts.length > 0);
    const actualThoughtsToShow = isCurrentStreamingMessage && finalThoughts ? finalThoughts : message.thoughts;

    return (
        <div key={message.id}>
            {dateSeparator}
            <div
                ref={isStreaming ? streamingMessageRef : null}
                className={`message ${message.role} ${isStreaming ? 'streaming' : ''}`}
            >
                <div className="message-content">
                    {message.role === "user" && message.created_at && (
                        <div className={styles.userTimestamp}>
                            {new Date(message.created_at + (message.created_at.endsWith('Z') ? '' : 'Z')).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </div>
                    )}
                    <div className="message-text">
                        {message.role === "assistant" || message.role === "summary" ? (
                            message.error ? (
                                <div className="chat-error-message">
                                    <AlertTriangle size={16} />
                                    <span>{message.error}</span>
                                </div>
                            ) : isStreaming && !message.content ? (
                                <div>
                                    {streamingThoughts && (
                                        <div className={`thoughts-container ${styles.thoughtsSpacing}`}>
                                            <div
                                                onClick={() => onToggleThoughts(message.id)}
                                                className={styles.thinkingButton}
                                            >
                                                <Brain size={14} />
                                                <span>Thinking</span>
                                                <span className="loading-dots-wrapper">
                                                    <span className="loading-dot">.</span>
                                                    <span className="loading-dot">.</span>
                                                    <span className="loading-dot">.</span>
                                                </span>
                                                <span className={styles.thinkingArrow}>
                                                    {expandedThoughts.has(message.id) ? '▲' : '▼'}
                                                </span>
                                            </div>
                                            {expandedThoughts.has(message.id) && (
                                                <div
                                                    ref={thoughtsContainerRef}
                                                    className={`content-styles ${styles.expandedThoughtsPanel}`}
                                                >
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {streamingThoughts}
                                                    </ReactMarkdown>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className={`typing-indicator ${styles.typingIndicatorStyles}`}>
                                        <div className={styles.typingIndicatorIcon}>
                                            {(() => {
                                                if (message.status) {
                                                    if (message.status.toLowerCase().includes('search')) {
                                                        return <Search size={14} strokeWidth={2.5} />;
                                                    }
                                                    return <Globe size={14} strokeWidth={2.5} />;
                                                }
                                                if (streamingThoughts) return null;
                                                if (message.role === 'summary') return <Sparkles size={14} strokeWidth={2.5} />;
                                                return <Brain size={14} strokeWidth={2.5} />;
                                            })()}
                                        </div>
                                        <span className={`message-status ${styles.messageStatusInline}`}>
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
                                        <div className={`model-tag ${styles.modelTag}`}>
                                            {message.model}
                                        </div>
                                    )}
                                    {(() => {
                                        if (!actualThoughtsToShow || durationToShow === undefined || durationToShow === null) return null;
                                        return (
                                            <div className={`thoughts-container ${styles.thoughtsSpacing}`}>
                                                <div
                                                    onClick={() => onToggleThoughts(message.id)}
                                                    className={styles.thoughtForButton}
                                                >
                                                    <Brain size={12} />
                                                    <span>Thought for {durationToShow}s</span>
                                                    <span className={styles.thoughtForArrow}>
                                                        {expandedThoughts.has(message.id) ? '▲' : '▼'}
                                                    </span>
                                                </div>
                                                {expandedThoughts.has(message.id) && (
                                                    <div
                                                        ref={isCurrentStreamingMessage ? thoughtsContainerRef : undefined}
                                                        className={`content-styles ${styles.expandedThoughtsPanel} ${styles.expandedThoughtsPanelTall}`}
                                                    >
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                            {actualThoughtsToShow}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    {parseImageBlocks(unescapeContent(message.content)).map((segment: any, segIdx) =>
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
                                                            .map((child: any) => (typeof child === 'string' || typeof child === 'number') ? child : '')
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
                                    {isStreaming && streamingThoughts && (
                                        <div className={`thoughts-container ${styles.thoughtsSpacing}`}>
                                            <div
                                                onClick={() => onToggleThoughts(`${message.id}:thinking`)}
                                                className={styles.thinkingButton}
                                            >
                                                <Brain size={14} />
                                                <span>Thinking</span>
                                                <span className="loading-dots-wrapper">
                                                    <span className="loading-dot">.</span>
                                                    <span className="loading-dot">.</span>
                                                    <span className="loading-dot">.</span>
                                                </span>
                                                <span className={styles.thinkingArrow}>
                                                    {expandedThoughts.has(`${message.id}:thinking`) ? '▲' : '▼'}
                                                </span>
                                            </div>
                                            {expandedThoughts.has(`${message.id}:thinking`) && (
                                                <div
                                                    ref={thoughtsContainerRef}
                                                    className={`content-styles ${styles.expandedThoughtsPanel}`}
                                                >
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {streamingThoughts}
                                                    </ReactMarkdown>
                                                </div>
                                            )}
                                        </div>
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
                                            attachments={attachments}
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

                        {message.role === "assistant" && !isStreaming && !message.error && (
                            <div className={`message-feedback ${styles.feedbackContainer}`}>
                                <button
                                    onClick={() => onFeedback(message.id, message.feedback === 1 ? null : 1)}
                                    className={`feedback-btn ${message.feedback === 1 ? `active ${styles.feedbackButtonActive}` : ''} ${styles.feedbackButton}`}
                                    title="Good response"
                                >
                                    <ThumbsUp size={14} strokeWidth={message.feedback === 1 ? 2.5 : 2} />
                                </button>
                                <button
                                    onClick={() => onFeedback(message.id, message.feedback === -1 ? null : -1)}
                                    className={`feedback-btn ${message.feedback === -1 ? `active ${styles.feedbackButtonActive}` : ''} ${styles.feedbackButton}`}
                                    title="Bad response"
                                >
                                    <ThumbsDown size={14} strokeWidth={message.feedback === -1 ? 2.5 : 2} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
