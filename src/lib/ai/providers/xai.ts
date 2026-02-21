/**
 * xAI Provider Definition
 *
 * Defines Grok models available through the xAI API.
 * Only registers if XAI_API_KEY is set.
 */

import { defineProvider } from '../registry';
import { XAIProvider } from '../adapters/xai-adapter';

if (process.env.XAI_API_KEY) {
  defineProvider({
    id: 'xai',
    name: 'xAI',

    ui: {
      icon: 'xai',
      color: '#000000',
    },

    baseCapabilities: {
      fileUpload: false,
      fileApi: null,
      images: true,
      grounding: false,
      streaming: true,
      tools: true,
      toolsDuringThinking: true,
    },

    models: [
      {
        // Keep 'xai' as the ID for backward compatibility
        id: 'xai',
        name: 'Grok 4.1 Fast',
        // The actual model name is determined by the thinking option
        // When thinking: true  -> grok-4-1-fast-reasoning
        // When thinking: false -> grok-4-1-fast-non-reasoning
        apiModel: 'grok-4-1-fast',

        capabilities: {
          thinking: true,  // Supports thinking mode (switches between reasoning/non-reasoning models)
          thinkingLevels: [], // No configurable levels - it's binary (on/off)
        },

        ui: {
          description: 'Fast responses with optional extended thinking',
          category: 'fast',
        },
      },
    ],

    createAdapter: (modelDef, options) => {
      const apiKey = process.env.XAI_API_KEY!;
      // Use reasoning model when thinking is enabled (default), non-reasoning otherwise
      const modelName = options?.thinking !== false
        ? "grok-4-1-fast-reasoning"
        : "grok-4-1-fast-non-reasoning";
      return new XAIProvider(apiKey, modelName, modelDef.name);
    },
  });
}
