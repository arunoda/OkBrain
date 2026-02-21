/**
 * Registry Types for Pluggable AI Model System
 *
 * This module defines the types for the provider/model registry architecture.
 */

import { AIProvider, AIMessage, AIStreamChunk, AIGenerateOptions } from '../types';

// Model capabilities
export interface ModelCapabilities {
  thinking: boolean;
  thinkingLevels: ('low' | 'high')[];
  tools: boolean;
  toolsDuringThinking: boolean;
  fileUpload: boolean;
  fileApi: 'google' | 'openai' | 'xai' | null;
  images: boolean;
  grounding: boolean;
  streaming: boolean;
}

// UI configuration for models
export interface ModelUIConfig {
  icon: string;
  color: string;
  description: string;
  category: 'fast' | 'powerful' | 'reasoning';
}

// UI configuration for providers
export interface ProviderUIConfig {
  icon: string;
  color: string;
}

// Adapter creation options
export interface AdapterOptions {
  thinking?: boolean;
}

// Model configuration within a provider
export interface ModelConfig {
  id: string;
  name: string;
  apiModel: string;
  fallbackModels?: string[];
  capabilities: Partial<ModelCapabilities>;
  ui?: Partial<ModelUIConfig>;
}

// Standardized result for file uploads across all providers
export interface UploadedFileResult {
  uri: string;           // Provider-specific file reference
  name: string;          // Provider's internal name/ID
  mimeType: string;
  sizeBytes: number;
  expirationTime?: string;  // Optional - not all providers expire files
}

// Provider definition - what you write to define a provider
export interface ProviderDefinition {
  id: string;
  name: string;
  ui: ProviderUIConfig;
  baseCapabilities: Partial<ModelCapabilities>;
  models: ModelConfig[];
  createAdapter: (model: ModelConfig, options?: AdapterOptions) => AIProvider;
  uploadFile?: (filePath: string, mimeType: string, displayName?: string) => Promise<UploadedFileResult>;
}

// Resolved model - fully merged model with all capabilities and UI filled in
export interface ResolvedModel {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  apiModel: string;
  fallbackModels?: string[];
  capabilities: ModelCapabilities;
  ui: ModelUIConfig;
  createAdapter: (options?: AdapterOptions) => AIProvider;
}

// Default capabilities (used when not specified)
export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  thinking: false,
  thinkingLevels: [],
  tools: false,
  toolsDuringThinking: false,
  fileUpload: false,
  fileApi: null,
  images: false,
  grounding: false,
  streaming: true,
};

// Default UI config (used when not specified)
export const DEFAULT_UI_CONFIG: ModelUIConfig = {
  icon: 'default',
  color: '#888888',
  description: '',
  category: 'fast',
};
