import { ToolDefinition, Tool } from './types';
import { tavily } from '@tavily/core';

function getTavilyApiKey(): string {
  const apiKey = process.env.TAVILY_API_KEY || '';
  if (!apiKey) {
    console.warn('No Tavily API key found. Set TAVILY_API_KEY in your .env.local file.');
  }
  return apiKey;
}

// We tried using local fetching
// It works, but the it adds a lot of data to the context and it cost more
// So, having this is simpler & cheaper
const readUrlDefinition: ToolDefinition = {
  name: "read_url",
  description: "Read and extract the main content from web pages. Use this when you need the full content of specific URLs found via internet_search or news_search.",
  parameters: {
    type: "OBJECT",
    properties: {
      urls: {
        type: "ARRAY",
        items: {
          type: "STRING"
        },
        description: "An array of URLs to extract content from."
      }
    },
    required: ["urls"]
  }
};

async function readSingleUrl(
  client: ReturnType<typeof tavily>,
  url: string
): Promise<{ url: string; content?: string; error?: string }> {
  try {
    const response = await client.extract([url]);
    const result = response.results?.[0];
    if (!result) {
      return { url, error: 'No content extracted' };
    }
    const content = result.rawContent || '';
    return { url, content };
  } catch (err: any) {
    return { url, error: `Failed to read URL: ${err.message}` };
  }
}

async function executeReadUrl(args: any): Promise<any> {
  const urls = args.urls || [];

  if (urls.length === 0) {
    return { error: "No URLs provided for extraction." };
  }

  const apiKey = getTavilyApiKey();
  if (!apiKey) {
    return { error: "Tavily API key is missing. Please set TAVILY_API_KEY in .env.local" };
  }

  const client = tavily({ apiKey });

  try {
    const results = await Promise.all(
      urls.map((url: string) => readSingleUrl(client, url))
    );
    return { results };
  } catch (error: any) {
    return { error: `Unexpected error during URL reading: ${error.message}` };
  }
}

export const readUrlTools: Tool[] = [
  { definition: readUrlDefinition, execute: executeReadUrl }
];
