export interface ToolCall {
  name: string;
  query?: string;
  questions?: ClarifyQuestion[];
}

export interface AgentStep {
  type: 'reasoning' | 'tool_call' | 'tool_result';
  content: string;
  timestamp?: number;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  type: 'single_choice' | 'multiple_choice' | 'text';
  options?: string[];
  required?: boolean;
}

export interface ClarifyAnswer {
  questionId: string;
  answer: string | string[];
}

export interface PendingContext {
  input: unknown[];
  rawOutputItems: unknown[];
  clarifyCallId: string;
  model: string;
  reasoningEffort: string;
}

export interface MessageImage {
  id: string;
  base64: string;
  mimeType: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: MessageImage[];
  reasoning?: string[];
  toolCalls?: ToolCall[];
  steps?: AgentStep[];
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  titleLoading?: boolean;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelConfig {
  model: string;
  reasoning: {
    effort: 'low' | 'medium' | 'high';
  };
}

export const AVAILABLE_MODELS = [
  { id: 'gpt-5.1', name: 'GPT-5.1', description: 'Advanced reasoning model' },
  { id: 'gpt-5.2', name: 'GPT-5.2', description: 'Latest reasoning model' }
] as const;

export const REASONING_LEVELS = [
  { value: 'low', label: 'Low', description: 'Fast responses' },
  { value: 'medium', label: 'Medium', description: 'Balanced thinking' },
  { value: 'high', label: 'High', description: 'Deep reasoning' }
] as const;

export type StreamEventType = 
  | 'start' | 'reasoning' | 'reasoning_delta' | 'tool_call' | 'tool_call_start'
  | 'tool_result' | 'content' | 'content_delta' | 'done' | 'error' | 'clarify';

export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  text?: string;
  delta?: string;
  name?: string;
  query?: string;
  resultCount?: number;
  message?: string;
  reasoning?: string[];
  toolCalls?: ToolCall[];
  questions?: ClarifyQuestion[];
  pendingContext?: PendingContext;
}
