import { Message } from './types';

export class NetlifyAPI {
  private baseUrl: string;

  constructor() {
    // In development, use localhost:8888 for Netlify Functions
    // In production, this will be the same domain
    this.baseUrl = true 
      ? 'http://localhost:8888' 
      : '';
  }

  async sendMessage(messages: Message[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/.netlify/functions/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send message');
    }

    const data = await response.json();
    return data.response;
  }
}
