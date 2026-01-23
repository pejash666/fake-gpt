import type { Context, Config } from "@netlify/edge-functions";

const WEB_SEARCH_TOOL = {
  type: "function",
  name: "web_search",
  description: "Search the web for current information. Use this when you need up-to-date information or facts you don't know.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to look up on the web"
      }
    },
    required: ["query"]
  }
};

const WEB_FETCH_TOOL = {
  type: "function",
  name: "web_fetch",
  description: "Fetch and extract content from a specific URL. Use this when you need to read the content of a webpage, article, or document from a given URL.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the webpage to fetch and extract content from"
      }
    },
    required: ["url"]
  }
};

const CLARIFY_TOOL = {
  type: "function",
  name: "clarify",
  description: `IMPORTANT: You should actively use this tool to ask clarifying questions before providing answers. Use this tool when:
1. The user's request is vague, ambiguous, or could be interpreted in multiple ways
2. You need specific details like: preferences, constraints, context, use case, target audience, technical requirements, budget, timeline, etc.
3. The user asks for recommendations without specifying their needs or situation
4. The request involves personal choices where user preferences matter (e.g., travel, shopping, career advice)
5. You're unsure about the scope or depth of response the user expects
6. The user's question could have different answers depending on their specific circumstances

DO NOT assume or guess when you can ask. It's better to ask 2-3 targeted questions than to provide a generic or potentially irrelevant answer. Users appreciate when you take time to understand their needs before responding.`,
  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "List of questions to ask the user. Keep questions concise and focused. Use single_choice for simple preferences, multiple_choice when multiple options can apply, and text for open-ended details.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique identifier for this question" },
            question: { type: "string", description: "The question text to display" },
            type: { type: "string", enum: ["single_choice", "multiple_choice", "text"], description: "Type of input" },
            options: { type: "array", items: { type: "string" }, description: "Options for choice questions" },
            required: { type: "boolean", description: "Whether this question must be answered" }
          },
          required: ["id", "question", "type"]
        }
      }
    },
    required: ["questions"]
  }
};

const ALL_TOOLS = [WEB_SEARCH_TOOL, WEB_FETCH_TOOL, CLARIFY_TOOL];

const MODEL_DEPLOYMENT_MAP: Record<string, string> = {
  'gpt-5.1': 'gpt-5.1',
  'gpt-5.2': 'gpt-5.2-PTU'
};

const SYSTEM_PROMPT = `你是一个有帮助的AI助手。你必须始终使用简体中文进行回复，包括你的思考过程（reasoning/thinking）和最终回复。

请使用Markdown格式化你的回复以提高可读性：
- 使用 **粗体** 强调重点
- 使用 \`代码\` 表示行内代码，使用 \`\`\` 表示代码块并指定语言
- 使用标题（##、###）组织内容
- 适当使用项目符号和编号列表
- 使用 > 表示引用
- 使用表格展示结构化数据

重要提醒：你的所有思考过程和最终文本回复都必须使用简体中文，不要使用英文。`;

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ExtractedResponse {
  responseText: string;
  reasoningSummary: string[];
  toolCalls: ToolCall[];
  rawOutputItems: unknown[];
}

async function performWebSearch(query: string): Promise<unknown> {
  const PARALLEL_API_KEY = Deno.env.get('PARALLEL_API_KEY');
  
  if (!PARALLEL_API_KEY) {
    console.error('PARALLEL_API_KEY not set');
    return { error: 'Search API not configured' };
  }

  console.log('Performing web search for:', query);
  
  try {
    const response = await fetch('https://api.parallel.ai/v1beta/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PARALLEL_API_KEY}`
      },
      body: JSON.stringify({ objective: query, processor: "pro" })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Parallel AI search error:', errorText);
      return { error: `Search failed: ${response.status}` };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Search error:', error);
    return { error: (error as Error).message };
  }
}

async function performWebFetch(url: string): Promise<unknown> {
  const JINA_API_KEY = Deno.env.get('JINA_API_KEY');
  
  if (!JINA_API_KEY) {
    console.error('JINA_API_KEY not set');
    return { error: 'Web fetch API not configured' };
  }

  console.log('Fetching URL:', url);
  
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${JINA_API_KEY}` }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jina fetch error:', errorText);
      return { error: `Fetch failed: ${response.status}` };
    }

    const content = await response.text();
    return { url, content };
  } catch (error) {
    console.error('Fetch error:', error);
    return { error: (error as Error).message };
  }
}

function extractResponse(data: { output?: unknown[] }): ExtractedResponse {
  let responseText = '';
  let reasoningSummary: string[] = [];
  let toolCalls: ToolCall[] = [];
  let rawOutputItems: unknown[] = [];

  if (data.output && data.output.length > 0) {
    rawOutputItems = data.output.filter((item: any) => 
      item.type === 'reasoning' || item.type === 'function_call'
    );

    const reasoningOutput = data.output.find((item: any) => item.type === 'reasoning') as any;
    if (reasoningOutput?.summary?.length > 0) {
      reasoningSummary = reasoningOutput.summary.map((item: any) => item.text || item);
    }

    const functionCalls = data.output.filter((item: any) => item.type === 'function_call') as any[];
    toolCalls = functionCalls.map(fc => ({
      id: fc.call_id,
      name: fc.name,
      arguments: JSON.parse(fc.arguments || '{}')
    }));

    const messageOutput = data.output.find((item: any) => item.type === 'message') as any;
    if (messageOutput?.content?.length > 0) {
      const textContent = messageOutput.content.find((item: any) => item.type === 'output_text');
      if (textContent) {
        responseText = textContent.text;
      }
    }
  }

  return { responseText, reasoningSummary, toolCalls, rawOutputItems };
}

export default async (request: Request, context: Context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const AZURE_API_KEY = Deno.env.get('AZURE_API_KEY');
  const AZURE_ENDPOINT = Deno.env.get('AZURE_ENDPOINT');

  if (!AZURE_API_KEY || !AZURE_ENDPOINT) {
    return new Response(JSON.stringify({ error: 'Azure API configuration missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const body = await request.json();
        const { messages, modelConfig, pendingContext, answers } = body;
        const isContinueMode = !!pendingContext;

        let input: unknown[];
        let selectedModel: string;
        let reasoningEffort: string;
        let deploymentName: string;

        if (isContinueMode) {
          console.log('Mode: Continue after clarify');
          const { input: savedInput, rawOutputItems, clarifyCallId, model, reasoningEffort: effort } = pendingContext;
          
          // Debug: log the rawOutputItems to verify structure
          console.log('Continue - rawOutputItems:', JSON.stringify(rawOutputItems, null, 2));
          console.log('Continue - clarifyCallId from pendingContext:', clarifyCallId);
          
          // Find the actual call_id from rawOutputItems
          const clarifyFunctionCall = rawOutputItems.find((item: any) => 
            item.type === 'function_call' && item.name === 'clarify'
          ) as any;
          const actualCallId = clarifyFunctionCall?.call_id || clarifyCallId;
          console.log('Continue - actualCallId from rawOutputItems:', actualCallId);
          
          input = [...savedInput, ...rawOutputItems, {
            type: "function_call_output",
            call_id: actualCallId,
            output: JSON.stringify(answers)
          }];
          selectedModel = model;
          reasoningEffort = effort;
          deploymentName = MODEL_DEPLOYMENT_MAP[model] || model;
        } else {
          console.log('Mode: New chat');
          selectedModel = modelConfig?.model || 'gpt-5.2';
          reasoningEffort = modelConfig?.reasoningEffort || 'medium';
          deploymentName = MODEL_DEPLOYMENT_MAP[selectedModel] || selectedModel;

          const systemPrompt = {
            role: 'developer',
            content: [{ type: 'input_text', text: SYSTEM_PROMPT }]
          };

          input = [
            systemPrompt,
            ...messages.map((msg: any) => {
              const contentItems: unknown[] = [];
              if (msg.role === 'user') {
                if (msg.content) {
                  contentItems.push({ type: 'input_text', text: msg.content });
                }
                if (msg.images?.length > 0) {
                  msg.images.forEach((img: any) => {
                    contentItems.push({
                      type: 'input_image',
                      image_url: `data:${img.mimeType};base64,${img.base64}`
                    });
                  });
                }
              } else {
                contentItems.push({ type: 'output_text', text: msg.content });
              }
              return { role: msg.role, content: contentItems };
            })
          ];
        }

        console.log('Stream - Model:', selectedModel, 'Deployment:', deploymentName);
        sendEvent({ type: 'start' });

        async function processAzureStream(
          inputData: unknown[],
          onEvent: (event: { type: string; delta?: string }) => void
        ): Promise<{ fullResponse: any; currentReasoningText: string; currentContentText: string }> {
          const requestBody = {
            model: deploymentName,
            input: inputData,
            max_output_tokens: 32000,
            stream: true,
            reasoning: { effort: reasoningEffort, summary: "concise" },
            tools: ALL_TOOLS
          };

          const response = await fetch(`${AZURE_ENDPOINT}/openai/responses?api-version=2025-03-01-preview`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': AZURE_API_KEY!,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Azure API Error: ${response.status} - ${errorText}`);
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullResponse: any = null;
          let currentReasoningText = '';
          let currentContentText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || !line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;

              try {
                const event = JSON.parse(data);
                switch (event.type) {
                  case 'response.reasoning_summary_text.delta':
                  case 'response.reasoning_summary_part.delta':
                  case 'response.summary_text.delta':
                    currentReasoningText += event.delta || '';
                    onEvent({ type: 'reasoning_delta', delta: event.delta || '' });
                    break;
                  case 'response.output_text.delta':
                    currentContentText += event.delta || '';
                    onEvent({ type: 'content_delta', delta: event.delta || '' });
                    break;
                  case 'response.done':
                  case 'response.completed':
                    fullResponse = event.response;
                    break;
                }
              } catch (e) {
                console.error('Failed to parse SSE event:', line, (e as Error).message);
              }
            }
          }

          return { fullResponse, currentReasoningText, currentContentText };
        }

        let allToolCalls: ToolCall[] = [];
        let allReasoningSummary: string[] = [];
        let iteration = 0;
        let continueLoop = true;

        while (continueLoop) {
          iteration++;
          console.log(`Stream iteration ${iteration}`);

          const { fullResponse, currentReasoningText } = await processAzureStream(input, (event) => {
            if (event.type === 'reasoning_delta') {
              sendEvent({ type: 'reasoning_delta', delta: event.delta });
            } else if (event.type === 'content_delta') {
              sendEvent({ type: 'content_delta', delta: event.delta });
            }
          });

          if (!fullResponse) {
            throw new Error('No response from Azure API');
          }

          const { toolCalls, rawOutputItems } = extractResponse(fullResponse);

          if (currentReasoningText) {
            allReasoningSummary.push(currentReasoningText);
          }

          if (toolCalls.length === 0) {
            continueLoop = false;
            sendEvent({
              type: 'done',
              reasoning: allReasoningSummary,
              toolCalls: allToolCalls.map(tc => ({
                name: tc.name,
                query: (tc.arguments as any)?.query || (tc.arguments as any)?.url || ''
              }))
            });
          } else {
            const clarifyCall = toolCalls.find(tc => tc.name === 'clarify');
            if (clarifyCall) {
              sendEvent({
                type: 'clarify',
                questions: (clarifyCall.arguments as any).questions,
                pendingContext: {
                  input: input,
                  rawOutputItems: rawOutputItems,
                  clarifyCallId: clarifyCall.id,
                  model: selectedModel,
                  reasoningEffort: reasoningEffort
                }
              });
              continueLoop = false;
            } else {
              for (const item of rawOutputItems) {
                (input as unknown[]).push(item);
              }

              for (const toolCall of toolCalls) {
                allToolCalls.push(toolCall);

                if (toolCall.name === 'web_search') {
                  sendEvent({ type: 'tool_call', name: 'web_search', query: (toolCall.arguments as any).query });
                  const searchResults = await performWebSearch((toolCall.arguments as any).query);
                  sendEvent({ type: 'tool_result', name: 'web_search', resultCount: (searchResults as any).results?.length || 0 });
                  (input as unknown[]).push({
                    type: "function_call_output",
                    call_id: toolCall.id,
                    output: JSON.stringify(searchResults)
                  });
                }

                if (toolCall.name === 'web_fetch') {
                  sendEvent({ type: 'tool_call', name: 'web_fetch', query: (toolCall.arguments as any).url });
                  const fetchResult = await performWebFetch((toolCall.arguments as any).url);
                  sendEvent({ type: 'tool_result', name: 'web_fetch', resultCount: (fetchResult as any).content?.length || 0 });
                  (input as unknown[]).push({
                    type: "function_call_output",
                    call_id: toolCall.id,
                    output: JSON.stringify(fetchResult)
                  });
                }
              }
            }
          }
        }

        console.log('=== Chat Stream Completed ===');
      } catch (error) {
        console.error('Stream error:', error);
        const errorMessage = (error as Error).message;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    }
  });
};

export const config: Config = {
  path: "/api/chat-stream"
};
