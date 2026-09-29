## 1. Model Mapping & Extended Thinking Module
- [x] 1.1 Create `src/model-mapper.js` with model aliases, mapping dictionary, and thinking resolution
- [x] 1.2 Export helper functions: `resolveBackendModel(modelName)`, `isExternalClaudeModel(modelName)`, `getExternalClaudeModels()`, `isThinkingModelResolved(requestedModel, backendModel, thinkingConfig)`

## 2. Model Listing Integration
- [x] 2.1 Update `src/cloudcode/model-api.js` to include external fake Claude models in `listModels()`
- [x] 2.2 Expose `/models` alias alongside `/v1/models` in `src/server.js`

## 3. Request Translation, Extended Thinking, and Response Preservation
- [x] 3.1 Update `src/server.js` to resolve incoming model IDs to backend models while preserving requested model ID
- [x] 3.2 Update `src/format/request-converter.js` and `src/cloudcode/request-builder.js` to honor thinking budget and adjust max_tokens for external Claude models
- [x] 3.3 Update `src/cloudcode/message-handler.js` and `src/cloudcode/streaming-handler.js` to route using resolved model and return requested model
- [x] 3.4 Ensure interleaved thinking headers apply for thinking models regardless of model name format

## 4. Token Counting Endpoint
- [x] 4.1 Implement token estimation utility for Anthropic Messages requests
- [x] 4.2 Replace 501 handler in `src/server.js` with active `POST /v1/messages/count_tokens` (and `/messages/count_tokens`) endpoint

## 5. Verification & Documentation
- [x] 5.1 Add unit/integration tests for model resolution, extended thinking budgets, and token counting
- [x] 5.2 Update `README.md` and `CLAUDE.md` with Claude Code CLI configuration, extended thinking instructions, and external fake models guide
