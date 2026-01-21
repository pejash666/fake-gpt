import { Message, ModelConfig, ToolCall, ClarifyAnswer, PendingContext, AgentStep } from './types';

export interface ChatResponse {
  status: 'complete' | 'pending_clarification';
  response: string;
  reasoning: string[];
  toolCalls: ToolCall[];
  steps?: AgentStep[];
  pendingContext?: PendingContext;
}

export class NetlifyAPI {
  private baseUrl: string;
  private isLocal: boolean;

  constructor() {
    // Detect local development (Vite may run on 3000, 3001, or 5173)
    const port = window.location.port;
    this.isLocal = ['3000', '3001', '5173'].includes(port);
    this.baseUrl = this.isLocal ? 'http://localhost:3002' : '';
    console.log(`API: isLocal=${this.isLocal}, port=${port}, baseUrl=${this.baseUrl}`);
  }

  async sendMessage(messages: Message[], config: ModelConfig): Promise<ChatResponse> {
    const endpoint = this.isLocal ? '/api/chat' : '/.netlify/functions/chat';
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
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
      let errorMessage = `Request failed: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Response wasn't JSON
      }
      throw new Error(errorMessage);
    }

    const text = await response.text();
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
    }
    return {
      status: data.status || 'complete',
      response: data.response,
      reasoning: data.reasoning || [],
      toolCalls: data.toolCalls || [],
      pendingContext: data.pendingContext
    };
  }

  async continueWithAnswers(pendingContext: PendingContext, answers: ClarifyAnswer[]): Promise<ChatResponse> {
    const endpoint = this.isLocal ? '/api/chat/continue' : '/.netlify/functions/chat-continue';
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pendingContext, answers }),
    });

    if (!response.ok) {
      let errorMessage = `Request failed: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Response wasn't JSON
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      status: data.status || 'complete',
      response: data.response,
      reasoning: data.reasoning || [],
      toolCalls: data.toolCalls || [],
      steps: data.steps,
      pendingContext: data.pendingContext
    };
  }
}
