# Antigravity Gateway

[![npm version](https://img.shields.io/npm/v/antigravity-gateway.svg)](https://www.npmjs.com/package/antigravity-gateway)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/johnneerdael/antigravity-gateway/pkgs/container/antigravity-gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Universal AI Gateway** - Access Claude and Gemini models through any OpenAI or Anthropic-compatible client, powered by Antigravity's Cloud Code.

![banner](https://github.com/user-attachments/assets/1949aefe-6ec8-4930-ad9d-13092ca95ae0)



```
┌─────────────────────────────────────────────────────────────────────────┐
│                         YOUR AI TOOLS                                   │
│  Cursor • Cline • Continue • Aider • Claude Code • Gemini CLI • etc.   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     Antigravity Gateway       │
                    │  OpenAI + Anthropic API       │
                    └───────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   Antigravity Cloud Code      │
                    │   Claude • Gemini models      │
                    └───────────────────────────────┘
```

## Features

- **Triple API Support**: OpenAI Chat Completions (`/v1/chat/completions`), OpenAI Responses (`/v1/responses`), and Anthropic (`/v1/messages`) endpoints
- **Multiple Models**: Access Claude Sonnet 4.5, Opus 4.5, and Gemini 3 Flash/Pro models
- **Extended Thinking**: Full support for reasoning/thinking models
- **Multi-Account Load Balancing**: Add multiple Google accounts for higher throughput
- **Universal Compatibility**: Works with any OpenAI or Anthropic-compatible client

## Quick Start

### Docker (Recommended)

```bash
docker pull ghcr.io/johnneerdael/antigravity-gateway:latest

docker run -it -p 8080:8080 \
  -v $(pwd)/data:/root/.config/antigravity-gateway \
  ghcr.io/johnneerdael/antigravity-gateway:latest
```

### Docker Compose

```yaml
services:
  antigravity-gateway:
    image: ghcr.io/johnneerdael/antigravity-gateway:latest
    container_name: antigravity-gateway
    ports:
      - "8080:8080"
    volumes:
      - ./data:/root/.config/antigravity-gateway
    environment:
      - FALLBACK=true
    restart: unless-stopped
```

### NPM

```bash
npx antigravity-gateway start

# Or install globally
npm install -g antigravity-gateway
agw start
```

## Adding Google Accounts

The gateway requires Google accounts with Antigravity access. Add accounts via OAuth:

```bash
# Interactive (opens browser)
agw accounts add

# Headless servers (manual code entry)
agw accounts add --no-browser

# List configured accounts
agw accounts list
```

---

## Client Configuration

The gateway exposes three API endpoints:
- **OpenAI Chat Completions**: `http://localhost:8080/v1/chat/completions`
- **OpenAI Responses API**: `http://localhost:8080/v1/responses`
- **Anthropic-compatible**: `http://localhost:8080/v1/messages`

### Available Models

| Model ID | Type | Context | Output | Thinking |
|----------|------|---------|--------|----------|
| `claude-opus-4-6-low[1m]` | Claude Opus 4.6 (Gemini 3.8 Flash) | **1M** | 64K | ✓ (2k budget) |
| `claude-opus-4-6-medium[1m]` | Claude Opus 4.6 (Gemini 3.8 Flash) | **1M** | 64K | ✓ (8k budget) |
| `claude-opus-4-6-high[1m]` | Claude Opus 4.6 (Gemini 3.8 Flash) | **1M** | 64K | ✓ (32k budget) |
| `claude-sonnet-4-5-thinking` | Claude | 200K | 16K | ✓ |
| `claude-opus-4-5-thinking` | Claude | 200K | 16K | ✓ |
| `claude-sonnet-4-5` | Claude | 200K | 8K | ✗ |
| `claude-3-7-sonnet-20250219` | Claude (External) | 200K | 16K+ | ✓ |
| `claude-3-5-sonnet-20241022` | Claude (External) | 200K | 16K+ | ✓ |
| `claude-3-opus-20240229` | Claude (External) | 200K | 16K+ | ✓ |
| `claude-3-5-haiku-20241022` | Claude (External) | 1M | 16K | ✓ |
| `claude-fake` / `claude-external` | Claude (External) | 200K | 16K+ | ✓ |
| `gemini-3-flash` | Gemini | 1M | 16K | ✓ |
| `gemini-3-pro-high` | Gemini | 1M | 16K | ✓ |
| `gemini-3-pro-low` | Gemini | 1M | 16K | ✓ |
| `gemini-3-pro-image` | Gemini | 1M | 16K | ✓ |
| `gemini-2.5-pro` | Gemini | 1M | 16K | ✓ |
| `gemini-2.5-flash` | Gemini | 1M | 16K | ✓ |
| `gemini-2.5-flash-thinking` | Gemini | 1M | 16K | ✓ |
| `gemini-2.5-flash-lite` | Gemini | 1M | 8K | ✗ |

---

### Claude & Gemini Reasoning Tiers (Thinking / Effort Levels)

The gateway supports extended thinking / reasoning effort across Claude and Gemini models, allowing you to control the depth of thought, token usage, and response latency.

| Effort Level | Thinking Budget | Best For | Typical Use Cases |
| :--- | :--- | :--- | :--- |
| **`low`** | ~2,048 – 5,000 tokens | Fast responses, low latency, quota savings | Quick bug fixes, straightforward queries, script adjustments |
| **`medium`** | ~8,192 – 10,000 tokens | Balanced speed & depth (Recommended) | Daily coding, unit tests, moderate refactoring, feature implementation |
| **`high`** | ~20,000 – 32,000 tokens | Deep multi-step reasoning | Complex architectures, tough concurrency bugs, algorithmic challenges |
| **`max`** | ~64,000 tokens | Maximum reasoning capacity | Exhaustive verification, complex system redesigns |

#### 3 Ways to Configure Reasoning Effort:

1. **Directly via Model Name** (Easiest for Cursor, Continue, Roo Code, etc.):
   - `claude-opus-4-6-low` (Fast reasoning)
   - `claude-opus-4-6-medium` (Balanced reasoning)
   - `claude-opus-4-6-high` (Deep reasoning)
   - `claude-opus-4-6-thinking` (Standard thinking)

2. **Via Anthropic API / Claude Code CLI / Cline** (`thinking` object or `effort` param):
   ```json
   {
     "model": "claude-sonnet-4-5-thinking",
     "thinking": {
       "type": "enabled",
       "budget_tokens": 8192
     }
   }
   ```
   Or pass `"effort": "medium"` (supports `"low"`, `"medium"`, `"high"`, `"max"`).

3. **Via OpenAI Compatible API** (`reasoning_effort` param):
   ```json
   {
     "model": "claude-opus-4-6-thinking",
     "reasoning_effort": "medium"
   }
   ```

> **Note**: External Claude models (e.g. `claude-3-7-sonnet-20250219`, `claude-fake`, `claude-external`) are seamlessly translated to Antigravity's backend models while returning the requested model ID to the client. Extended thinking (`budget_tokens`) is fully supported.
> Run `curl http://localhost:8080/v1/models` to see all available models.

---

## AI Coding Tools Configuration

### Cursor

Settings → Models → Add Model:
```
Provider: OpenAI Compatible
Base URL: http://localhost:8080/v1
API Key: any-value
Model: gemini-3-flash
```

### Continue.dev

Edit `~/.continue/config.json`:
```json
{
  "models": [{
    "title": "Antigravity Gateway",
    "provider": "openai",
    "model": "gemini-3-flash",
    "apiBase": "http://localhost:8080/v1",
    "apiKey": "any-value"
  }]
}
```

### Cline (VS Code)

Settings → Cline → API Provider:
```
Provider: OpenAI Compatible
Base URL: http://localhost:8080/v1
API Key: any-value
Model ID: claude-sonnet-4-5-thinking
```

### Roo Code

Settings → Custom API:
```
API Endpoint: http://localhost:8080/v1/chat/completions
API Key: any-value
Model: gemini-3-flash
```

### Kilo Code

Settings → Provider → OpenAI Compatible:
```
Base URL: http://localhost:8080/v1
API Key: any-value
Model: claude-sonnet-4-5-thinking
```

### TRAE

Configure in settings:
```
Provider: OpenAI
Base URL: http://localhost:8080/v1
API Key: any-value
```

### OpenCode

Edit `~/.opencode/config.json`:
```json
{
  "provider": {
    "type": "openai",
    "baseUrl": "http://localhost:8080/v1",
    "apiKey": "any-value",
    "model": "gemini-3-flash"
  }
}
```

### Goose

Edit `~/.config/goose/config.yaml`:
```yaml
provider: openai
model: gemini-3-flash
api_base: http://localhost:8080/v1
api_key: any-value
```

### Aider

```bash
aider --openai-api-base http://localhost:8080/v1 \
      --openai-api-key any-value \
      --model openai/gemini-3-flash
```

Or set environment variables:
```bash
export OPENAI_API_BASE=http://localhost:8080/v1
export OPENAI_API_KEY=any-value
aider --model openai/gemini-3-flash
```

### Cody (Sourcegraph)

Settings → Cody → Enterprise:
```
Server Endpoint: http://localhost:8080
Access Token: any-value
```

### Claude Code CLI

Antigravity Gateway includes native support for Claude Code CLI with automatic model mapping, external fake model aliases, preflight token counting (`/v1/messages/count_tokens`), and extended thinking support (`thinking.budget_tokens`).

Configure `~/.claude/settings.json`:
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:8080",
    "ANTHROPIC_API_KEY": "any-value",
    "ANTHROPIC_MODEL": "claude-3-7-sonnet-20250219"
  }
}
```

Or use a fake external model alias:
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:8080",
    "ANTHROPIC_API_KEY": "any-value",
    "ANTHROPIC_MODEL": "claude-external"
  }
}
```

Then run: `claude`

Claude Code will automatically:
- Connect to your local gateway.
- Check available models and preflight token counts seamlessly.
- Benefit from extended thinking (`thinking: { type: "enabled", budget_tokens: ... }`) with automatic token buffer expansion.
- Receive responses with its requested model name preserved.

### Gemini CLI

```bash
export GEMINI_API_BASE=http://localhost:8080/v1
export GEMINI_API_KEY=any-value
gemini chat
```

### Cherry Studio

Settings → API Configuration:
```
Provider: OpenAI Compatible
API URL: http://localhost:8080/v1
API Key: any-value
Model: gemini-3-flash
```

### Factory Droid

Configure provider:
```
Type: OpenAI
Base URL: http://localhost:8080/v1
API Key: any-value
```

### Crush

Settings → AI Provider:
```
Provider: OpenAI Compatible
Endpoint: http://localhost:8080/v1
Key: any-value
```

---

## SDK Integration

### OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="any-value"
)

# Chat Completions API
response = client.chat.completions.create(
    model="gemini-3-flash",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)

# Responses API
response = client.responses.create(
    model="gemini-3-flash",
    input="Tell me a joke about programming."
)
print(response.output[0].content[0].text)
```

### OpenAI JavaScript SDK

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:8080/v1',
  apiKey: 'any-value'
});

const response = await client.chat.completions.create({
  model: 'gemini-3-flash',
  messages: [{ role: 'user', content: 'Hello!' }]
});
console.log(response.choices[0].message.content);
```

### Anthropic Python SDK

```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:8080",
    api_key="any-value"
)

message = client.messages.create(
    model="claude-sonnet-4-5-thinking",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(message.content[0].text)
```

### cURL

```bash
# OpenAI Chat Completions format
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-value" \
  -d '{
    "model": "gemini-3-flash",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# OpenAI Responses API format
curl http://localhost:8080/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-value" \
  -d '{
    "model": "gemini-3-flash",
    "input": "Tell me a three sentence bedtime story about a unicorn."
  }'

# OpenAI Responses API with streaming
curl http://localhost:8080/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-value" \
  -d '{
    "model": "gemini-3-flash",
    "input": "Write a haiku about coding.",
    "stream": true
  }'

# Anthropic format
curl http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: any-value" \
  -d '{
    "model": "claude-sonnet-4-5-thinking",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## LiteLLM Integration

Create `litellm-config.yaml`:

```yaml
model_list:
  - model_name: claude-sonnet-4-5-thinking
    model_info:
      mode: chat
      supports_vision: true
      supports_function_calling: true
      max_input_tokens: 200000
      max_output_tokens: 16000
    litellm_params:
      model: openai/claude-sonnet-4-5-thinking
      api_base: http://antigravity-gateway:8080/v1
      api_key: "not-needed"
      stream: true

  - model_name: gemini-3-flash
    model_info:
      mode: chat
      supports_vision: true
      supports_function_calling: true
      max_input_tokens: 1048576
      max_output_tokens: 16384
    litellm_params:
      model: openai/gemini-3-flash
      api_base: http://antigravity-gateway:8080/v1
      api_key: "not-needed"
      stream: true
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | OpenAI Chat Completions API |
| `/v1/responses` | POST | OpenAI Responses API |
| `/v1/messages` | POST | Anthropic Messages API |
| `/v1/models` | GET | List available models |
| `/health` | GET | Health check |
| `/account-limits` | GET | Account quotas (add `?format=table`) |
| `/refresh-token` | POST | Force token refresh |

---

## Multi-Account Load Balancing

Add multiple Google accounts for higher throughput and automatic failover:

```bash
agw accounts add  # Add first account
agw accounts add  # Add second account
agw accounts add  # Add third account
```

The gateway automatically:
- Uses sticky account selection for prompt cache efficiency
- Switches accounts when rate limited
- Waits for short rate limits (≤2 min)
- Falls back to alternate models when all accounts exhausted

Check account status:
```bash
curl "http://localhost:8080/account-limits?format=table"
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `DEBUG` | `false` | Enable debug logging |
| `FALLBACK` | `false` | Enable model fallback on quota exhaustion |

---

## Migration from v1.x

If upgrading from `antigravity-claude-proxy`:

1. **Config path changed**: `~/.config/antigravity-proxy` → `~/.config/antigravity-gateway`
2. **Package name changed**: `antigravity-claude-proxy` → `antigravity-gateway`
3. **Docker image changed**: `ghcr.io/johnneerdael/antigravity-claude-proxy` → `ghcr.io/johnneerdael/antigravity-gateway`
4. **New CLI alias**: `agw` (short for `antigravity-gateway`)

Copy your existing accounts:
```bash
cp -r ~/.config/antigravity-proxy/* ~/.config/antigravity-gateway/
```

---

## Troubleshooting

### "No accounts available"

Add Google accounts: `agw accounts add`

### Rate limited

- Add more accounts for load balancing
- Enable fallback mode: `agw start --fallback`
- Wait for quota reset (shown in error message)

### Connection refused

Ensure the gateway is running: `agw start`

### Model not found

Use exact model IDs from `/v1/models` endpoint. Common models:
- `gemini-3-flash` (recommended for speed)
- `claude-sonnet-4-5-thinking` (recommended for quality)

---

## License

MIT License - see [LICENSE](LICENSE)

## Credits

Based on work from:
- [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth)
- [badri-s2001/antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy)
