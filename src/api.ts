import { Message, ModelConfig, ToolCall } from './types';

export interface ChatResponse {
  response: string;
  reasoning: string[];
  toolCalls: ToolCall[];
}

export class NetlifyAPI {
  private baseUrl: string;

  constructor() {
    // In production, use empty string (same domain)
    // In development, use localhost:8888 for Netlify Functions
    this.baseUrl = ''; 
  }

  async sendMessage(messages: Message[], config: ModelConfig): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/.netlify/functions/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        messages,
        modelConfig: config
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send message');
    }

    const data = await response.json();
    return {
      response: data.response,
      reasoning: data.reasoning || [],
      toolCalls: data.toolCalls || []
    };
  }
}
