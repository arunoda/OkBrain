---
name: AI Providers
description: Pluggable AI model system for adding new providers and models.
---

# AI Providers

The AI system uses a pluggable provider/model architecture. Each provider (Google, xAI, etc.) can expose multiple models, and the UI/API automatically adapts based on model capabilities.

## Architecture Overview

```
src/lib/ai/
├── registry/
│   ├── index.ts          # Registry singleton + defineProvider()
│   └── types.ts          # Type definitions
├── providers/
│   ├── index.ts          # Auto-imports all providers
│   ├── google.ts         # Google provider + Gemini models
│   └── xai.ts            # xAI provider + Grok models
├── adapters/
│   ├── gemini-adapter.ts # GeminiProvider class (API implementation)
│   └── xai-adapter.ts    # XAIProvider class (API implementation)
├── client-types.ts       # Client-safe types (ModelInfo, ModelsConfig)
└── index.ts              # Public API
```

## Core Concepts

- **Provider**: A company/service (Google, xAI) that offers AI models
- **Model**: A specific model from a provider (gemini, gemini-pro, xai)
- **Adapter**: The class that implements API calls for a provider
- **Capabilities**: Features a model supports (thinking, tools, fileUpload, etc.)

## Model Info Flow (Server → Client)

The registry code stays server-side only. Model info reaches clients via SSR:

```
┌─────────────────────────────────────────────────────────────┐
│  Server (layout.tsx)                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ const modelsConfig = getModelsConfig();                 ││
│  │ <ChatProvider modelsConfig={modelsConfig} />            ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Client (ChatContext)                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ const { modelsConfig, getCurrentModel } = useChatContext││
│  │ // Models available for dropdown, capability checks     ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

This ensures:
- Registry code is not bundled to client
- Single source of truth via SSR props
- Type-safe on both server and client

## Model Capabilities

| Capability | Type | Description |
|------------|------|-------------|
| `thinking` | boolean | Supports thinking/reasoning mode |
| `tools` | boolean | Supports tool/function calling |
| `toolsDuringThinking` | boolean | Can use tools while in thinking mode |
| `fileUpload` | boolean | Supports file attachments |
| `fileApi` | string | File API type: `'google'`, `'openai'`, `'xai'`, or `null` |
| `images` | boolean | Supports image inputs |
| `grounding` | boolean | Supports grounding/search |
| `streaming` | boolean | Supports streaming responses |

## Adding a New Model to an Existing Provider

To add a new model to an existing provider, edit the provider file and add to the `models` array:

```typescript
// src/lib/ai/providers/google.ts

export default defineProvider({
  // ... existing config ...

  models: [
    // ... existing models ...

    // ADD NEW MODEL:
    {
      id: 'gemini-ultra',           // Unique model ID (used in API/DB)
      name: 'Gemini Ultra',         // Display name in UI
      apiModel: 'gemini-ultra-preview',  // Actual API model name

      capabilities: {
        // Override base capabilities if needed
        thinking: true,
      },

      ui: {
        description: 'Most powerful Gemini model',
        category: 'powerful',
      },
    },
  ],
});
```

The UI automatically picks up new models from the registry - no additional type updates needed.

## Adding a New Provider

### Step 1: Create the Adapter

Create a new adapter class that implements the `AIProvider` interface:

```typescript
// src/lib/ai/adapters/anthropic-adapter.ts

import { AIProvider, AIMessage, AIStreamChunk, AIGenerateOptions } from "../types";
import { StreamSanitizer, generateChatTitle } from "../utils";

export class AnthropicProvider implements AIProvider {
  name: string;
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName: string, displayName?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.name = displayName || "Claude";
  }

  getModelName(): string {
    return this.name;
  }

  async generateStream(
    messages: AIMessage[],
    onChunk: (chunk: AIStreamChunk) => void,
    options?: AIGenerateOptions
  ): Promise<void> {
    // Implement streaming logic here
    // Call onChunk({ text, done: false }) for each chunk
    // Call onChunk({ text: "", done: true }) when complete
  }

  async generateTitle(firstMessage: string): Promise<string> {
    return generateChatTitle(firstMessage);
  }
}
```

### Step 2: Create the Provider Definition

```typescript
// src/lib/ai/providers/anthropic.ts

import { defineProvider } from '../registry';
import { AnthropicProvider } from '../adapters/anthropic-adapter';

const getApiKey = (): string => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  return apiKey;
};

export default defineProvider({
  id: 'anthropic',
  name: 'Anthropic',

  ui: {
    icon: 'anthropic',
    color: '#D97757',
  },

  baseCapabilities: {
    fileUpload: true,
    fileApi: null,  // Uses inline base64
    images: true,
    grounding: false,
    streaming: true,
    thinking: true,
    thinkingLevels: ['low', 'high'],
    tools: true,
    toolsDuringThinking: true,
  },

  models: [
    {
      id: 'claude-sonnet',
      name: 'Claude Sonnet',
      apiModel: 'claude-sonnet-4-20250514',

      capabilities: {},  // Inherits from baseCapabilities

      ui: {
        description: 'Balanced performance and capability',
        category: 'powerful',
      },
    },
    {
      id: 'claude-opus',
      name: 'Claude Opus',
      apiModel: 'claude-opus-4-20250514',

      capabilities: {},

      ui: {
        description: 'Most capable Claude model',
        category: 'powerful',
      },
    },
  ],

  createAdapter: (modelDef, options) => {
    const apiKey = getApiKey();
    return new AnthropicProvider(apiKey, modelDef.apiModel, modelDef.name);
  },
});
```

### Step 3: Register the Provider

Add the import to `src/lib/ai/providers/index.ts`:

```typescript
import './google';
import './xai';
import './anthropic';  // ADD THIS
```

### Step 4: Verify UI (Optional)

The UI automatically picks up new models from the registry via `getModelsConfig()`. No manual type updates needed.

Check these files only if your provider has special requirements:
- `src/app/components/ChatLayout.tsx` - File upload visibility uses `model.capabilities.fileUpload`
- `src/app/components/ChatView.tsx` - Model name display uses context helper

## Public API

### Server-Side (API routes, SSR pages)

```typescript
import {
  getAIProvider,      // Get an AI adapter instance
  getModel,           // Get model metadata
  getModelCapabilities,
  getAllModels,
  getModelsGroupedByProvider,
  isValidModelId,
  getModelsConfig,    // Get client-safe model config for SSR
  getModelName,       // Get model display name
  getDefaultModelId,  // Get default model ID
  registry
} from '@/lib/ai';

// Get an adapter
const ai = getAIProvider('gemini', { thinking: true });
await ai.generateStream(messages, onChunk, options);

// Get model info
const model = getModel('gemini');
console.log(model.name);           // "Gemini 3 Flash"
console.log(model.capabilities);   // { thinking: true, ... }

// Check capabilities
const caps = getModelCapabilities('xai');
if (caps.fileUpload) {
  // Show file upload button
}

// List all models
const models = getAllModels();
// [{ id: 'gemini', name: 'Gemini 3 Flash', ... }, ...]

// Get config for passing to client (SSR)
const modelsConfig = getModelsConfig();
// { models: [...], defaultModelId: 'gemini' }
```

### Client-Side (React components)

Client components receive model info via `ChatContext`, not direct imports:

```typescript
// In a client component
import { useChatContext } from '@/app/context/ChatContext';

function MyComponent() {
  const { modelsConfig, getCurrentModel, aiProvider, setAiProvider } = useChatContext();

  // Get current model info
  const currentModel = getCurrentModel();
  if (currentModel?.capabilities.fileUpload) {
    // Show file upload button
  }

  // Render model dropdown
  return (
    <select value={aiProvider} onChange={e => setAiProvider(e.target.value)}>
      {modelsConfig.models.map(m => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}
```

### Client Types (for imports in client components)

```typescript
// Only import types from client-types.ts in client components
import type { ModelInfo, ModelsConfig } from '@/lib/ai/client-types';

interface ModelInfo {
  id: string;
  name: string;
  capabilities: {
    fileUpload: boolean;
    thinking: boolean;
    tools: boolean;
  };
}

interface ModelsConfig {
  models: ModelInfo[];
  defaultModelId: string;
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai/index.ts` | Public API entry point |
| `src/lib/ai/client-types.ts` | Client-safe types (ModelInfo, ModelsConfig) |
| `src/lib/ai/registry/types.ts` | Type definitions |
| `src/lib/ai/registry/index.ts` | Registry class |
| `src/lib/ai/providers/*.ts` | Provider definitions |
| `src/lib/ai/adapters/*.ts` | Adapter implementations |
| `src/lib/ai/types.ts` | Shared types (AIMessage, AIStreamChunk, etc.) |
| `src/app/(main)/layout.tsx` | Passes modelsConfig to ChatProvider |
| `src/app/context/ChatContext.tsx` | Provides model info to client components |

## Testing

After adding a new model/provider:

1. Run the build to check for type errors:
   ```bash
   npm run build
   ```

2. Run relevant E2E tests:
   ```bash
   npm run test:e2e -- e2e/gemini.spec.ts
   npm run test:e2e -- e2e/xai.spec.ts
   npm run test:e2e -- e2e/chat.spec.ts
   ```

3. Test manually by selecting the new model in the UI dropdown.

4. Verify the model appears in:
   - Model dropdown in chat input area
   - Verify button dropdown in chat actions
