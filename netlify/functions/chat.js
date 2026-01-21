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

const ALL_TOOLS = [WEB_SEARCH_TOOL, WEB_FETCH_TOOL];

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
  let rawOutputItems = []; // Keep all output items for follow-up

  if (data.output && data.output.length > 0) {
    // Keep all output items (reasoning, function_call, etc.) for follow-up requests
    rawOutputItems = data.output.filter(item => 
      item.type === 'reasoning' || item.type === 'function_call'
    );

    // Find reasoning output for display
    const reasoningOutput = data.output.find(item => item.type === 'reasoning');
    if (reasoningOutput && reasoningOutput.summary && reasoningOutput.summary.length > 0) {
      reasoningSummary = reasoningOutput.summary.map(item => item.text || item);
    }

    // Find tool calls
    const functionCalls = data.output.filter(item => item.type === 'function_call');
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

  return { responseText, reasoningSummary, toolCalls, rawOutputItems };
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
    console.log('Making first API call with tools...');
    let data = await callAzureAPI(input, selectedModel, reasoningEffort, ALL_TOOLS, AZURE_ENDPOINT, AZURE_API_KEY);
    console.log('First response:', JSON.stringify(data, null, 2));

    let { responseText, reasoningSummary, toolCalls, rawOutputItems } = extractResponse(data);

    // Handle tool calls if any
    if (toolCalls.length > 0) {
      console.log('Tool calls detected:', toolCalls);

      // Add all output items (reasoning + function_call) from first response to input
      for (const item of rawOutputItems) {
        input.push(item);
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

        if (toolCall.name === 'web_fetch') {
          const fetchResult = await performWebFetch(toolCall.arguments.url);
          
          input.push({
            type: "function_call_output",
            call_id: toolCall.id,
            output: JSON.stringify(fetchResult)
          });
        }
      }

      // Second API call with tool results
      console.log('Making second API call with tool results...');
      console.log('Input for second call:', JSON.stringify(input, null, 2));
      data = await callAzureAPI(input, selectedModel, reasoningEffort, ALL_TOOLS, AZURE_ENDPOINT, AZURE_API_KEY);
      console.log('Second response:', JSON.stringify(data, null, 2));

      const secondResult = extractResponse(data);
      responseText = secondResult.responseText;
      reasoningSummary = [...reasoningSummary, ...secondResult.reasoningSummary];
    }

    // Format tool calls for frontend display
    const toolCallsInfo = toolCalls.map(tc => ({
      name: tc.name,
      query: tc.arguments.query || tc.arguments.url || tc.arguments.objective || JSON.stringify(tc.arguments)
    }));

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
        reasoning: reasoningSummary,
        toolCalls: toolCallsInfo
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
