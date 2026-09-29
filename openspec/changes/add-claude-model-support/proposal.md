# Change: Add Claude Model Support with Fake External Model Mapping and Extended Thinking

## Why
Antigravity Gateway acts as an Anthropic-compatible and OpenAI-compatible proxy to Google Cloud Code. However, tools like the official Claude Code CLI (`claude`), Claude Desktop, and various Anthropic SDK clients send requests using standard Anthropic model identifiers (e.g. `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`, `claude-3-5-haiku-20241022`) or expect external fake model aliases. Currently, the gateway sends requested model names directly to Google Cloud Code, which rejects them because Cloud Code only recognizes its own internal identifiers (`claude-sonnet-4-5-thinking`, `claude-opus-4-5-thinking`, etc.).

Furthermore, clients like Claude Code utilize extended thinking (increasing or adjusting `thinking.budget_tokens`), but the gateway currently only activates thinking if the string literal "thinking" is inside the model name. Because standard/external Claude model names do not contain "thinking", thinking configuration is stripped, headers are omitted, and thinking tokens fail to generate. Additionally, Claude Code CLI requires `/v1/messages/count_tokens`, which currently returns 501 Not Implemented.

## What Changes
- Add a model aliasing and mapping module (`src/model-mapper.js`) to translate external/fake Claude model IDs to Antigravity Cloud Code backend models.
- Support standard Anthropic model names (`claude-3-7-sonnet*`, `claude-3-5-sonnet*`, `claude-3-opus*`, `claude-3-5-haiku*`) and custom external aliases (`claude-fake`, `claude-external`, `claude-sonnet-external`).
- Support Extended Thinking on external Claude models:
  - If the resolved backend model supports thinking (or if the request includes `thinking`), treat the external model as a thinking model.
  - Dynamically support increasing thinking budget (`thinking.budget_tokens`) and ensure `maxOutputTokens` is automatically bumped above `thinking_budget` so Google Cloud Code never rejects large thinking budgets.
  - Ensure `anthropic-beta: interleaved-thinking-2025-05-14` header is attached for external Claude thinking requests.
- Preserve the requested model name in response payloads (both non-streaming JSON and streaming SSE `message_start`), allowing Claude clients to see their own model name in the response.
- Expose external fake Claude models in `GET /v1/models` and `GET /models` so clients can discover and validate them.
- Implement token counting in `POST /v1/messages/count_tokens` (and `POST /messages/count_tokens`) to return `{ input_tokens: <count> }`.
- Provide route aliases `/messages`, `/models` alongside `/v1/messages`, `/v1/models` for broader client compatibility.

## Impact
- Affected specs: `claude-model-support`
- Affected code:
  - `src/model-mapper.js` (new module)
  - `src/constants.js`
  - `src/server.js`
  - `src/cloudcode/model-api.js`
  - `src/cloudcode/request-builder.js`
  - `src/cloudcode/message-handler.js`
  - `src/cloudcode/streaming-handler.js`
  - `src/format/request-converter.js`
