export interface ToolCall {
  name: string;
  query: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string[];
  toolCalls?: ToolCall[];
  timestamp: Date;
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
