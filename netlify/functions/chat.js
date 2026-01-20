const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('=== Chat Function Started ===');
  console.log('HTTP Method:', event.httpMethod);
  console.log('Request Headers:', JSON.stringify(event.headers, null, 2));
  
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    console.log('Method not allowed:', event.httpMethod);
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    console.log('Request body:', event.body);
    const { messages, modelConfig } = JSON.parse(event.body);
    console.log('Parsed messages:', JSON.stringify(messages, null, 2));
    console.log('Model config:', JSON.stringify(modelConfig, null, 2));
    
    // Validate required environment variables
    const { 
      AZURE_API_KEY, 
      AZURE_ENDPOINT, 
      AZURE_DEPLOYMENT_NAME 
    } = process.env;

    console.log('Environment variables check:');
    console.log('- AZURE_API_KEY:', AZURE_API_KEY ? '***SET***' : 'MISSING');
    console.log('- AZURE_ENDPOINT:', AZURE_ENDPOINT || 'MISSING');
    console.log('- AZURE_DEPLOYMENT_NAME:', AZURE_DEPLOYMENT_NAME || 'MISSING');

    if (!AZURE_API_KEY || !AZURE_ENDPOINT || !AZURE_DEPLOYMENT_NAME) {
      console.log('Missing environment variables');
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Missing Azure configuration in environment variables' 
        }),
      };
    }

    // Use model from config or fallback to deployment name
    const selectedModel = modelConfig?.model || AZURE_DEPLOYMENT_NAME;
    const reasoningEffort = modelConfig?.reasoning?.effort || 'medium';

    // Convert messages to input format for Responses API
    const input = messages.map(msg => ({
      type: "message",
      role: msg.role,
      content: [
        {
          type: msg.role === 'assistant' ? "output_text" : "input_text",
          text: msg.content
        }
      ]
    }));

    console.log('Converted input format:', JSON.stringify(input, null, 2));

    const requestBody = {
      model: selectedModel,
      input: input,
      max_output_tokens: 1000,
      reasoning: {
        effort: reasoningEffort
      }
    };

    console.log('Azure Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('Making request to:', `${AZURE_ENDPOINT}/openai/responses?api-version=2025-03-01-preview`);

    // Call Azure OpenAI Responses API
    const response = await fetch(`${AZURE_ENDPOINT}/openai/responses?api-version=2025-03-01-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Azure Response Status:', response.status, response.statusText);
    console.log('Azure Response Headers:', JSON.stringify(Object.fromEntries(response.headers), null, 2));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure API error:', errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: `Azure OpenAI API error: ${response.status} ${response.statusText}` 
        }),
      };
    }

    const data = await response.json();
    console.log('Azure Response Body:', JSON.stringify(data, null, 2));
    
    // Extract response text from Responses API format
    let responseText = '';
    if (data.output && data.output.length > 0) {
      const outputMessage = data.output[0];
      console.log('Output message:', JSON.stringify(outputMessage, null, 2));
      if (outputMessage.content && outputMessage.content.length > 0) {
        const textContent = outputMessage.content.find(item => item.type === 'output_text');
        if (textContent) {
          responseText = textContent.text;
          console.log('Extracted response text:', responseText);
        } else {
          console.log('No output_text found in content');
        }
      } else {
        console.log('No content found in output message');
      }
    } else {
      console.log('No output found in response');
    }
    
    console.log('=== Chat Function Completed Successfully ===');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({
        response: responseText
      }),
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error' 
      }),
    };
  }
};
