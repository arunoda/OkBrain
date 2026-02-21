// Types
export * from './types';

// Formatters for different providers
export { toGeminiTools, toOpenAIToolDefinitions, buildZodSchema } from './formatters';

// Event tools helpers
export { getUpcomingEventsContext, setEventToolsUserId, clearEventToolsUserId } from './events';

// Aggregate all tools
import { googleMapsTools } from './google-maps';
import { internetSearchTools } from './internet-search';
import { internetSearchPremiumTools } from './internet-search-premium';
import { newsSearchTools } from './news-search';
import { imageSearchTools } from './image-search';
import { readUrlTools } from './read-url';
import { eventTools } from './events';
import { Tool } from './types';

const isTest = process.env.NODE_ENV === 'test';
const hasBraveKey = !!process.env.BRAVE_API_KEY;
const hasTavilyKey = !!process.env.TAVILY_API_KEY;

export const allTools: Tool[] = [
  ...googleMapsTools,
  ...(!isTest && hasBraveKey ? internetSearchTools : []),
  ...(!isTest && hasTavilyKey ? internetSearchPremiumTools : []),
  ...(!isTest && hasTavilyKey ? readUrlTools : []),
  ...(!isTest && hasBraveKey ? newsSearchTools : []),
  ...(!isTest && hasBraveKey ? imageSearchTools : []),
  ...eventTools,
  // Add more tool collections here as you create them
];

/**
 * Execute any registered tool by name.
 * This is the only function AI providers need to call.
 */
export async function executeTool(name: string, args: any): Promise<any> {
  const tool = allTools.find(t => t.definition.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  console.log(`[TOOL_CALL] ${name}`, JSON.stringify(args));
  try {
    return await tool.execute(args);
  } catch (error) {
    console.error(`[TOOL_ERROR] ${name}`, error);
    throw error;
  }
}

/**
 * Get a human-readable status message for a tool
 */
export function getToolStatusMessage(name: string): string {
  switch (name) {
    case 'search_places':
      return 'Searching Places...';
    case 'compute_routes':
      return 'Calculating Route...';
    case 'internet_search':
      return 'Searching the Web...';
    case 'internet_search_premium':
      return 'Searching the Web (Premium)...';
    case 'read_url':
      return 'Reading Content...';
    case 'news_search':
      return 'Searching News...';
    case 'image_search':
      return 'Searching Images...';
    case 'get_weather_by_location':
    case 'get_weather_by_coordinates':
      return 'Checking Weather...';
    case 'get_air_quality_by_location':
    case 'get_air_quality_by_coordinates':
      return 'Checking Air Quality...';
    case 'search_events':
      return 'Searching Events...';
    case 'get_events_by_date_range':
    case 'get_upcoming_events':
    case 'get_past_events':
    case 'get_all_events':
    case 'get_event':
      return 'Getting Events...';
    case 'create_event':
      return 'Creating Event...';
    case 'update_event':
      return 'Updating Event...';
    case 'delete_event':
      return 'Deleting Event...';
    default:
      return 'Using Tool...';
  }
}
