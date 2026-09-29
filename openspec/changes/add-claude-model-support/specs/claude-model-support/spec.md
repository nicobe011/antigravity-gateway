## ADDED Requirements

### Requirement: Claude Model Mapping
The gateway SHALL map incoming external Claude model names (including standard Anthropic model IDs and fake external model aliases) to valid Antigravity Cloud Code backend models.

#### Scenario: Request with standard Claude 3.7 Sonnet ID
- **WHEN** client sends a request to `/v1/messages` with `model: "claude-3-7-sonnet-20250219"`
- **THEN** gateway resolves the model to `claude-sonnet-4-5-thinking` for Google Cloud Code API execution

#### Scenario: Request with fake external model alias
- **WHEN** client sends a request with `model: "claude-fake"` or `model: "claude-external"`
- **THEN** gateway resolves the model to `claude-sonnet-4-5-thinking`

### Requirement: Extended Thinking on External Models
The gateway SHALL support extended thinking on external Claude models by honoring `thinking.budget_tokens`, enabling thinking config on backend requests, and ensuring `maxOutputTokens` exceeds `thinking_budget`.

#### Scenario: Request with increased thinking budget
- **WHEN** client sends a request for an external Claude model with `thinking: { type: "enabled", budget_tokens: 16000 }`
- **THEN** gateway configures `thinking_budget: 16000` and adjusts `maxOutputTokens` to at least 24192 for the Cloud Code request

#### Scenario: External model mapped to thinking backend without explicit budget
- **WHEN** client sends a request for `claude-3-7-sonnet-20250219` mapped to `claude-sonnet-4-5-thinking`
- **THEN** gateway enables `include_thoughts: true` and includes the `anthropic-beta: interleaved-thinking-2025-05-14` header

### Requirement: Model Name Preservation in Responses
The gateway SHALL return the original model name requested by the client in all message responses and streaming events.

#### Scenario: Non-streaming response preserves requested model
- **WHEN** client requests model `claude-3-7-sonnet-20250219` without streaming
- **THEN** response JSON contains `model: "claude-3-7-sonnet-20250219"`

#### Scenario: Streaming response preserves requested model
- **WHEN** client requests model `claude-3-7-sonnet-20250219` with streaming
- **THEN** the initial SSE `message_start` event contains `model: "claude-3-7-sonnet-20250219"`

### Requirement: External Model Discovery
The gateway SHALL include external fake Claude models in the list of available models returned by `GET /v1/models` and `GET /models`.

#### Scenario: Client queries available models
- **WHEN** client makes a `GET` request to `/v1/models`
- **THEN** response list includes Claude models such as `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-20241022`, and external aliases with `owned_by: "anthropic"`

### Requirement: Token Counting Support
The gateway SHALL implement the Anthropic token counting endpoint to support preflight token calculations from Claude clients.

#### Scenario: Client requests token count
- **WHEN** client sends a `POST` request to `/v1/messages/count_tokens` or `/messages/count_tokens`
- **THEN** gateway returns status 200 with `{ "input_tokens": <integer> }`
