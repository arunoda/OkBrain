# ChatView.tsx Decomposition Plan

## Context

`ChatView.tsx` is 1,616 lines — the largest component in the project. It handles message rendering, streaming, empty state, header, action buttons, and feedback all in one file. The goal is to extract logical sections into focused sub-components and a custom hook, bringing ChatView down to an orchestration role (~400-500 lines).

## Extractions (ordered by impact)

### 1. `useChatStreaming` hook → `src/hooks/useChatStreaming.ts` (~430 lines)

Extract the streaming lifecycle logic into a custom hook. This is the biggest win — removes ~430 lines of dense logic from the component.

**What moves:**
- `connectToJobStream` callback (183 lines)
- `sendMessage` callback (172 lines)
- `stopStreaming` callback (69 lines)
- Related state: `streamingMessageId`, `streamingThoughts`, `thinkingStartTime`, `thinkingDuration`, `finalThoughts`
- Related refs: `eventSourceRef`, `abortControllerRef`, `currentJobIdRef`, `streamingConversationIdRef`, `hasScrolledToStreamRef`, `messagesAddedRef`, `isNewConversationRef`, `lastSentMessageRef`, `lastMessageSourceRef`
- Resume streaming useEffect
- Failsafe streaming clear useEffect
- Register sendMessage/stopStreaming with context useEffect

**Hook returns:**
```ts
{
  streamingMessageId, streamingThoughts,
  thinkingStartTime, thinkingDuration, finalThoughts,
  expandedThoughts, setExpandedThoughts,
}
```

### 2. `ChatMessage` component → `src/app/components/ChatMessage.tsx` (~300 lines)

Extract the single message rendering (the body of `messages.map()`). This is the densest JSX section.

**What moves:**
- Date separator rendering
- User message with timestamp
- Assistant/summary message with: error state, streaming state (thinking indicator, typing indicator), completed state (model tag, thoughts, markdown content, image gallery)
- Sources section
- Feedback buttons

**Props:**
```ts
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
  streamingMessageRef: React.RefObject<HTMLDivElement>;
  thoughtsContainerRef: React.RefObject<HTMLDivElement>;
  attachments: FileAttachment[];
}
```

### 3. `ChatEmptyState` component → `src/app/components/ChatEmptyState.tsx` (~60 lines)

**What moves:**
- Location toggle button
- Conversation title
- HighlightsSection wrapper
- Open Last / Today News buttons

**Props:**
```ts
interface ChatEmptyStateProps {
  conversation: Conversation | null;
  initialHighlightsData: HighlightData | null;
  onOpenLast: () => void;
  onTodayNews: () => void;
  isLoading: boolean;
  lastOpenedItem: { type: string; id: string } | null;
  conversationsCount: number;
}
```

Uses `useChatContext()` directly for `locationContext`.

### 4. `ChatActions` component → `src/app/components/ChatActions.tsx` (~80 lines)

**What moves:**
- Summarize button
- Verify split button with model dropdown
- Verify menu state (`showVerifyMenu`)
- `handleVerifyModelChange` callback

**Props:**
```ts
interface ChatActionsProps {
  onSummarize: () => void;
  onVerify: () => void;
  verifyModel: string;
  onVerifyModelChange: (model: string) => void;
}
```

Uses `useChatContext()` directly for `modelsConfig`.

### 5. `ChatHeader` component → `src/app/components/ChatHeader.tsx` (~70 lines)

**What moves:**
- Title display
- Menu dropdown (Move/Share/Print)
- Menu state (`showMenu`)

**Props:**
```ts
interface ChatHeaderProps {
  conversation: Conversation;
  onMoveToFolder: () => void;
  onShare: () => void;
  onPrint: () => void;
}
```

## CSS Module Split

Move relevant classes from `ChatView.module.css` to each new component's CSS module:
- `ChatMessage.module.css` — message-related classes (largest group)
- `ChatEmptyState.module.css` — empty state classes
- `ChatActions.module.css` — action/verify menu classes
- `ChatHeader` uses existing global classes, no new module needed
- `ChatView.module.css` keeps: `messagesWrapperEmpty`, `documentContextCard` and related classes

## Result

After all extractions:
- **ChatView.tsx**: ~400-500 lines (state, effects, orchestration JSX)
- **useChatStreaming.ts**: ~430 lines (streaming lifecycle)
- **ChatMessage.tsx**: ~300 lines (message rendering)
- **ChatActions.tsx**: ~80 lines (action buttons)
- **ChatHeader.tsx**: ~70 lines (header + menu)
- **ChatEmptyState.tsx**: ~60 lines (empty state)

## Execution Order

1. `useChatStreaming` hook (biggest impact, no JSX changes needed yet)
2. `ChatMessage` (biggest JSX extraction)
3. `ChatEmptyState` (simple extraction)
4. `ChatActions` (simple extraction)
5. `ChatHeader` (simple extraction)
6. Split CSS modules
7. Build verification after each step
