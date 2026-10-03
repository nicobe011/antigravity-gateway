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

import { randomBytes } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { OPENCODE_ZEN_API_BASE, OPENCODE_ZEN_CONFIG_PATH, OPENCODE_ZEN_FREE_MODELS } from '../constants.js';
import { logger } from '../utils/logger.js';

let cachedApiKey = null;
let activeOpenCodeZenModelId = null; // When set, defaults requests to this chosen model
let activeOpenCodeZenReasoning = null; // 'auto', 'disabled', or specific effort (e.g. 'high', 'medium', 'low')

// ---------------------------------------------------------------------------
// FreeTier gatekeeper bypass (desde 19/09/2026 o free tier exige fingerprint
// de cliente OpenCode oficial, senão 403 FreeTierError).
// Condições: stream:true + tools com shell/read + headers x-opencode-*.
// ---------------------------------------------------------------------------
const ZEN_CLIENT_VERSION = process.env.OPENCODE_ZEN_CLIENT_VERSION || '1.18.31';

function generateZenSessionId() {
    // Formato ^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$
    const hex12 = randomBytes(6).toString('hex');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let tail = '';
    const rb = randomBytes(14);
    for (let i = 0; i < 14; i++) tail += chars[rb[i] % chars.length];
    return `ses_${hex12}${tail}`;
}

/** Nomes reservados do gatekeeper — nunca devem vazar para o cliente. */
export const GATEKEEPER_TOOL_NAMES = ['shell', 'bash', 'read'];

let zenSessionId = null;
export function getZenSessionId() {
    if (!zenSessionId) zenSessionId = generateZenSessionId();
    return zenSessionId;
}

function zenHeaders(apiKey) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': `opencode/${ZEN_CLIENT_VERSION}`,
        'x-opencode-client': 'cli',
        'x-opencode-version': ZEN_CLIENT_VERSION,
        'x-session-id': getZenSessionId(),
        'x-opencode-session': getZenSessionId()
    };
}

/** Garante tools shell + read no payload (exigência do gatekeeper). */
function ensureZenGatekeeperTools(payload) {
    const tools = Array.isArray(payload.tools) ? [...payload.tools] : [];
    const names = new Set(tools.map(t => t.function?.name || t.name));
    if (!names.has('shell') && !names.has('bash')) {
        tools.push({
            type: 'function',
            function: {
                name: 'shell',
                description: 'Execute a shell command',
                parameters: { type: 'object', properties: { command: { type: 'string' } } }
            }
        });
    }
    if (!names.has('read')) {
        tools.push({
            type: 'function',
            function: {
                name: 'read',
                description: 'Read a file',
                parameters: { type: 'object', properties: { path: { type: 'string' } } }
            }
        });
    }
    return { ...payload, tools };
}

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
        modelId: activeOpenCodeZenModelId || 'opencode/mimo-v2.6-flash-free',
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
        return 'opencode/mimo-v2.6-flash-free';
    }

    const lower = modelName.trim().toLowerCase();
    const clean = lower.replace(/\[1m\]/gi, '').replace(/:1m/gi, '').trim();

    // Aliases de modelos renomeados/retirados no catálogo oficial
    if (clean.includes('mimo-v2.5') || clean.includes('mimo-v2.6')) {
        return 'opencode/mimo-v2.6-flash-free';
    }

    for (const m of OPENCODE_ZEN_FREE_MODELS) {
        if (m.id === clean || m.id.replace('opencode/', '') === clean) {
            return m.id;
        }
        if (clean.includes(m.family)) {
            return m.id;
        }
    }

    return 'opencode/mimo-v2.6-flash-free';
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
 * Modelos que usam o endpoint Responses (não Chat Completions), por doc oficial:
 * https://opencode.ai/docs/zen — Muse Spark 1.3 Contributor Free -> /v1/responses
 */
const ZEN_RESPONSES_MODELS = new Set([
    'muse-spark-1.3-contributor-free',
    'muse-spark-1.3',
]);

/** Remove prefixo opencode/ — a API direta usa o ID sem prefixo. */
export function toZenApiModelId(canonicalId) {
    if (!canonicalId || typeof canonicalId !== 'string') return canonicalId;
    return canonicalId.replace(/^opencode\//i, '');
}

/** Retorna o path do endpoint correto para o modelo. */
export function getZenEndpointForModel(canonicalId) {
    const bare = toZenApiModelId(canonicalId || '').toLowerCase();
    if (ZEN_RESPONSES_MODELS.has(bare)) return '/responses';
    return '/chat/completions';
}

/** Converte payload Chat Completions -> Responses API (para modelos /responses). */
function chatPayloadToResponsesPayload(chatPayload, apiModelId) {
    const input = (chatPayload.messages || []).map(m => {
        if (typeof m.content === 'string') return { role: m.role, content: m.content };
        if (Array.isArray(m.content)) {
            const text = m.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
            return { role: m.role, content: text || '' };
        }
        return { role: m.role, content: String(m.content ?? '') };
    });
    const out = { model: apiModelId, input, stream: !!chatPayload.stream };
    if (chatPayload.temperature !== undefined) out.temperature = chatPayload.temperature;
    if (chatPayload.top_p !== undefined) out.top_p = chatPayload.top_p;
    if (chatPayload.max_tokens !== undefined) out.max_output_tokens = chatPayload.max_tokens;
    if (Array.isArray(chatPayload.tools) && chatPayload.tools.length > 0) {
        out.tools = chatPayload.tools.map(t => ({
            type: 'function',
            name: t.function?.name,
            description: t.function?.description || '',
            parameters: t.function?.parameters || { type: 'object' }
        }));
    }
    return out;
}

/** Converte resposta Responses API -> formato Chat Completions (para o resto do pipeline). */
function responsesToChatResponse(resp, apiModelId) {
    const texts = [];
    const toolCalls = [];
    for (const item of resp.output || []) {
        if (item.type === 'message' && Array.isArray(item.content)) {
            for (const part of item.content) {
                if (part.type === 'output_text' && part.text) texts.push(part.text);
            }
        } else if (item.type === 'function_call') {
            toolCalls.push({
                id: item.call_id || item.id,
                type: 'function',
                function: { name: item.name, arguments: item.arguments || '{}' }
            });
        }
    }
    const msg = { role: 'assistant', content: texts.join('') };
    if (toolCalls.length > 0) msg.tool_calls = toolCalls;
    return {
        id: resp.id,
        object: 'chat.completion',
        model: apiModelId,
        choices: [{ index: 0, message: msg, finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop' }],
        usage: {
            prompt_tokens: resp.usage?.input_tokens || 0,
            completion_tokens: resp.usage?.output_tokens || 0,
            total_tokens: resp.usage?.total_tokens || 0
        }
    };
}

/** Normaliza um evento SSE do endpoint /responses para chunk estilo Chat Completions. */
function normalizeResponsesStreamEvent(ev) {
    if (!ev || typeof ev !== 'object') return null;
    const t = ev.type || '';
    if (t === 'response.output_text.delta') {
        const text = typeof ev.delta === 'string' ? ev.delta : (ev.delta?.text || '');
        if (!text) return null;
        return { choices: [{ delta: { content: text } }] };
    }
    if (t === 'response.function_call_arguments.delta') {
        const d = typeof ev.delta === 'string' ? ev.delta : (ev.delta?.arguments || ev.arguments || '');
        return { choices: [{ delta: { tool_calls: [{ function: { arguments: d } }] } }] };
    }
    return null; // ignora lifecycle events (created, in_progress, completed, etc.)
}

/**
 * Call OpenCode Zen (Non-Streaming para o chamador).
 * O gatekeeper do free tier exige stream:true, então SEMPRE pedimos stream
 * ao upstream e agregamos os chunks — o chamador recebe um objeto completo.
 *
 * @param {Object} openAiPayload - Standard OpenAI format payload
 * @returns {Promise<Object>} OpenAI format response
 */
export async function sendOpenCodeZenMessage(openAiPayload) {
    const apiKey = await getOpenCodeZenApiKey();
    if (!apiKey) {
        throw new Error('Chave de API do OpenCode Zen não configurada. Execute "npm run opencode:auth" ou configure OPENCODE_ZEN_API_KEY.');
    }

    const apiModelId = toZenApiModelId(openAiPayload.model);
    const endpoint = getZenEndpointForModel(openAiPayload.model);
    const url = `${OPENCODE_ZEN_API_BASE}${endpoint}`;
    const withTools = ensureZenGatekeeperTools({ ...openAiPayload, model: apiModelId });
    const body = endpoint === '/responses'
        ? chatPayloadToResponsesPayload({ ...withTools, stream: true }, apiModelId)
        : { ...withTools, stream: true };
    const response = await fetch(url, {
        method: 'POST',
        headers: zenHeaders(apiKey),
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenCode Zen API error (${response.status}): ${errorText}`);
    }

    // Agrega SSE (stream:true) em resposta completa Chat Completions
    const ctype = response.headers?.get?.('content-type') || '';
    if (!ctype.includes('text/event-stream')) {
        // Upstream retornou JSON direto (alguns modelos fazem isso)
        const data = await response.json();
        if (endpoint === '/responses' && data.output) {
            return responsesToChatResponse(data, apiModelId);
        }
        return data;
    }

    let text = '';
    let reasoning = '';
    const toolCallsMap = new Map();
    let finishReason = 'stop';
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for await (const chunk of readZenSse(response, endpoint)) {
        const choice = chunk.choices?.[0] || {};
        const delta = choice.delta || {};
        if (typeof delta.content === 'string') text += delta.content;
        if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content;
        if (Array.isArray(delta.tool_calls)) {
            for (let i = 0; i < delta.tool_calls.length; i++) {
                const tc = delta.tool_calls[i];
                const key = tc.index ?? i;
                const prev = toolCallsMap.get(key) || { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
                if (tc.id) prev.id = tc.id;
                if (tc.function?.name) prev.function.name = tc.function.name;
                if (tc.function?.arguments) prev.function.arguments += tc.function.arguments;
                toolCallsMap.set(key, prev);
            }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) {
            usage = {
                prompt_tokens: chunk.usage.prompt_tokens ?? usage.prompt_tokens,
                completion_tokens: chunk.usage.completion_tokens ?? usage.completion_tokens,
                total_tokens: chunk.usage.total_tokens ?? usage.total_tokens
            };
        }
    }

    // Filtra tool calls dummy do gatekeeper (shell/read) se o modelo as ecoou sem necessidade
    let toolCalls = [...toolCallsMap.values()];
    const onlyDummy = toolCalls.length > 0 && toolCalls.every(tc => ['shell', 'bash', 'read'].includes(tc.function?.name));
    if (onlyDummy && !text.trim()) {
        // Modelo só ecoou dummies sem texto: trata como texto vazio, sem tool_use
        toolCalls = [];
    } else if (onlyDummy) {
        toolCalls = [];
    }
    if (toolCalls.length > 0) finishReason = 'tool_calls';

    const message = { role: 'assistant', content: text };
    if (reasoning) message.reasoning_content = reasoning;
    if (toolCalls.length > 0) message.tool_calls = toolCalls;

    return {
        id: `chatcmpl-zen-${Date.now().toString(36)}`,
        object: 'chat.completion',
        model: apiModelId,
        choices: [{ index: 0, message, finish_reason: finishReason }],
        usage
    };
}

/** Lê SSE do upstream e normaliza (responses -> chat). */
async function* readZenSse(response, endpoint) {
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
                if (endpoint === '/responses') {
                    const norm = normalizeResponsesStreamEvent(chunk);
                    if (norm) yield norm;
                } else {
                    yield chunk;
                }
            } catch { /* ignora parciais */ }
        }
    }
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

    const apiModelId = toZenApiModelId(openAiPayload.model);
    const endpoint = getZenEndpointForModel(openAiPayload.model);
    const url = `${OPENCODE_ZEN_API_BASE}${endpoint}`;
    const withTools = ensureZenGatekeeperTools({ ...openAiPayload, model: apiModelId });
    const body = endpoint === '/responses'
        ? chatPayloadToResponsesPayload({ ...withTools, stream: true }, apiModelId)
        : { ...withTools, stream: true };
    const response = await fetch(url, {
        method: 'POST',
        headers: zenHeaders(apiKey),
        body: JSON.stringify(body)
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
                if (endpoint === '/responses') {
                    const norm = normalizeResponsesStreamEvent(chunk);
                    if (norm) yield norm;
                } else {
                    yield chunk;
                }
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
    sendOpenCodeZenStream,
    getActiveOpenCodeZenConfig,
    setActiveOpenCodeZenConfig,
    toZenApiModelId,
    getZenEndpointForModel
};
