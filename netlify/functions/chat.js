const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { messages } = JSON.parse(event.body);
    
    // Validate required environment variables
    const { 
      AZURE_API_KEY, 
      AZURE_ENDPOINT, 
      AZURE_DEPLOYMENT_NAME 
    } = process.env;

    if (!AZURE_API_KEY || !AZURE_ENDPOINT || !AZURE_DEPLOYMENT_NAME) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Missing Azure configuration in environment variables' 
        }),
      };
    }

    // Convert messages to input format for Responses API
    const input = messages.map(msg => ({
      type: "message",
      role: msg.role,
      content: [
        {
          type: "input_text",
          text: msg.content
        }
      ]
    }));

    // Call Azure OpenAI Responses API
    const response = await fetch(`${AZURE_ENDPOINT}/openai/responses?api-version=2025-03-01-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_API_KEY,
      },
      body: JSON.stringify({
        model: AZURE_DEPLOYMENT_NAME,
        input: input,
        temperature: 0.7,
        max_output_tokens: 1000,
        reasoning: {
          effort: "medium"
        }
      }),
    });

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
    
    // Extract response text from Responses API format
    let responseText = '';
    if (data.output && data.output.length > 0) {
      const outputMessage = data.output[0];
      if (outputMessage.content && outputMessage.content.length > 0) {
        const textContent = outputMessage.content.find(item => item.type === 'output_text');
        if (textContent) {
          responseText = textContent.text;
        }
      }
    }
    
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
