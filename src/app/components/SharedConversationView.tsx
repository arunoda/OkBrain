"use client";

import ReactMarkdown from "react-markdown";
import ImageGallery, { parseImageBlocks } from "./ImageGallery";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Brain, Paperclip, Globe } from "lucide-react";
import "./primitive/ContentStyles.module.css";
import "./Markdown.module.css";
import "./ChatLayout.module.css";
import "highlight.js/styles/vs2015.css";

interface Message {
  id: string;
  role: "user" | "assistant" | "summary";
  content: string;
  model?: string;
  sources?: string;
  wasGrounded?: boolean;
  thoughts?: string;
  thinking_duration?: number;
}

interface SharedConversationViewProps {
  title: string;
  messages: Message[];
}

function unescapeContent(content: string): string {
  return content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r');
}

export default function SharedConversationView({ title, messages }: SharedConversationViewProps) {
  return (
    <div className="messages-container" style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div className="messages-wrapper" style={{ maxWidth: '700px', margin: '0 auto', padding: '60px 20px' }}>
        <style jsx global>{`
          @media print {
            .shared-header, .shared-footer {
              display: none !important;
            }
            @page {
              margin: 0.5in;
              size: auto;
            }
            html, body {
              height: auto !important;
              overflow: visible !important;
              background: white !important;
              color: black !important;
            }
            /* Target the Next.js main wrapper in shared page */
            main {
              height: auto !important;
              overflow: visible !important;
              display: block !important;
            }
            .messages-container {
              background: white !important;
              min-height: 0 !important;
              height: auto !important;
              overflow: visible !important;
              display: block !important;
              padding: 0 !important;
            }
            .messages-wrapper {
              padding: 0 !important;
              margin: 0 !important;
              max-width: 100% !important;
              width: 100% !important;
              display: block !important;
            }
            .message-text {
              break-inside: avoid;
            }
            
            /* Hide thoughts in print */
            .thoughts-container {
              display: none !important;
            }
            
            /* Show model name in print and style it */
            .model-tag {
              display: block !important;
              color: #444 !important;
              font-size: 0.65rem !important;
              border: 1px solid #ddd !important;
              border-radius: 4px !important;
              padding: 2px 8px !important;
              margin-bottom: 8px !important;
              width: fit-content !important;
              background-color: transparent !important;
            }
            
            /* Style summary section in print */
            .message.summary {
              background-color: #eee !important;
              border: 1px solid #ddd !important;
              border-radius: 8px !important;
              padding: 16px !important;
              margin-bottom: 24px !important;
              box-shadow: none !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              display: block !important;
            }
            
            .message.summary .message-content,
            .message.summary .message-text,
            .message.summary .content-styles {
              background: transparent !important;
              box-shadow: none !important;
              border: none !important;
              padding: 0 !important;
            }
            
            .message.summary::before {
              content: "SUMMARY";
              font-size: 0.7rem;
              font-weight: bold;
              color: #888;
              display: block;
              margin-bottom: 8px;
            }
          }
        `}</style>

        <header className="shared-header" style={{ marginBottom: '48px', textAlign: 'center', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)', marginBottom: '16px' }}>
            <Globe size={18} />
            <span style={{ fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.7rem', opacity: 0.8 }}>Publicly Shared Chat</span>
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.2, color: 'var(--text-primary)', letterSpacing: '-0.02em', padding: '0 40px' }}>{title}</h1>
        </header>

        <div className="shared-messages-list" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          {messages.map((message) => {
            const isSummary = message.role === 'summary';
            return (
              <div
                key={message.id}
                className={`message ${message.role}`}
              >
                <div className="message-content">
                  <div className="message-text">
                    {(message.role === "assistant" || isSummary) ? (
                      <div className="content-styles" style={{ width: '100%' }}>
                        {message.model && message.role === "assistant" && (
                          <div className="model-tag" style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            marginBottom: '6px',
                            opacity: 0.8,
                            fontWeight: 500,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            {message.model}
                          </div>
                        )}

                        {message.thoughts && message.thinking_duration && (
                          <div className="thoughts-container" style={{ marginBottom: '16px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '0.75rem',
                              color: 'var(--text-muted)',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border)',
                              opacity: 0.9,
                            }}>
                              <Brain size={13} />
                              <span>Thought for {message.thinking_duration}s</span>
                            </div>
                          </div>
                        )}

                        <div style={{ color: isSummary ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
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


                        {(() => {
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
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="shared-footer" style={{ marginTop: '60px', paddingTop: '40px', borderTop: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p style={{ fontSize: '0.9rem' }}>Created with OkBrain AI Assistant</p>
      </footer>
    </div>
  );
}
