/**
 * Google Provider Definition
 *
 * Defines Gemini models available through the Google AI API.
 */

import { defineProvider } from '../registry';
import { GeminiProvider } from '../adapters/gemini-adapter';
import { uploadFile as uploadToGemini } from '../file-api';

const getApiKey = (): string => {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set. Please add it to your .env.local file."
    );
  }
  return apiKey;
};

export default defineProvider({
  id: 'google',
  name: 'Google',

  ui: {
    icon: 'google',
    color: '#4285F4',
  },

  baseCapabilities: {
    fileUpload: true,
    fileApi: 'google',
    images: true,
    grounding: true,
    streaming: true,
    thinking: true,
    thinkingLevels: ['low', 'high'],
    tools: true,
    toolsDuringThinking: false,
  },

  models: [
    {
      // Keep 'gemini' as the ID for backward compatibility
      id: 'gemini',
      name: 'Gemini 3 Flash',
      apiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
      fallbackModels: ['gemini-3-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash-latest', 'gemini-1.5-flash'],

      capabilities: {
        // All capabilities inherited from baseCapabilities
      },

      ui: {
        description: 'Fast and efficient for everyday tasks',
        category: 'fast',
      },
    },
    {
      // Keep 'gemini-pro' as the ID for backward compatibility
      id: 'gemini-pro',
      name: 'Gemini 3.1 Pro',
      apiModel: 'gemini-3.1-pro-preview',

      capabilities: {
        // All capabilities inherited from baseCapabilities
      },

      ui: {
        description: 'Most capable Gemini model',
        category: 'powerful',
      },
    },
  ],

  createAdapter: (modelDef, options) => {
    const apiKey = getApiKey();
    return new GeminiProvider(apiKey, modelDef.apiModel, modelDef.name);
  },

  uploadFile: async (filePath, mimeType, displayName) => {
    const result = await uploadToGemini(filePath, mimeType, displayName);
    return {
      uri: result.uri,
      name: result.name,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      expirationTime: result.expirationTime,
    };
  },
});
