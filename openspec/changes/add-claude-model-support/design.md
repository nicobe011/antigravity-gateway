# Design: Claude Model Support, Fake External Model Mapping, and Extended Thinking

## Context
Antigravity Gateway bridges AI tools to Google Antigravity Cloud Code. Cloud Code hosts custom Claude endpoints under non-standard model IDs like `claude-sonnet-4-5-thinking` and `claude-opus-4-5-thinking`. However, external clients—specifically Claude Code CLI, Claude Desktop, and SDK integrations—attempt to call official model names such as `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`, or expect external alias models. Sending these names directly to Cloud Code results in API errors (model not found).

Furthermore, users and clients can configure extended thinking (`thinking: { type: "enabled", budget_tokens: N }`) to increase thinking capacity. The gateway must recognize thinking requests and backend thinking capabilities on these external models, honor increased thinking budgets, and expand `maxOutputTokens` so Cloud Code never rejects large budgets.

## Goals / Non-Goals
- **Goals:**
  - Transparently map incoming model names (both standard Claude versions and custom fake/external aliases) to supported Cloud Code backend models.
  - Return the original requested model name in all API responses so the client sees its requested model.
  - Support Extended Thinking on external Claude models:
    - If the resolved backend model is a thinking model or if `thinking` is requested, enable thinking for Cloud Code.
    - Dynamically honor increased thinking budget (`thinking.budget_tokens`) and automatically adjust `maxOutputTokens` when necessary.
    - Attach `anthropic-beta: interleaved-thinking-2025-05-14` header for thinking models.
  - Expose external fake Claude models in `GET /v1/models` and `GET /models`.
  - Implement `/v1/messages/count_tokens` to support Claude Code CLI's token estimation.
- **Non-Goals:**
  - Running local LLM inference engines.
  - Changing Google OAuth authentication.

## Decisions

### 1. Model Resolver (`src/model-mapper.js`)
Introduce a centralized model resolver:
- Mapping dictionary:
  - `claude-3-7-sonnet*`, `claude-3-5-sonnet*`, `claude-3-sonnet*`, `claude-fake`, `claude-external`, `claude-sonnet-external` -> `claude-sonnet-4-5-thinking`
  - `claude-3-opus*`, `claude-opus-external` -> `claude-opus-4-5-thinking`
  - `claude-3-5-haiku*`, `claude-3-haiku*`, `claude-haiku-external` -> `gemini-3-flash` (or `claude-sonnet-4-5`)
  - Identity mapping for already supported backend models (`claude-sonnet-4-5-thinking`, `gemini-3-flash`, etc.).
- Helper functions:
  - `resolveBackendModel(requestedModel)`
  - `isExternalClaudeModel(modelName)`
  - `getExternalClaudeModels()`
  - `isThinkingModelResolved(requestedModel, backendModel, thinkingConfig)`: checks if either the requested model, the resolved backend model, or the explicit `thinking` config activates extended thinking.

### 2. Request & Response Lifecycle
- When a request enters `/v1/messages` (or `/v1/chat/completions`, etc.):
  - Record `originalModel = req.body.model`.
  - Resolve `backendModel = resolveBackendModel(originalModel)`.
  - Build Cloud Code request using `backendModel` and configure thinking with the requested budget.
  - In response generation (SSE streamer and non-streaming converter), set `response.model = originalModel`.
  - This guarantees Claude client sees its own requested external model name.

### 3. Extended Thinking Adjustment
- When `thinking.budget_tokens` is provided or increased:
  - Configure `thinking_budget` in Google Cloud Code generation config.
  - Ensure `maxOutputTokens >= thinking_budget + 8192` (or sufficient headroom) so Google Cloud Code's constraint `maxOutputTokens > thinking_budget` is satisfied.
  - Send request via streaming endpoint if thinking is active, since Cloud Code only delivers thinking blocks over streaming.

### 4. Token Counting Support
Implement `POST /v1/messages/count_tokens` and `POST /messages/count_tokens`:
- Compute input tokens using text length heuristic (~3.8 chars per token) plus message/tool structure overhead.
- Return `{ input_tokens: count }` with status 200.
