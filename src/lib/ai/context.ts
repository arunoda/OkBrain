/**
 * AI Context Injection
 *
 * Common utility for injecting context (memory, events, documents, timezone)
 * as message pairs into AI conversations.
 */

import { AIMessage } from './types';
import {
  buildEventsContextPrompt,
  buildContextAcknowledgement,
  buildTimezoneInstructions,
  buildUserMemoryPrompt,
  buildFactsContextPrompt,
  buildRagFactsContextPrompt,
  buildRecentConversationsPrompt,
  buildDocumentContextPrompt,
} from './system-prompts';

export interface AIContext {
  modelName: string;
  userMemory?: { memory_text: string } | null;
  facts?: Array<{ category: string; fact: string }> | null;
  ragFacts?: Array<{ fact: string; category: string; distance: number; last_extracted_at: string | null }> | null;
  recentConversations?: Array<{ title: string; userMessages: string[] }> | null;
  eventsContext?: string | null;
  documents?: Array<{ title: string; content: string }>;
  includeTimezone?: boolean;
}

/**
 * Injects context (memory, events, documents, timezone) as message pairs
 * at the beginning of the conversation. Each context is added as a
 * user message followed by an assistant acknowledgment.
 *
 * Order (from earliest to latest in conversation):
 * 1. Events context (if available)
 * 2. Timezone instructions (if enabled)
 * 3. User memory (if available)
 * 4. Documents (if available)
 * 5. Original messages
 */
export function injectContextMessages(
  messages: AIMessage[],
  context: AIContext
): AIMessage[] {
  const result = [...messages];
  const { modelName, userMemory, eventsContext, documents, includeTimezone } = context;

  // Inject document context if available (will be first after all injections)
  if (documents && documents.length > 0) {
    result.unshift({
      role: 'user',
      content: buildDocumentContextPrompt(documents),
    });
    result.splice(1, 0, {
      role: 'assistant',
      content: buildContextAcknowledgement('documents'),
      model: modelName,
    });
  }

  // Inject User Memory if available
  if (userMemory?.memory_text) {
    result.unshift({
      role: 'user',
      content: buildUserMemoryPrompt(userMemory.memory_text),
    });
    result.splice(1, 0, {
      role: 'assistant',
      content: buildContextAcknowledgement('memory'),
      model: modelName,
    });
  }

  // Inject Recent Conversations if available (before facts for lower priority)
  if (context.recentConversations && context.recentConversations.length > 0) {
    result.unshift({
      role: 'user',
      content: buildRecentConversationsPrompt(context.recentConversations),
    });
    result.splice(1, 0, {
      role: 'assistant',
      content: buildContextAcknowledgement('recentConversations'),
      model: modelName,
    });
  }

  // Inject User Facts if available (fact sheet — higher priority than RAG facts)
  if (context.facts && context.facts.length > 0) {
    result.unshift({
      role: 'user',
      content: buildFactsContextPrompt(context.facts),
    });
    result.splice(1, 0, {
      role: 'assistant',
      content: buildContextAcknowledgement('facts'),
      model: modelName,
    });
  }

  // Inject timezone handling instructions
  if (includeTimezone) {
    result.unshift({
      role: 'user',
      content: buildTimezoneInstructions(),
    });
    result.splice(1, 0, {
      role: 'assistant',
      content: buildContextAcknowledgement('timezone'),
      model: modelName,
    });
  }

  // Inject Upcoming Events if available
  if (eventsContext && !eventsContext.includes('No upcoming events')) {
    result.unshift({
      role: 'user',
      content: buildEventsContextPrompt(eventsContext),
    });
    result.splice(1, 0, {
      role: 'assistant',
      content: buildContextAcknowledgement('events'),
      model: modelName,
    });
  }

  // Inject RAG Facts right before conversation messages (cache-friendly position).
  // All stable context above stays in the cached prefix.
  if (context.ragFacts && context.ragFacts.length > 0) {
    const insertPos = result.length - messages.length;
    result.splice(insertPos, 0,
      {
        role: 'user' as const,
        content: buildRagFactsContextPrompt(context.ragFacts),
      },
      {
        role: 'assistant' as const,
        content: buildContextAcknowledgement('ragFacts'),
        model: modelName,
      }
    );
  }

  return result;
}
