/**
 * Model Mapper for Antigravity Gateway
 *
 * Provides translation between external / standard Claude models
 * and Antigravity Cloud Code backend models.
 * Supports fake external Claude models and extended thinking configurations.
 */

import { isThinkingModel, GEMINI_CONTEXT_WINDOW_TOKENS, OPENCODE_ZEN_FREE_MODELS } from './constants.js';

/**
 * Standard mapping dictionary from external/client model names
 * to Antigravity Cloud Code backend models.
 * Strictly maps claude-opus-4-6-low, medium, and high to gemini-3.8-flash-tiered.
 */
export const MODEL_MAP = {
    'claude-opus-4-6-low': 'gemini-3.8-flash-tiered',
    'claude-opus-4-6-medium': 'gemini-3.8-flash-tiered',
    'claude-opus-4-6-high': 'gemini-3.8-flash-tiered',
    'claude-opus-4-6-low[1m]': 'gemini-3.8-flash-tiered',
    'claude-opus-4-6-medium[1m]': 'gemini-3.8-flash-tiered',
    'claude-opus-4-6-high[1m]': 'gemini-3.8-flash-tiered',

    // OpenCode Zen Free Models aliases
    'claude-nemotron-lightning': 'opencode/nemotron-3.5-lightning-free',
    'claude-muse-spark': 'opencode/muse-spark-1.3-contributor-free',
    'claude-ling-flash': 'opencode/ling-3.0-flash-fin-free',
    'claude-longcat-preview': 'opencode/longcat-2.5-preview-free',
    'claude-space-bunny': 'opencode/space-bunny-free',
    'claude-mimo-flash': 'opencode/mimo-v2.6-flash-free',
    'claude-nemotron-ultra': 'opencode/nemotron-3-ultra-free',
    'claude-big-pickle': 'opencode/big-pickle'
};

/**
 * List of external Claude models advertised via GET /v1/models
 * Includes the 3 Opus 4.6 tiers with 1M context window and OpenCode Zen free models
 */
export const EXTERNAL_CLAUDE_MODELS = [
    {
        id: 'claude-opus-4-6-low[1m]',
        displayName: 'Claude Opus 4.6 Low (Gemini 3.8 Flash Thinking 2k) 1M',
        backendModel: 'gemini-3.8-flash-tiered',
        contextWindow: 1000000
    },
    {
        id: 'claude-opus-4-6-medium[1m]',
        displayName: 'Claude Opus 4.6 Medium (Gemini 3.8 Flash Thinking 8k) 1M',
        backendModel: 'gemini-3.8-flash-tiered',
        contextWindow: 1000000
    },
    {
        id: 'claude-opus-4-6-high[1m]',
        displayName: 'Claude Opus 4.6 High (Gemini 3.8 Flash Thinking 32k) 1M',
        backendModel: 'gemini-3.8-flash-tiered',
        contextWindow: 1000000
    }
];

/**
 * Parse optional custom model mappings from environment variable MODEL_MAPPINGS (JSON)
 */
function getCustomMappings() {
    if (!process.env.MODEL_MAPPINGS) return {};
    try {
        return JSON.parse(process.env.MODEL_MAPPINGS);
    } catch {
        return {};
    }
}

/**
 * Resolve an incoming model name to the appropriate backend model for Cloud Code.
 *
 * @param {string} requestedModel - The model requested by the client
 * @returns {string} The resolved Antigravity Cloud Code backend model ID
 */
export function resolveBackendModel(requestedModel) {
    if (!requestedModel || typeof requestedModel !== 'string') {
        return 'gemini-3.8-flash-tiered';
    }

    let trimmed = requestedModel.trim();
    // Normalize client suffix indicators like [1m] or :1m
    trimmed = trimmed.replace(/\[1m\]/gi, '').replace(/:1m/gi, '').trim();

    // 1. Check custom user mappings
    const custom = getCustomMappings();
    if (custom[trimmed]) return custom[trimmed];

    // 2. Exact match in default MODEL_MAP
    if (MODEL_MAP[trimmed]) return MODEL_MAP[trimmed];

    // 3. Case-insensitive match in MODEL_MAP
    const lower = trimmed.toLowerCase();
    for (const [key, val] of Object.entries(MODEL_MAP)) {
        if (key.toLowerCase() === lower) return val;
    }

    // 4. Default fallback: all Claude/external models route to gemini-3.8-flash-tiered
    return 'gemini-3.8-flash-tiered';
}

/**
 * Check if a model name is considered an external/fake Claude model.
 *
 * @param {string} modelName - The model name to test
 * @returns {boolean} True if it is an external/alias Claude model
 */
export function isExternalClaudeModel(modelName) {
    if (!modelName || typeof modelName !== 'string') return false;
    const lower = modelName.toLowerCase();
    if (MODEL_MAP[modelName] !== undefined) return true;
    for (const key of Object.keys(MODEL_MAP)) {
        if (key.toLowerCase() === lower) return true;
    }
    return lower.includes('fake') || lower.includes('external') || lower.startsWith('claude-3');
}

/**
 * Check if thinking is supported or requested for the model.
 * Takes into account both the requested model, the resolved backend model,
 * and the explicit `thinking` parameter in the request.
 *
 * @param {string} requestedModel - The model requested by the client
 * @param {string} backendModel - The resolved backend model
 * @param {Object} [thinkingConfig] - The thinking config object from the request
 * @returns {boolean} True if thinking should be enabled
 */
export function isThinkingModelResolved(requestedModel, backendModel, thinkingConfig) {
    // If client explicitly disabled thinking
    if (thinkingConfig && (thinkingConfig.type === 'disabled' || thinkingConfig.budget_tokens === 0)) {
        return false;
    }

    // If client explicitly enabled thinking or provided a budget or effort
    if (thinkingConfig && (thinkingConfig.type === 'enabled' || thinkingConfig.type === 'adaptive' || thinkingConfig.budget_tokens > 0 || thinkingConfig.effort)) {
        return true;
    }

    // If backend model supports thinking
    if (isThinkingModel(backendModel)) {
        return true;
    }

    // If requested model is a thinking model
    if (isThinkingModel(requestedModel)) {
        return true;
    }

    // Claude 3.7 and Opus support thinking by default
    const lowerReq = (requestedModel || '').toLowerCase();
    if (lowerReq.includes('claude-3-7') || lowerReq.includes('claude-3.7') || lowerReq.includes('opus')) {
        return true;
    }

    return false;
}

/**
 * Get list of external Claude models formatted for /v1/models response
 *
 * @returns {Array<Object>} Models formatted for Anthropic/OpenAI compatibility
 */
export function getExternalClaudeModels() {
    const now = Math.floor(Date.now() / 1000);
    const nowIso = new Date().toISOString();
    const models = [...EXTERNAL_CLAUDE_MODELS];

    if (process.env.ADDITIONAL_MODELS) {
        try {
            const extra = process.env.ADDITIONAL_MODELS.startsWith('[')
                ? JSON.parse(process.env.ADDITIONAL_MODELS)
                : process.env.ADDITIONAL_MODELS.split(',').map(s => s.trim()).filter(Boolean);

            for (const item of extra) {
                const id = typeof item === 'string' ? item : item.id;
                const displayName = typeof item === 'object' && item.displayName ? item.displayName : id;
                const backendModel = typeof item === 'object' && item.backendModel ? item.backendModel : resolveBackendModel(id);
                if (id && !models.some(m => m.id === id)) {
                    models.push({ id, displayName, backendModel });
                }
            }
        } catch {
            // ignore parsing errors
        }
    }

    const list = models.map(m => ({
        id: m.id,
        type: 'model',
        object: 'model',
        display_name: m.displayName,
        created_at: nowIso,
        created: now,
        owned_by: 'anthropic',
        description: m.displayName,
        max_input_tokens: m.contextWindow || GEMINI_CONTEXT_WINDOW_TOKENS,
        max_tokens: 65536
    }));

    // Append OpenCode Zen free models as Claude-compatible options
    for (const zenModel of OPENCODE_ZEN_FREE_MODELS) {
        list.push({
            id: zenModel.id,
            type: 'model',
            object: 'model',
            display_name: `${zenModel.displayName} (OpenCode Zen)`,
            created_at: nowIso,
            created: now,
            owned_by: 'opencode',
            description: `${zenModel.displayName} - Modelo Gratuito do OpenCode Zen`,
            max_input_tokens: zenModel.contextWindow || 262144,
            max_tokens: zenModel.maxTokens || 32768
        });
    }

    return list;
}

/**
 * Estimate token count for an Anthropic Messages request
 * Used by POST /v1/messages/count_tokens
 *
 * @param {Object} request - Request containing model, messages, system, tools
 * @returns {number} Estimated token count
 */
export function estimateTokenCount(request) {
    let charCount = 0;

    // 1. System prompt
    if (request.system) {
        if (typeof request.system === 'string') {
            charCount += request.system.length;
        } else if (Array.isArray(request.system)) {
            for (const block of request.system) {
                if (block.text) charCount += block.text.length;
            }
        }
    }

    // 2. Messages
    if (Array.isArray(request.messages)) {
        for (const msg of request.messages) {
            charCount += 16; // message envelope overhead
            if (typeof msg.content === 'string') {
                charCount += msg.content.length;
            } else if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                    if (block.text) charCount += block.text.length;
                    if (block.thinking) charCount += block.thinking.length;
                    if (block.input) charCount += JSON.stringify(block.input).length;
                    if (block.content) {
                        if (typeof block.content === 'string') {
                            charCount += block.content.length;
                        } else {
                            charCount += JSON.stringify(block.content).length;
                        }
                    }
                    if (block.type === 'image') charCount += 1600; // estimated tokens for image
                }
            }
        }
    }

    // 3. Tools
    if (Array.isArray(request.tools)) {
        for (const tool of request.tools) {
            charCount += (tool.name || '').length;
            charCount += (tool.description || '').length;
            if (tool.input_schema) {
                charCount += JSON.stringify(tool.input_schema).length;
            }
            charCount += 32; // tool envelope overhead
        }
    }

    // Anthropic / GPT standard ratio: ~3.8 chars per token
    const estimatedTokens = Math.max(1, Math.ceil(charCount / 3.8));
    return estimatedTokens;
}

export default {
    MODEL_MAP,
    EXTERNAL_CLAUDE_MODELS,
    resolveBackendModel,
    isExternalClaudeModel,
    isThinkingModelResolved,
    getExternalClaudeModels,
    estimateTokenCount
};
