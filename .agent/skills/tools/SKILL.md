---
name: Tools
description: AI tool/function calling system — architecture, existing tools, and how to add new ones.
---

# Tools

The AI tool system uses a provider-agnostic definition format. Tools are defined once and automatically converted to Gemini, OpenAI, and Zod formats via formatters.

## Architecture

```
src/lib/ai/tools/
├── types.ts          # ToolDefinition, Tool, ToolExecutor interfaces
├── index.ts          # Aggregates all tools, executeTool(), getToolStatusMessage()
├── formatters.ts     # toGeminiTools(), toOpenAIToolDefinitions(), buildZodSchema()
├── context.ts        # AsyncLocalStorage for userId (used by event tools)
├── google-maps.ts    # Places, routes, weather, air quality tools
├── internet-search.ts # Web search (Brave Web Search API) - default
├── internet-search-premium.ts # Premium web search (Tavily) - fallback
├── read-url.ts       # Read/extract content from URLs (Tavily)
├── news-search.ts    # News search (Brave API)
└── events.ts         # Calendar event CRUD tools (uses context.ts for userId)
```

## Core Types

```typescript
// types.ts
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;           // Use "OBJECT" (uppercase for Gemini compatibility)
    properties: Record<string, any>;
    required?: string[];
  };
}

type ToolExecutor = (args: any) => Promise<any>;

interface Tool {
  definition: ToolDefinition;
  execute: ToolExecutor;
}
```

## Existing Tools

| File | Tools | API/Service |
|------|-------|-------------|
| `google-maps.ts` | `search_places`, `compute_routes`, `get_weather_by_location`, `get_weather_by_coordinates`, `get_air_quality_by_location`, `get_air_quality_by_coordinates` | Google Maps APIs |
| `internet-search.ts` | `internet_search` | Brave Web Search API |
| `internet-search-premium.ts` | `internet_search_premium` | Tavily API |
| `read-url.ts` | `read_url` | Tavily API |
| `news-search.ts` | `news_search` | Brave Search API |
| `events.ts` | `search_events`, `get_events_by_date_range`, `get_upcoming_events`, `get_past_events`, `get_event`, `create_event`, `update_event`, `delete_event` | Local SQLite DB |

## Adding a New Tool

### Step 1: Create the Tool File

Create `src/lib/ai/tools/my-tool.ts`:

```typescript
import { ToolDefinition, Tool } from './types';

// 1. API key helper (if needed)
function getApiKey(): string {
  const apiKey = process.env.MY_API_KEY || '';
  if (!apiKey) {
    console.warn('No API key found. Set MY_API_KEY in your .env.local file.');
  }
  return apiKey;
}

// 2. Tool definition (provider-agnostic)
const myToolDefinition: ToolDefinition = {
  name: "my_tool",
  description: "Clear description of when to use this tool. Mention when to prefer other tools instead.",
  parameters: {
    type: "OBJECT",           // Always uppercase
    properties: {
      query: {
        type: "STRING",       // Types: STRING, NUMBER, INTEGER, BOOLEAN, ARRAY, OBJECT
        description: "What this parameter does."
      },
      category: {
        type: "STRING",
        description: "Filter by category.",
        enum: ["option1", "option2", "option3"]  // Optional enum constraint
      }
    },
    required: ["query"]       // Only required params
  }
};

// 3. Executor function
async function executeMyTool(args: any): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: "API key is missing. Please set MY_API_KEY in .env.local" };
  }

  try {
    const response = await fetch('https://api.example.com/search', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `API error (${response.status}): ${errorText}` };
    }

    const data = await response.json();
    return { results: data };
  } catch (error: any) {
    return { error: `Unexpected error: ${error.message}` };
  }
}

// 4. Export tool collection
export const myTools: Tool[] = [
  { definition: myToolDefinition, execute: executeMyTool }
];
```

### Step 2: Register in index.ts

```typescript
// Add import
import { myTools } from './my-tool';

// Add to allTools array
export const allTools: Tool[] = [
  ...googleMapsTools,
  ...(process.env.NODE_ENV === 'test' ? [] : internetSearchTools),
  ...(process.env.NODE_ENV === 'test' ? [] : newsSearchTools),
  ...eventTools,
  ...myTools,  // ADD HERE
];
```

Wrap with `process.env.NODE_ENV === 'test' ? [] : ...` if the tool calls external APIs and should be excluded during E2E tests.

### Step 3: Add Status Message

In `getToolStatusMessage()` in `index.ts`:

```typescript
case 'my_tool':
  return 'Doing Something...';
```

## Important Notes

### Parameter Types
Use **uppercase** types in definitions (`STRING`, `OBJECT`, `ARRAY`, etc.). The formatters handle conversion to lowercase for OpenAI format.

### Enum Values
Gemini API rejects empty strings in enum arrays. Never include `""` as an enum value.

### Tool Descriptions
The description is critical for AI tool selection. Tips:
- State clearly when the tool should be used
- Mention when to prefer other tools (e.g., "For general queries, prefer internet_search instead")
- Keep descriptions concise but specific about the use case

### Tool Context (for user-scoped tools)
If your tool needs the current user ID (like event tools), use AsyncLocalStorage:

```typescript
import { requireUserId } from './context';

async function executeMyTool(args: any): Promise<any> {
  const userId = requireUserId();  // Throws if no user context
  // ... use userId
}
```

The AI providers wrap tool execution in `runWithToolContext({ userId })`.

### Error Handling
Always return errors as `{ error: "message" }` rather than throwing. This lets the AI handle the error gracefully and inform the user.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai/tools/types.ts` | Core type definitions |
| `src/lib/ai/tools/index.ts` | Tool aggregation, execution, and status messages |
| `src/lib/ai/tools/formatters.ts` | Converts definitions to Gemini/OpenAI/Zod formats |
| `src/lib/ai/tools/context.ts` | AsyncLocalStorage for user context |
