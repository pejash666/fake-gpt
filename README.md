# Fake GPT

A ChatGPT-like interface powered by Azure OpenAI API, with web search and content fetching capabilities.

## Architecture

```
Browser (React SPA) → Express Server (Node.js) → Azure OpenAI API
                                                → Parallel AI (web search)
                                                → Jina AI (web fetch)
```

Single-container deployment: the Express server serves both the frontend static files and the backend API.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AZURE_API_KEY` | Azure OpenAI API key | Yes |
| `AZURE_ENDPOINT` | Azure OpenAI endpoint URL (e.g. `https://xxx.openai.azure.com`) | Yes |
| `PARALLEL_API_KEY` | Parallel AI API key for web search | No |
| `JINA_API_KEY` | Jina AI API key for web content fetching | No |

## Docker Deployment

### Prerequisites

- Docker 20+ and Docker Compose v2+

### Build

```bash
docker compose build
```

This runs a multi-stage build:
1. **Build stage**: installs all dependencies, compiles TypeScript, and builds the frontend with Vite into `dist/`
2. **Production stage**: installs only runtime dependencies (`express`, `cors`, `dotenv`, `node-fetch`), copies `server.js` and `dist/`, resulting in a ~80MB image

### Configure

Create a `.env` file in the project root:

```bash
cp .env.example .env
# Edit .env with actual values
```

### Run

```bash
docker compose up -d
```

The service listens on port **3002** (configurable via `PORT` env var). Access it at `http://<host>:3002`.

### Health Check

```
GET /healthz → {"status":"ok"}
```

### Stop

```bash
docker compose down
```

### Custom Port

To change the exposed port, edit `docker-compose.yml`:

```yaml
ports:
  - "8080:3002"    # host:container
```

Or to change the container's internal port as well, set the `PORT` environment variable:

```yaml
services:
  fake-gpt:
    build: .
    ports:
      - "8080:8080"
    env_file:
      - .env
    environment:
      - PORT=8080
    restart: unless-stopped
```

### Reverse Proxy (Optional)

If placing behind Nginx or an ALB, proxy to `http://localhost:3002`. The `/api/chat-stream` endpoint uses Server-Sent Events (SSE), so ensure the proxy supports streaming and sets appropriate timeouts (recommend 300s+).

Example Nginx config:

```nginx
server {
    listen 80;
    server_name chat.example.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| POST | `/api/chat` | Send chat message (non-streaming) |
| POST | `/api/chat-stream` | Send chat message (SSE streaming) |
| POST | `/api/chat/continue` | Continue after clarification |
| POST | `/api/generate-title` | Generate conversation title |

## Local Development (without Docker)

```bash
npm install
cp .env.example .env
# Edit .env with actual values
npm run dev:local    # Starts Express backend (port 3002) + Vite dev server (port 3000)
```

## Netlify Deployment

The project also supports deployment to Netlify. See `netlify.toml` for configuration. Add environment variables in the Netlify dashboard and deploy via Git push.
