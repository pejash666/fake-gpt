# Azure ChatGPT with Netlify Functions

A secure ChatGPT-like interface using Azure OpenAI API with Netlify Functions to protect API keys.

## Features

- 🚀 **Secure API Integration**: Uses Netlify Functions to hide Azure API keys
- 💬 **Chat Interface**: Modern, responsive chat UI similar to ChatGPT
- 🔒 **No Exposed Credentials**: API keys stay server-side
- 📱 **Mobile Responsive**: Works on all devices
- ⚡ **Fast Performance**: Built with React and Vite

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file with your Azure OpenAI credentials:
```bash
cp .env.example .env
```

Edit `.env` with your actual values:
```
AZURE_API_KEY=your_actual_api_key
AZURE_ENDPOINT=https://your-resource.openai.azure.com
AZURE_DEPLOYMENT_NAME=your_deployment_name
```

### 3. Local Development
```bash
npm run dev
```

### 4. Deploy to Netlify

1. Push your code to GitHub
2. Connect your repository to Netlify
3. Add environment variables in Netlify dashboard:
   - `AZURE_API_KEY`
   - `AZURE_ENDPOINT`
   - `AZURE_DEPLOYMENT_NAME`
4. Deploy!

## Architecture

```
Frontend (React) → Netlify Function → Azure OpenAI API
```

The Netlify Function acts as a secure proxy, ensuring your API keys never reach the browser.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AZURE_API_KEY` | Your Azure OpenAI API key | ✅ |
| `AZURE_ENDPOINT` | Your Azure OpenAI endpoint URL | ✅ |
| `AZURE_DEPLOYMENT_NAME` | Your model deployment name | ✅ |

## Free Tier Limits

Netlify Functions free tier includes:
- 100,000 function invocations/month
- 3,600 hours of build time/month
- Unlimited sites

Perfect for personal projects and prototypes!
