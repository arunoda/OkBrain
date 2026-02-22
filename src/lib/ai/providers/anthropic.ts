/**
 * Anthropic Provider Definition
 *
 * Defines Claude models available through the Anthropic API.
 * Only registers if ANTHROPIC_API_KEY is set.
 */

import { defineProvider } from '../registry';
import { AnthropicProvider } from '../adapters/anthropic-adapter';

if (process.env.ANTHROPIC_API_KEY) {
  defineProvider({
    id: 'anthropic',
    name: 'Anthropic',

    ui: {
      icon: 'anthropic',
      color: '#D4A574',
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
        id: 'claude-sonnet',
        name: 'Sonnet 4.6',
        apiModel: 'claude-sonnet-4-6',
        uiPriority: 40,

        capabilities: {
          thinking: true,
        },

        ui: {
          description: 'Balanced performance and capability',
          category: 'powerful',
        },
      },
      {
        id: 'claude-haiku',
        name: 'Haiku 4.5',
        apiModel: 'claude-haiku-4-5-20251001',
        uiPriority: 90,

        capabilities: {
          thinking: true,
        },

        ui: {
          description: 'Fast and affordable Claude model',
          category: 'fast',
        },
      },
    ],

    createAdapter: (modelDef) => {
      const apiKey = process.env.ANTHROPIC_API_KEY!;
      return new AnthropicProvider(apiKey, modelDef.apiModel, modelDef.name);
    },
  });
}
