# Design: Add Anthropic AI Provider with Claude Haiku 4.5

## Context

The app has a pluggable AI provider system with Google (Gemini) and xAI (Grok) providers. The user wants to add Anthropic as a third provider, starting with Claude Haiku 4.5. The provider should only be registered when `ANTHROPIC_API_KEY` is set (matching the XAI pattern).

## Changes

### 1. Install `@ai-sdk/anthropic` package

```bash
npm install @ai-sdk/anthropic
```

### 2. Create adapter: `src/lib/ai/adapters/anthropic-adapter.ts`

Implements `AIProvider` interface, modeled after the XAI adapter:
- Uses `createAnthropic()` from `@ai-sdk/anthropic`
- Uses Vercel AI SDK's `streamText()` with `tool()` for tool calling
- Uses shared `buildZodSchema` from `tools/formatters.ts` (avoids duplicating Zod schema logic from XAI adapter)
- System prompt intro: `"You are Claude, an AI assistant created by Anthropic."`
- Handles "overloaded" errors with friendly messages (Anthropic's equivalent of xAI's "at capacity")
- Cost logging with Haiku pricing: input $0.80/1M, cached $0.08/1M, output $4.00/1M

### 3. Create provider: `src/lib/ai/providers/anthropic.ts`

Wrapped in `if (process.env.ANTHROPIC_API_KEY)` — models won't appear without the key:
- Provider id: `'anthropic'`, name: `'Anthropic'`
- Icon: `'anthropic'`, color: `'#D4A574'`
- Single model: id `'claude-haiku'`, name `'Claude Haiku 4.5'`, apiModel `'claude-haiku-4-5-20251001'`
- Capabilities: tools yes, images yes, streaming yes, thinking no, file upload no, grounding no

### 4. Modify `src/lib/ai/providers/index.ts`

Add `import './anthropic';`

### 5. Modify `src/lib/ai/index.ts`

Add `export { AnthropicProvider } from './adapters/anthropic-adapter';`

## Verification

1. Add `ANTHROPIC_API_KEY=<key>` to `.env.local`
2. Run `npm run build` — no type errors
3. Run `npm run dev` and verify Claude Haiku 4.5 appears in the model dropdown
4. Send a test message and confirm streaming works
5. Verify cost logging appears in server console
