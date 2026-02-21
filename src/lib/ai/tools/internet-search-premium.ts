import { ToolDefinition, Tool } from './types';
import { tavily } from '@tavily/core';

/**
 * Get the Tavily API key from environment
 */
function getTavilyApiKey(): string {
  const apiKey = process.env.TAVILY_API_KEY || '';
  if (!apiKey) {
    console.warn('No Tavily API key found. Set TAVILY_API_KEY in your .env file.');
  }
  return apiKey;
}

/**
 * Internet Search Tool - Search for multiple queries
 */
const internetSearchDefinition: ToolDefinition = {
  name: "internet_search_premium",
  description: "A premium internet search with advanced depth. Use this ONLY as a fallback when internet_search didn't return good enough results. For recent news, prefer news_search instead.",
  parameters: {
    type: "OBJECT",
    properties: {
      queries: {
        type: "ARRAY",
        items: {
          type: "STRING"
        },
        description: "An array of search queries to execute. Provide multiple queries to cover different aspects of the topic."
      }
    },
    required: ["queries"]
  }
};

async function executeInternetSearch(args: any): Promise<any> {
  const apiKey = getTavilyApiKey();
  if (!apiKey) {
    return { error: "Tavily API key is missing. Please set TAVILY_API_KEY in .env.local" };
  }

  const client = tavily({ apiKey });
  const queries = args.queries || [];

  if (queries.length === 0) {
    return { error: "No queries provided for search." };
  }

  try {
    const searchPromises = queries.map((query: string) =>
      client.search(query, {
        searchDepth: "advanced"
      }).catch((err: any) => ({
        query,
        error: err.message
      }))
    );

    const results = await Promise.all(searchPromises);

    return {
      results: results
    };
  } catch (error: any) {
    return { error: `Unexpected error during internet search: ${error.message}` };
  }
}

export const internetSearchPremiumTools: Tool[] = [
  { definition: internetSearchDefinition, execute: executeInternetSearch }
];
