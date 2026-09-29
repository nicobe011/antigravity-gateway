/**
 * Signature Cache
 * In-memory cache for Gemini thoughtSignatures
 *
 * Gemini models require thoughtSignature on tool calls, but Claude Code
 * strips non-standard fields. This cache stores signatures by tool_use_id
 * so they can be restored in subsequent requests.
 *
 * Also caches thinking block signatures with model family for cross-model
 * compatibility checking.
 */

import { GEMINI_SIGNATURE_CACHE_TTL_MS, MIN_SIGNATURE_LENGTH } from '../constants.js';

const signatureCache = new Map();
const thinkingSignatureCache = new Map();
const toolNameCache = new Map();

/**
 * Cache tool name for a tool_use_id
 * @param {string} toolUseId - The tool use ID
 * @param {string} toolName - The tool name
 */
export function cacheToolName(toolUseId, toolName) {
    if (!toolUseId || !toolName) return;
    toolNameCache.set(toolUseId, {
        name: toolName,
        timestamp: Date.now()
    });
}

/**
 * Get a cached tool name for a tool_use_id
 * @param {string} toolUseId - The tool use ID
 * @returns {string|null} The tool name or null
 */
export function getCachedToolName(toolUseId) {
    if (!toolUseId) return null;
    const entry = toolNameCache.get(toolUseId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
        toolNameCache.delete(toolUseId);
        return null;
    }
    return entry.name;
}

/**
 * Store a signature for a tool_use_id
 * @param {string} toolUseId - The tool use ID
 * @param {string} signature - The thoughtSignature to cache
 */
export function cacheSignature(toolUseId, signature) {
    if (!toolUseId || !signature) return;
    signatureCache.set(toolUseId, {
        signature,
        timestamp: Date.now()
    });
}

/**
 * Get a cached signature for a tool_use_id
 * @param {string} toolUseId - The tool use ID
 * @returns {string|null} The cached signature or null if not found/expired
 */
export function getCachedSignature(toolUseId) {
    if (!toolUseId) return null;
    const entry = signatureCache.get(toolUseId);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
        signatureCache.delete(toolUseId);
        return null;
    }

    return entry.signature;
}

/**
 * Clear expired entries from the cache
 * Can be called periodically to prevent memory buildup
 */
export function cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of toolNameCache) {
        if (now - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
            toolNameCache.delete(key);
        }
    }
    for (const [key, entry] of signatureCache) {
        if (now - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
            signatureCache.delete(key);
        }
    }
    for (const [key, entry] of thinkingSignatureCache) {
        if (now - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
            thinkingSignatureCache.delete(key);
        }
    }
}

/**
 * Get the current cache size (for debugging)
 * @returns {number} Number of entries in the cache
 */
export function getCacheSize() {
    return signatureCache.size;
}

/**
 * Cache a thinking block signature with its model family
 * @param {string} signature - The thinking signature to cache
 * @param {string} modelFamily - The model family ('claude' or 'gemini')
 */
export function cacheThinkingSignature(signature, modelFamily) {
    if (!signature || signature.length < MIN_SIGNATURE_LENGTH) return;
    thinkingSignatureCache.set(signature, {
        modelFamily,
        timestamp: Date.now()
    });
}

/**
 * Get the cached model family for a thinking signature
 * @param {string} signature - The signature to look up
 * @returns {string|null} 'claude', 'gemini', or null if not found/expired
 */
export function getCachedSignatureFamily(signature) {
    if (!signature) return null;
    const entry = thinkingSignatureCache.get(signature);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > GEMINI_SIGNATURE_CACHE_TTL_MS) {
        thinkingSignatureCache.delete(signature);
        return null;
    }

    return entry.modelFamily;
}

/**
 * Get the current thinking signature cache size (for debugging)
 * @returns {number} Number of entries in the thinking signature cache
 */
export function getThinkingCacheSize() {
    return thinkingSignatureCache.size;
}
