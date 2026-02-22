// Database wrapper interface
export interface DbWrapper {
  prepare: (sql: string) => {
    all: (...params: any[]) => Promise<any[]>
    get: (...params: any[]) => Promise<any>
    run: (...params: any[]) => Promise<{ changes: number; lastInsertRowid: number }>
  }
  exec: (sql: string) => Promise<void>
  transaction: <T>(fn: () => Promise<T>) => () => Promise<T>
}

// Response mode types
export type ResponseMode = 'quick' | 'detailed';

// Folder types
export interface Folder {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

// Conversation types
export interface Conversation {
  id: string;
  title: string;
  folder_id?: string | null;
  grounding_enabled?: number;
  response_mode?: string;
  ai_provider?: string; // 'gemini' | 'xai'
  document_ids?: string[];
  active_job_id?: string | null;
  last_fact_extracted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "summary";
  content: string;
  model?: string; // AI model name
  sources?: string; // JSON string of sources array
  was_grounded?: number; // Whether grounding was enabled for this message
  thoughts?: string; // Model's thinking text (for display only, not included in history)
  thought_signature?: string; // Opaque signature for reusing thoughts in subsequent requests
  thinking_duration?: number; // Duration in seconds the model spent thinking
  feedback?: number | null; // User feedback rating: 1 for good, -1 for bad
  created_at: string;
}

export interface FileAttachment {
  id: string;
  message_id: string;
  file_uri: string; // Gemini FILE API URI
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string; // Server timestamp of upload
  created_at: string;
}

// Document types
export interface Document {
  id: string;
  title: string;
  content: string;
  folder_id?: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// User types
export interface User {
  id: string;
  email: string;
  password?: string; // Hashed - omitted in some contexts
  created_at: string;
  updated_at: string;
}

// User Memory types
export interface UserMemory {
  user_id: string;
  memory_text: string;
  updated_at: string;
}

// Event types
export interface Event {
  id: string;
  user_id: string;
  title: string;
  description: string;
  location: string;
  start_datetime: string; // ISO 8601 datetime string
  end_datetime: string | null; // ISO 8601 datetime string, optional
  recurrence_type: string | null; // 'weekly' or 'monthly', null for non-recurring
  recurrence_end_date: string | null; // ISO 8601 date string, when recurrence stops
  created_at: string;
  updated_at: string;
}

// Document Snapshot types
export interface DocumentSnapshot {
  id: string;
  document_id: string;
  user_id: string;
  message: string;
  title: string;
  content: string;
  created_at: string;
}

// Shared Link types
export interface SharedLink {
  id: string;
  type: 'conversation' | 'document' | 'snapshot';
  resource_id: string;
  user_id: string;
  created_at: string;
}

// Sidebar item types
export interface SidebarItem {
  id: string;
  title: string;
  folder_id?: string | null;
  updated_at: string;
  type: 'chat' | 'document';
}

// Fact types
export interface Fact {
  id: string;
  user_id: string;
  category: string;
  fact: string;
  created_at: string;
  extraction_count: number;
}

// Fact Sheet types
export interface FactSheet {
  id: string;
  user_id: string;
  facts_json: string;
  dedup_log: string | null;
  fact_count: number;
  created_at: string;
}

export interface FactSheetEntry {
  id: string;
  category: string;
  fact: string;
  score: number;
}

// Job system types
export type JobState = 'idle' | 'running' | 'stopping' | 'stopped' | 'succeeded' | 'failed';
export type JobQueueState = 'queued' | 'claimed' | 'done' | 'failed';
export type JobEventKind = 'input' | 'output' | 'thought' | 'status' | string;

export interface Job {
  id: string;
  type: string;
  user_id: string | null;
  state: JobState;
  last_seq: number;
  last_input_seq: number;
  created_at: string;
  updated_at: string;
}

export interface JobEvent {
  id: string;
  job_id: string;
  seq: number;
  kind: JobEventKind;
  payload: string; // JSON string
  created_at: string;
}

export interface JobQueueItem {
  id: string;
  job_id: string;
  input: string; // JSON string
  priority: number;
  state: JobQueueState;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}
