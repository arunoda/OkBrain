// Image data for multimodal messages (legacy - base64)
export interface AIImageData {
  mimeType: string;
  base64: string;
}

// File data from FILE API
export interface AIFileData {
  fileUri: string;
  mimeType: string;
}

// Message format for AI providers
export interface AIMessage {
  role: "user" | "assistant";
  content: string;
  model?: string; // Specific model name that generated this (e.g. "Gemini 1.5 Flash")
  image?: AIImageData;  // Optional image attachment (legacy - base64, not persisted)
  files?: AIFileData[];  // Optional file attachments via FILE API
  thoughtSignature?: string; // Opaque signature for reusing thoughts in subsequent requests
}

// Response mode - quick for brief responses, detailed for balanced thorough responses
export type ResponseMode = 'quick' | 'detailed';

// Streaming response chunk
export interface AIStreamChunk {
  text: string;
  thought?: string; // Model's thinking/reasoning (streamed for live display)
  thoughtSignature?: string; // Opaque signature for reusing thoughts (sent at end)
  status?: string;
  done: boolean;
  sources?: Array<{
    uri?: string;
    title?: string;
  }>;
}

// Options for AI generation
export interface AIGenerateOptions {
  thinking?: boolean;
  mode?: ResponseMode;
  signal?: AbortSignal;
  location?: string;
  userId?: string; // User ID for tool execution context
}

// AI Provider interface - implement this to add new providers
export interface AIProvider {
  name: string;

  // Get the full model name
  getModelName(): string;

  // Generate a streaming response
  generateStream(
    messages: AIMessage[],
    onChunk: (chunk: AIStreamChunk) => void | Promise<void>,
    options?: AIGenerateOptions
  ): Promise<void>;

  // Generate a title for a conversation based on first message
  generateTitle(firstMessage: string): Promise<string>;
}

