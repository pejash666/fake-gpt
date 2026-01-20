const fetch = require('node-fetch');

// Web search tool definition
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

// Call Parallel AI search API
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

// Call Azure OpenAI API
async function callAzureAPI(input, selectedModel, reasoningEffort, tools = null, AZURE_ENDPOINT, AZURE_API_KEY) {
  const requestBody = {
    model: selectedModel,
    input: input,
    max_output_tokens: 2000,
    reasoning: {
      effort: reasoningEffort,
      summary: "detailed"
    }
  };

  if (tools) {
    requestBody.tools = tools;
  }

  console.log('Azure Request Body:', JSON.stringify(requestBody, null, 2));

  const response = await fetch(`${AZURE_ENDPOINT}/openai/responses?api-version=2025-03-01-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  console.log('Azure Response Status:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Azure API error:', errorText);
    throw new Error(`Azure API error: ${response.status}`);
  }

  return await response.json();
}

// Extract results from Azure response
function extractResponse(data) {
  let responseText = '';
  let reasoningSummary = [];
  let toolCalls = [];
  let rawFunctionCalls = [];

  if (data.output && data.output.length > 0) {
    // Find reasoning output
    const reasoningOutput = data.output.find(item => item.type === 'reasoning');
    if (reasoningOutput && reasoningOutput.summary && reasoningOutput.summary.length > 0) {
      reasoningSummary = reasoningOutput.summary.map(item => item.text || item);
    }

    // Find tool calls and keep raw function_call objects
    const functionCalls = data.output.filter(item => item.type === 'function_call');
    rawFunctionCalls = functionCalls;
    toolCalls = functionCalls.map(fc => ({
      id: fc.call_id,
      name: fc.name,
      arguments: JSON.parse(fc.arguments || '{}')
    }));

    // Find message output
    const messageOutput = data.output.find(item => item.type === 'message');
    if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
      const textContent = messageOutput.content.find(item => item.type === 'output_text');
      if (textContent) {
        responseText = textContent.text;
      }
    }
  }

  return { responseText, reasoningSummary, toolCalls, rawFunctionCalls };
}

exports.handler = async (event, context) => {
  console.log('=== Chat Function Started ===');
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { messages, modelConfig } = JSON.parse(event.body);
    
    const { AZURE_API_KEY, AZURE_ENDPOINT, AZURE_DEPLOYMENT_NAME } = process.env;

    if (!AZURE_API_KEY || !AZURE_ENDPOINT || !AZURE_DEPLOYMENT_NAME) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing Azure configuration' }),
      };
    }

    const selectedModel = modelConfig?.model || AZURE_DEPLOYMENT_NAME;
    const reasoningEffort = modelConfig?.reasoning?.effort || 'medium';

    // Convert messages to input format
    let input = messages.map(msg => ({
      type: "message",
      role: msg.role,
      content: [
        {
          type: msg.role === 'assistant' ? "output_text" : "input_text",
          text: msg.content
        }
      ]
    }));

    // First API call with tools
    console.log('Making first API call with web_search tool...');
    let data = await callAzureAPI(input, selectedModel, reasoningEffort, [WEB_SEARCH_TOOL], AZURE_ENDPOINT, AZURE_API_KEY);
    console.log('First response:', JSON.stringify(data, null, 2));

    let { responseText, reasoningSummary, toolCalls, rawFunctionCalls } = extractResponse(data);

    // Handle tool calls if any
    if (toolCalls.length > 0) {
      console.log('Tool calls detected:', toolCalls);

      // Add function_call objects from first response to input
      for (const fc of rawFunctionCalls) {
        input.push(fc);
      }

      for (const toolCall of toolCalls) {
        if (toolCall.name === 'web_search') {
          const searchResults = await performWebSearch(toolCall.arguments.query);
          
          // Add function call output to input for follow-up
          input.push({
            type: "function_call_output",
            call_id: toolCall.id,
            output: JSON.stringify(searchResults)
          });
        }
      }

      // Second API call with tool results
      console.log('Making second API call with tool results...');
      console.log('Input for second call:', JSON.stringify(input, null, 2));
      data = await callAzureAPI(input, selectedModel, reasoningEffort, [WEB_SEARCH_TOOL], AZURE_ENDPOINT, AZURE_API_KEY);
      console.log('Second response:', JSON.stringify(data, null, 2));

      const secondResult = extractResponse(data);
      responseText = secondResult.responseText;
      reasoningSummary = [...reasoningSummary, ...secondResult.reasoningSummary];
    }

    console.log('=== Chat Function Completed ===');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({
        response: responseText,
        reasoning: reasoningSummary
      }),
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
