/**
 * OpenCode Zen Official Client for Antigravity Gateway
 *
 * Interacts with OpenCode Zen API (https://opencode.ai/zen/v1)
 * Provides chat completions streaming and non-streaming in OpenAI/Anthropic compatible format.
 * Supports official free models:
 * - Nemotron 3.5 Lightning Free
 * - Muse Spark 1.3 Free
 * - Ling 3.0 Flash Fin Free
 * - LongCat 2.5 Preview Free
 * - Space Bunny Free
 * - MiMo-V2.6-Flash Free
 * - Nemotron 3 Ultra Free
 * - Big Pickle
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { OPENCODE_ZEN_API_BASE, OPENCODE_ZEN_CONFIG_PATH, OPENCODE_ZEN_FREE_MODELS } from '../constants.js';
import { logger } from '../utils/logger.js';

let cachedApiKey = null;
let activeOpenCodeZenModelId = null; // When set, defaults requests to this chosen model
let activeOpenCodeZenReasoning = null; // 'auto', 'disabled', or specific effort (e.g. 'high', 'medium', 'low')

/**
 * Set the user-selected active model and reasoning preference for OpenCode Zen
 *
 * @param {string|null} modelId - Chosen model ID or null for default
 * @param {string|null} reasoning - 'auto', 'disabled', or specific effort
 */
export function setActiveOpenCodeZenConfig(modelId = null, reasoning = null) {
    if (modelId) {
        activeOpenCodeZenModelId = resolveOpenCodeZenModel(modelId);
    } else {
        activeOpenCodeZenModelId = null;
    }
    activeOpenCodeZenReasoning = reasoning;
}

/**
 * Get the current active OpenCode Zen model ID and reasoning preference
 *
 * @returns {{modelId: string, reasoning: string|null}}
 */
export function getActiveOpenCodeZenConfig() {
    return {
        modelId: activeOpenCodeZenModelId || 'opencode/nemotron-3.5-lightning-free',
        reasoning: activeOpenCodeZenReasoning
    };
}

/**
 * Load OpenCode Zen API key from config file or environment
 *
 * @returns {Promise<string|null>} The API key or null
 */
export async function getOpenCodeZenApiKey() {
    if (process.env.OPENCODE_ZEN_API_KEY) {
        return process.env.OPENCODE_ZEN_API_KEY.trim();
    }

    if (cachedApiKey) {
        return cachedApiKey;
    }

    try {
        if (existsSync(OPENCODE_ZEN_CONFIG_PATH)) {
            const raw = await readFile(OPENCODE_ZEN_CONFIG_PATH, 'utf-8');
            const data = JSON.parse(raw);
            if (data?.apiKey) {
                cachedApiKey = data.apiKey.trim();
                return cachedApiKey;
            }
        }
    } catch (err) {
        logger.warn(`[OpenCodeZen] Could not read config file: ${err.message}`);
    }

    return null;
}

/**
 * Save OpenCode Zen API key to persistent config
 *
 * @param {string} apiKey - API key to save
 * @returns {Promise<void>}
 */
export async function saveOpenCodeZenApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('API key inválida fornecida');
    }

    const trimmed = apiKey.trim();
    cachedApiKey = trimmed;

    const dir = dirname(OPENCODE_ZEN_CONFIG_PATH);
    await mkdir(dir, { recursive: true });

    const payload = {
        apiKey: trimmed,
        updatedAt: new Date().toISOString()
    };

    await writeFile(OPENCODE_ZEN_CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    logger.success(`[OpenCodeZen] Chave de API salva com sucesso em: ${OPENCODE_ZEN_CONFIG_PATH}`);
}

/**
 * Check whether a model ID is an OpenCode Zen model
 *
 * @param {string} modelId - Model ID to test
 * @returns {boolean} True if model belongs to OpenCode Zen
 */
export function isOpenCodeZenModel(modelId) {
    if (!modelId || typeof modelId !== 'string') return false;
    const lower = modelId.toLowerCase();
    if (lower.startsWith('opencode/')) return true;
    return OPENCODE_ZEN_FREE_MODELS.some(m => m.id === modelId || m.id.replace('opencode/', '') === modelId);
}

/**
 * Resolve external model name to canonical OpenCode Zen model ID
 *
 * @param {string} modelName - Incoming model name
 * @returns {string} Canonical OpenCode Zen model ID
 */
export function resolveOpenCodeZenModel(modelName) {
    if (!modelName || typeof modelName !== 'string') {
        return 'opencode/nemotron-3.5-lightning-free';
    }

    const lower = modelName.trim().toLowerCase();
    const clean = lower.replace(/\[1m\]/gi, '').replace(/:1m/gi, '').trim();

    for (const m of OPENCODE_ZEN_FREE_MODELS) {
        if (m.id === clean || m.id.replace('opencode/', '') === clean) {
            return m.id;
        }
        if (clean.includes(m.family)) {
            return m.id;
        }
    }

    return 'opencode/nemotron-3.5-lightning-free';
}

/**
 * Get model metadata for an OpenCode Zen model
 *
 * @param {string} modelId - Model ID
 * @returns {Object|null} Model metadata
 */
export function getOpenCodeZenModelMetadata(modelId) {
    const canonical = resolveOpenCodeZenModel(modelId);
    return OPENCODE_ZEN_FREE_MODELS.find(m => m.id === canonical) || OPENCODE_ZEN_FREE_MODELS[0];
}

/**
 * Call OpenCode Zen Chat Completions API (Non-Streaming)
 *
 * @param {Object} openAiPayload - Standard OpenAI format payload
 * @returns {Promise<Object>} OpenAI format response
 */
export async function sendOpenCodeZenMessage(openAiPayload) {
    const apiKey = await getOpenCodeZenApiKey();
    if (!apiKey) {
        throw new Error('Chave de API do OpenCode Zen não configurada. Execute "npm run opencode:auth" ou configure OPENCODE_ZEN_API_KEY.');
    }

    const url = `${OPENCODE_ZEN_API_BASE}/chat/completions`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'antigravity-gateway/2.0.0'
        },
        body: JSON.stringify(openAiPayload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenCode Zen API error (${response.status}): ${errorText}`);
    }

    return await response.json();
}

/**
 * Call OpenCode Zen Chat Completions API with Streaming
 *
 * @param {Object} openAiPayload - Standard OpenAI format payload
 * @yields {Object} Streamed chunks
 */
export async function* sendOpenCodeZenStream(openAiPayload) {
    const apiKey = await getOpenCodeZenApiKey();
    if (!apiKey) {
        throw new Error('Chave de API do OpenCode Zen não configurada. Execute "npm run opencode:auth" ou configure OPENCODE_ZEN_API_KEY.');
    }

    const url = `${OPENCODE_ZEN_API_BASE}/chat/completions`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'antigravity-gateway/2.0.0'
        },
        body: JSON.stringify({ ...openAiPayload, stream: true })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenCode Zen Stream error (${response.status}): ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;

            try {
                const chunk = JSON.parse(dataStr);
                yield chunk;
            } catch (err) {
                // Ignore parse errors on partial chunks
            }
        }
    }
}

export default {
    getOpenCodeZenApiKey,
    saveOpenCodeZenApiKey,
    isOpenCodeZenModel,
    resolveOpenCodeZenModel,
    getOpenCodeZenModelMetadata,
    sendOpenCodeZenMessage,
    sendOpenCodeZenStream
};
