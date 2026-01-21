const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { message } = JSON.parse(event.body);
    
    const { AZURE_API_KEY, AZURE_ENDPOINT } = process.env;

    if (!AZURE_API_KEY || !AZURE_ENDPOINT) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Azure API configuration missing' }),
      };
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
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to generate title' }),
      };
    }

    const data = await response.json();
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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ title: title || message.slice(0, 20) }),
    };
  } catch (error) {
    console.error('Error generating title:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
