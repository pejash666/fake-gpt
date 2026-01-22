import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Tool definitions
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
            id: {
              type: "string",
              description: "Unique identifier for this question"
            },
            question: {
              type: "string",
              description: "The question text to display"
            },
            type: {
              type: "string",
              enum: ["single_choice", "multiple_choice", "text"],
              description: "Type of input: single_choice (radio), multiple_choice (checkbox), or text (free input)"
            },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Options for single_choice or multiple_choice questions"
            },
            required: {
              type: "boolean",
              description: "Whether this question must be answered"
            }
          },
          required: ["id", "question", "type"]
        }
      }
    },
    required: ["questions"]
  }
};

const ALL_TOOLS = [WEB_SEARCH_TOOL, WEB_FETCH_TOOL, CLARIFY_TOOL];

// Map frontend model name to Azure deployment name
const MODEL_DEPLOYMENT_MAP = {
  'gpt-5.1': 'gpt-5.1-PTU',
  'gpt-5.2': 'gpt-5.2'
};

async function performWebSearch(query) {
  const PARALLEL_API_KEY = process.env.PARALLEL_API_KEY;
  
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
      body: JSON.stringify({ 
        objective: query,
        processor: "pro"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Parallel AI search error:', errorText);
      return { error: `Search failed: ${response.status}` };
    }

    const data = await response.json();
    console.log('Search results:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Search error:', error);
    return { error: error.message };
  }
}

async function performWebFetch(url) {
  const JINA_API_KEY = process.env.JINA_API_KEY;
  
  if (!JINA_API_KEY) {
    console.error('JINA_API_KEY not set');
    return { error: 'Web fetch API not configured' };
  }

  console.log('Fetching URL:', url);
  
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JINA_API_KEY}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jina fetch error:', errorText);
      return { error: `Fetch failed: ${response.status}` };
    }

    const content = await response.text();
    console.log('Fetched content length:', content.length);
    return { url, content };
  } catch (error) {
    console.error('Fetch error:', error);
    return { error: error.message };
  }
}

async function callAzureAPI(input, model, reasoningEffort, tools, endpoint, apiKey) {
  const requestBody = {
    model: model,
    input: input,
    max_output_tokens: 32000,
    reasoning: {
      effort: reasoningEffort,
      summary: "concise"
    },
    tools: tools
  };

  console.log('Azure Request Body:', JSON.stringify(requestBody, null, 2));

  const response = await fetch(`${endpoint}/openai/responses?api-version=2025-03-01-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Azure API Error:', errorText);
    throw new Error(`Azure API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

function extractResponse(data) {
  let responseText = '';
  let reasoningSummary = [];
  let toolCalls = [];
  let rawOutputItems = [];

  if (data.output && data.output.length > 0) {
    rawOutputItems = data.output.filter(item => 
      item.type === 'reasoning' || item.type === 'function_call'
    );

    const reasoningOutput = data.output.find(item => item.type === 'reasoning');
    if (reasoningOutput && reasoningOutput.summary && reasoningOutput.summary.length > 0) {
      reasoningSummary = reasoningOutput.summary.map(item => item.text || item);
    }

    const functionCalls = data.output.filter(item => item.type === 'function_call');
    toolCalls = functionCalls.map(fc => ({
      id: fc.call_id,
      name: fc.name,
      arguments: JSON.parse(fc.arguments || '{}')
    }));

    const messageOutput = data.output.find(item => item.type === 'message');
    if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
      const textContent = messageOutput.content.find(item => item.type === 'output_text');
      if (textContent) {
        responseText = textContent.text;
      }
    }
  }

  return { responseText, reasoningSummary, toolCalls, rawOutputItems };
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, modelConfig } = req.body;
    
    const AZURE_API_KEY = process.env.AZURE_API_KEY;
    const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT;
    
    if (!AZURE_API_KEY || !AZURE_ENDPOINT) {
      return res.status(500).json({ error: 'Azure API configuration missing' });
    }

    const selectedModel = modelConfig?.model || 'gpt-5.2';
    const reasoningEffort = modelConfig?.reasoningEffort || 'medium';
    const deploymentName = MODEL_DEPLOYMENT_MAP[selectedModel] || selectedModel;

    console.log('=== Chat Request ===');
    console.log('Model:', selectedModel, 'Deployment:', deploymentName, 'Reasoning:', reasoningEffort);

    // System prompt for markdown formatting
    const systemPrompt = {
      role: 'developer',
      content: [{
        type: 'input_text',
        text: `你是一个有帮助的AI助手。你必须始终使用简体中文进行回复，包括你的思考过程（reasoning/thinking）和最终回复。

请使用Markdown格式化你的回复以提高可读性：
- 使用 **粗体** 强调重点
- 使用 \`代码\` 表示行内代码，使用 \`\`\` 表示代码块并指定语言
- 使用标题（##、###）组织内容
- 适当使用项目符号和编号列表
- 使用 > 表示引用
- 使用表格展示结构化数据

重要提醒：你的所有思考过程和最终文本回复都必须使用简体中文，不要使用英文。`
      }]
    };

    // Build input with system prompt first
    const input = [
      systemPrompt,
      ...messages.map(msg => {
        const contentItems = [];
        
        if (msg.role === 'user') {
          if (msg.content) {
            contentItems.push({ type: 'input_text', text: msg.content });
          }
          if (msg.images && msg.images.length > 0) {
            msg.images.forEach(img => {
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

    let data = await callAzureAPI(input, deploymentName, reasoningEffort, ALL_TOOLS, AZURE_ENDPOINT, AZURE_API_KEY);
    console.log('First response:', JSON.stringify(data, null, 2));

    let { responseText, reasoningSummary, toolCalls, rawOutputItems } = extractResponse(data);

    // Handle tool calls in a loop until model returns final text
    let allToolCalls = [...toolCalls];
    let allSteps = [];
    let iteration = 0;

    // Record initial reasoning if any
    if (reasoningSummary.length > 0) {
      allSteps.push({ type: 'reasoning', content: reasoningSummary.join('\n'), timestamp: Date.now() });
    }

    while (toolCalls.length > 0) {
      iteration++;
      console.log(`Tool calls detected (iteration ${iteration}):`, toolCalls);

      // Check if clarify tool is called - return pending status to frontend
      const clarifyCall = toolCalls.find(tc => tc.name === 'clarify');
      if (clarifyCall) {
        console.log('Clarify tool called, returning questions to frontend');
        return res.json({
          status: 'pending_clarification',
          response: '',
          reasoning: reasoningSummary,
          toolCalls: [{ name: 'clarify', questions: clarifyCall.arguments.questions }],
          pendingContext: {
            input: input,
            rawOutputItems: rawOutputItems,
            clarifyCallId: clarifyCall.id,
            model: selectedModel,
            reasoningEffort: reasoningEffort
          }
        });
      }

      // Handle other tool calls (web_search)
      for (const item of rawOutputItems) {
        input.push(item);
      }

      for (const toolCall of toolCalls) {
        if (toolCall.name === 'web_search') {
          // Record tool call step
          allSteps.push({ 
            type: 'tool_call', 
            content: `🔍 正在搜索: ${toolCall.arguments.query}`,
            timestamp: Date.now()
          });

          const searchResults = await performWebSearch(toolCall.arguments.query);
          
          // Record tool result step
          const resultCount = searchResults.results?.length || 0;
          allSteps.push({
            type: 'tool_result',
            content: `✅ 搜索完成，获取到 ${resultCount} 条结果`,
            timestamp: Date.now()
          });
          
          input.push({
            type: "function_call_output",
            call_id: toolCall.id,
            output: JSON.stringify(searchResults)
          });
        }
        
        if (toolCall.name === 'web_fetch') {
          allSteps.push({ 
            type: 'tool_call', 
            content: `🌐 正在获取页面: ${toolCall.arguments.url}`,
            timestamp: Date.now()
          });

          const fetchResult = await performWebFetch(toolCall.arguments.url);
          
          allSteps.push({
            type: 'tool_result',
            content: `✅ 页面获取完成，内容长度: ${fetchResult.content?.length || 0}`,
            timestamp: Date.now()
          });

          input.push({
            type: "function_call_output",
            call_id: toolCall.id,
            output: JSON.stringify(fetchResult)
          });
        }
      }

      console.log(`Making API call ${iteration + 1} with tool results...`);
      data = await callAzureAPI(input, deploymentName, reasoningEffort, ALL_TOOLS, AZURE_ENDPOINT, AZURE_API_KEY);
      console.log(`Response ${iteration + 1}:`, JSON.stringify(data, null, 2));

      const result = extractResponse(data);
      responseText = result.responseText;
      reasoningSummary = [...reasoningSummary, ...result.reasoningSummary];
      toolCalls = result.toolCalls;
      rawOutputItems = result.rawOutputItems;
      allToolCalls = [...allToolCalls, ...toolCalls];

      // Record reasoning from this iteration
      if (result.reasoningSummary.length > 0) {
        allSteps.push({ type: 'reasoning', content: result.reasoningSummary.join('\n'), timestamp: Date.now() });
      }
    }
    
    const toolCallsInfo = allToolCalls.map(tc => ({
      name: tc.name,
      query: tc.arguments?.query || tc.arguments?.url || tc.arguments?.objective || (tc.arguments ? JSON.stringify(tc.arguments) : '')
    }));

    res.json({
      status: 'complete',
      response: responseText,
      reasoning: reasoningSummary,
      toolCalls: toolCallsInfo,
      steps: allSteps
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Continue after clarification
app.post('/api/chat/continue', async (req, res) => {
  try {
    const { pendingContext, answers } = req.body;
    
    const AZURE_API_KEY = process.env.AZURE_API_KEY;
    const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT;
    
    if (!AZURE_API_KEY || !AZURE_ENDPOINT) {
      return res.status(500).json({ error: 'Azure API configuration missing' });
    }

    console.log('=== Continue after clarification ===');
    console.log('Answers:', JSON.stringify(answers, null, 2));

    const { input, rawOutputItems: pendingRawOutputItems, clarifyCallId, model, reasoningEffort } = pendingContext;
    const deploymentName = MODEL_DEPLOYMENT_MAP[model] || model;

    // Add raw output items (reasoning + function_call) to input
    for (const item of pendingRawOutputItems) {
      input.push(item);
    }

    // Add user's answers as function_call_output
    input.push({
      type: "function_call_output",
      call_id: clarifyCallId,
      output: JSON.stringify(answers)
    });

    console.log('Input for continue:', JSON.stringify(input, null, 2));

    let data = await callAzureAPI(input, deploymentName, reasoningEffort, ALL_TOOLS, AZURE_ENDPOINT, AZURE_API_KEY);
    console.log('Continue response:', JSON.stringify(data, null, 2));

    let { responseText, reasoningSummary, toolCalls, rawOutputItems } = extractResponse(data);

    // Handle tool calls in a loop until model returns final text
    let allToolCalls = [...toolCalls];
    let allSteps = [];
    let iteration = 0;

    // Record initial reasoning if any
    if (reasoningSummary.length > 0) {
      allSteps.push({ type: 'reasoning', content: reasoningSummary.join('\n'), timestamp: Date.now() });
    }

    while (toolCalls.length > 0) {
      iteration++;
      console.log(`Continue: Tool calls detected (iteration ${iteration}):`, toolCalls);

      // Check for another clarify call
      const clarifyCall = toolCalls.find(tc => tc.name === 'clarify');
      if (clarifyCall) {
        return res.json({
          status: 'pending_clarification',
          response: '',
          reasoning: reasoningSummary,
          toolCalls: [{ name: 'clarify', questions: clarifyCall.arguments.questions }],
          pendingContext: {
            input: input,
            rawOutputItems: rawOutputItems,
            clarifyCallId: clarifyCall.id,
            model: model,
            reasoningEffort: reasoningEffort
          }
        });
      }

      // Handle other tool calls (web_search)
      for (const item of rawOutputItems) {
        input.push(item);
      }

      for (const toolCall of toolCalls) {
        if (toolCall.name === 'web_search') {
          // Record tool call step
          allSteps.push({ 
            type: 'tool_call', 
            content: `🔍 正在搜索: ${toolCall.arguments.query}`,
            timestamp: Date.now()
          });

          const searchResults = await performWebSearch(toolCall.arguments.query);
          
          // Record tool result step
          const resultCount = searchResults.results?.length || 0;
          allSteps.push({
            type: 'tool_result',
            content: `✅ 搜索完成，获取到 ${resultCount} 条结果`,
            timestamp: Date.now()
          });

          input.push({
            type: "function_call_output",
            call_id: toolCall.id,
            output: JSON.stringify(searchResults)
          });
        }

        if (toolCall.name === 'web_fetch') {
          allSteps.push({ 
            type: 'tool_call', 
            content: `🌐 正在获取页面: ${toolCall.arguments.url}`,
            timestamp: Date.now()
          });

          const fetchResult = await performWebFetch(toolCall.arguments.url);
          
          allSteps.push({
            type: 'tool_result',
            content: `✅ 页面获取完成，内容长度: ${fetchResult.content?.length || 0}`,
            timestamp: Date.now()
          });

          input.push({
            type: "function_call_output",
            call_id: toolCall.id,
            output: JSON.stringify(fetchResult)
          });
        }
      }

      console.log(`Continue: Making API call ${iteration + 1} with tool results...`);
      data = await callAzureAPI(input, deploymentName, reasoningEffort, ALL_TOOLS, AZURE_ENDPOINT, AZURE_API_KEY);
      console.log(`Continue: Response ${iteration + 1}:`, JSON.stringify(data, null, 2));

      const result = extractResponse(data);
      responseText = result.responseText;
      reasoningSummary = [...reasoningSummary, ...result.reasoningSummary];
      toolCalls = result.toolCalls;
      rawOutputItems = result.rawOutputItems;
      allToolCalls = [...allToolCalls, ...toolCalls];

      console.log(`Continue: After iteration ${iteration}, toolCalls.length = ${toolCalls.length}, responseText length = ${responseText.length}`);

      // Record reasoning from this iteration
      if (result.reasoningSummary.length > 0) {
        allSteps.push({ type: 'reasoning', content: result.reasoningSummary.join('\n'), timestamp: Date.now() });
      }
    }

    console.log('Continue: Loop exited, returning response...');
    const toolCallsInfo = allToolCalls.map(tc => ({
      name: tc.name,
      query: tc.arguments?.query || tc.arguments?.url || tc.arguments?.objective || (tc.arguments ? JSON.stringify(tc.arguments) : '')
    }));

    res.json({
      status: 'complete',
      response: responseText,
      reasoning: reasoningSummary,
      toolCalls: toolCallsInfo,
      steps: allSteps
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SSE streaming chat endpoint - supports both new chat and continue after clarify
app.post('/api/chat-stream', async (req, res) => {
  console.log('=== Chat Stream Request ===');
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { messages, modelConfig, pendingContext, answers } = req.body;
    const isContinueMode = !!pendingContext;
    
    const AZURE_API_KEY = process.env.AZURE_API_KEY;
    const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT;
    
    if (!AZURE_API_KEY || !AZURE_ENDPOINT) {
      sendEvent({ type: 'error', message: 'Azure API configuration missing' });
      res.end();
      return;
    }

    let input;
    let selectedModel;
    let reasoningEffort;
    let deploymentName;

    if (isContinueMode) {
      console.log('Mode: Continue after clarify');
      const { input: savedInput, rawOutputItems, clarifyCallId, model, reasoningEffort: effort } = pendingContext;
      console.log('Continue - savedInput length:', savedInput.length);
      console.log('Continue - rawOutputItems:', JSON.stringify(rawOutputItems, null, 2));
      console.log('Continue - clarifyCallId:', clarifyCallId);
      input = [...savedInput, ...rawOutputItems, {
        type: "function_call_output",
        call_id: clarifyCallId,
        output: JSON.stringify(answers)
      }];
      console.log('Continue - final input:', JSON.stringify(input, null, 2));
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
        content: [{
          type: 'input_text',
          text: `你是一个有帮助的AI助手。你必须始终使用简体中文进行回复，包括你的思考过程（reasoning/thinking）和最终回复。

请使用Markdown格式化你的回复以提高可读性：
- 使用 **粗体** 强调重点
- 使用 \`代码\` 表示行内代码，使用 \`\`\` 表示代码块并指定语言
- 使用标题（##、###）组织内容
- 适当使用项目符号和编号列表
- 使用 > 表示引用
- 使用表格展示结构化数据

重要提醒：你的所有思考过程和最终文本回复都必须使用简体中文，不要使用英文。`
        }]
      };

      input = [
        systemPrompt,
        ...messages.map(msg => {
          const contentItems = [];
          if (msg.role === 'user') {
            if (msg.content) {
              contentItems.push({ type: 'input_text', text: msg.content });
            }
            if (msg.images && msg.images.length > 0) {
              msg.images.forEach(img => {
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

    async function processAzureStream(inputData, onEvent) {
      const requestBody = {
        model: deploymentName,
        input: inputData,
        max_output_tokens: 32000,
        stream: true,
        reasoning: {
          effort: reasoningEffort,
          summary: "concise"
        },
        tools: ALL_TOOLS
      };

      const response = await fetch(`${AZURE_ENDPOINT}/openai/responses?api-version=2025-03-01-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_API_KEY,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure API Error: ${response.status} - ${errorText}`);
      }

      const reader = response.body;
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = null;
      let currentReasoningText = '';
      let currentContentText = '';

      for await (const chunk of reader) {
        buffer += decoder.decode(chunk, { stream: true });
        
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
            console.error('Failed to parse SSE event:', line, e.message);
          }
        }
      }

      return { fullResponse, currentReasoningText, currentContentText };
    }

    let allToolCalls = [];
    let allReasoningSummary = [];
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

      console.log('Stream - fullResponse.output:', JSON.stringify(fullResponse.output, null, 2));
      const { responseText, reasoningSummary, toolCalls, rawOutputItems } = extractResponse(fullResponse);
      console.log('Stream - extracted toolCalls:', JSON.stringify(toolCalls, null, 2));
      console.log('Stream - extracted rawOutputItems:', JSON.stringify(rawOutputItems, null, 2));
      
      if (currentReasoningText) {
        allReasoningSummary.push(currentReasoningText);
      }

      if (toolCalls.length === 0) {
        continueLoop = false;
        sendEvent({ type: 'done', reasoning: allReasoningSummary, toolCalls: allToolCalls.map(tc => ({ name: tc.name, query: tc.arguments?.query || tc.arguments?.url || '' })) });
      } else {
        const clarifyCall = toolCalls.find(tc => tc.name === 'clarify');
        if (clarifyCall) {
          sendEvent({
            type: 'clarify',
            questions: clarifyCall.arguments.questions,
            pendingContext: {
              input: input,
              rawOutputItems: rawOutputItems,
              clarifyCallId: clarifyCall.id,
              model: selectedModel,
              reasoningEffort: reasoningEffort
            }
          });
          res.end();
          return;
        }

        for (const item of rawOutputItems) {
          input.push(item);
        }

        for (const toolCall of toolCalls) {
          allToolCalls.push(toolCall);
          
          if (toolCall.name === 'web_search') {
            sendEvent({ type: 'tool_call', name: 'web_search', query: toolCall.arguments.query });
            const searchResults = await performWebSearch(toolCall.arguments.query);
            sendEvent({ type: 'tool_result', name: 'web_search', resultCount: searchResults.results?.length || 0 });
            input.push({
              type: "function_call_output",
              call_id: toolCall.id,
              output: JSON.stringify(searchResults)
            });
          }
          
          if (toolCall.name === 'web_fetch') {
            sendEvent({ type: 'tool_call', name: 'web_fetch', query: toolCall.arguments.url });
            const fetchResult = await performWebFetch(toolCall.arguments.url);
            sendEvent({ type: 'tool_result', name: 'web_fetch', resultCount: fetchResult.content?.length || 0 });
            input.push({
              type: "function_call_output",
              call_id: toolCall.id,
              output: JSON.stringify(fetchResult)
            });
          }
        }
      }
    }

    console.log('=== Chat Stream Completed ===');
    res.end();

  } catch (error) {
    console.error('Stream error:', error);
    sendEvent({ type: 'error', message: error.message });
    res.end();
  }
});

// Generate conversation title
app.post('/api/generate-title', async (req, res) => {
  console.log('=== Generate Title Request ===');
  try {
    const { message } = req.body;
    console.log('Message:', message);
    
    const AZURE_API_KEY = process.env.AZURE_API_KEY;
    const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT;
    
    if (!AZURE_API_KEY || !AZURE_ENDPOINT) {
      return res.status(500).json({ error: 'Azure API configuration missing' });
    }

    const systemPrompt = {
      role: 'developer',
      content: [{
        type: 'input_text',
        text: '你是一个起名专家。根据用户的消息内容，为这个对话生成一个简短的标题（不超过20个字符）。只返回标题文本，不要加引号或其他格式。'
      }]
    };

    const input = [
      systemPrompt,
      {
        role: 'user',
        content: [{ type: 'input_text', text: message }]
      }
    ];

    const requestBody = {
      model: 'gpt-5-nano',
      input: input,
      max_output_tokens: 1500
    };

    console.log('Title request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${AZURE_ENDPOINT}/openai/responses?api-version=2025-03-01-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Title generation error:', errorText);
      return res.status(500).json({ error: 'Failed to generate title' });
    }

    const data = await response.json();
    console.log('Title API response:', JSON.stringify(data, null, 2));
    let title = '';
    
    if (data.output) {
      const messageOutput = data.output.find(item => item.type === 'message');
      if (messageOutput?.content) {
        const textContent = messageOutput.content.find(item => item.type === 'output_text');
        if (textContent) {
          title = textContent.text.trim();
        }
      }
    }

    res.json({ title: title || message.slice(0, 20) });
  } catch (error) {
    console.error('Error generating title:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
