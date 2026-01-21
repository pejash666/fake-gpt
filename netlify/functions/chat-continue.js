const fetch = require('node-fetch');

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
  description: "Ask the user clarifying questions when their request is ambiguous or you need more information to provide a good answer. Use this to gather specific details before proceeding.",
  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "List of questions to ask the user",
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

exports.handler = async (event, context) => {
  console.log('=== Chat Continue Function Started ===');
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { pendingContext, answers } = JSON.parse(event.body);
    
    const { AZURE_API_KEY, AZURE_ENDPOINT } = process.env;

    if (!AZURE_API_KEY || !AZURE_ENDPOINT) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Azure API configuration missing' }),
      };
    }

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
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
          body: JSON.stringify({
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
          }),
        };
      }

      // Handle other tool calls
      for (const item of rawOutputItems) {
        input.push(item);
      }

      for (const toolCall of toolCalls) {
        if (toolCall.name === 'web_search') {
          allSteps.push({ 
            type: 'tool_call', 
            content: `🔍 正在搜索: ${toolCall.arguments.query}`,
            timestamp: Date.now()
          });

          const searchResults = await performWebSearch(toolCall.arguments.query);
          
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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({
        status: 'complete',
        response: responseText,
        reasoning: reasoningSummary,
        toolCalls: toolCallsInfo,
        steps: allSteps
      }),
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
