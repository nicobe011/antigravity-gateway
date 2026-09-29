/**
 * Model API for Cloud Code
 *
 * Handles model listing and quota retrieval from the Cloud Code API.
 */

import { ANTIGRAVITY_ENDPOINT_FALLBACKS, ANTIGRAVITY_HEADERS, getModelFamily } from '../constants.js';
import { getExternalClaudeModels } from '../model-mapper.js';
import { logger } from '../utils/logger.js';

/**
 * Check if a model is supported (Claude or Gemini)
 * @param {string} modelId - Model ID to check
 * @returns {boolean} True if model is supported
 */
function isSupportedModel(modelId) {
    const family = getModelFamily(modelId);
    return family === 'claude' || family === 'gemini';
}

/**
 * List available models in Anthropic API format
 * Fetches models dynamically from the Cloud Code API and includes external Claude models
 *
 * @param {string} token - OAuth access token
 * @returns {Promise<{object: string, data: Array<{id: string, object: string, created: number, owned_by: string, description: string}>}>} List of available models
 */
export async function listModels(token) {
    const modelList = getExternalClaudeModels();

    return {
        object: 'list',
        data: modelList,
        has_more: false,
        first_id: modelList[0]?.id || null,
        last_id: modelList[modelList.length - 1]?.id || null
    };
}

/**
 * Fetch available models with quota info from Cloud Code API
 * Returns model quotas including remaining fraction and reset time
 *
 * @param {string} token - OAuth access token
 * @returns {Promise<Object>} Raw response from fetchAvailableModels API
 */
export async function fetchAvailableModels(token) {
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...ANTIGRAVITY_HEADERS
    };

    for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
        try {
            const url = `${endpoint}/v1internal:fetchAvailableModels`;
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({})
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.warn(`[CloudCode] fetchAvailableModels error at ${endpoint}: ${response.status}`);
                continue;
            }

            return await response.json();
        } catch (error) {
            logger.warn(`[CloudCode] fetchAvailableModels failed at ${endpoint}:`, error.message);
        }
    }

    throw new Error('Failed to fetch available models from all endpoints');
}

/**
 * Fetch official user quota summary from Cloud Code API (v1internal:retrieveUserQuotaSummary)
 * Returns the exact real-time Weekly Limit and Five-Hour Limit buckets as seen in Antigravity UI
 *
 * @param {string} token - OAuth access token
 * @returns {Promise<Object>} Raw response from retrieveUserQuotaSummary API
 */
export async function retrieveUserQuotaSummary(token) {
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...ANTIGRAVITY_HEADERS
    };

    for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
        try {
            const url = `${endpoint}/v1internal:retrieveUserQuotaSummary`;
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({})
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.warn(`[CloudCode] retrieveUserQuotaSummary error at ${endpoint}: ${response.status}`);
                continue;
            }

            return await response.json();
        } catch (error) {
            logger.warn(`[CloudCode] retrieveUserQuotaSummary failed at ${endpoint}:`, error.message);
        }
    }

    throw new Error('Failed to retrieve user quota summary from all endpoints');
}

/**
 * Get model quotas for an account
 * Extracts quota info (remaining fraction and reset time) for each model
 *
 * @param {string} token - OAuth access token
 * @returns {Promise<Object>} Map of modelId -> { remainingFraction, resetTime }
 */
export async function getModelQuotas(token) {
    const data = await fetchAvailableModels(token);
    if (!data || !data.models) return {};

    const quotas = {};
    for (const [modelId, modelData] of Object.entries(data.models)) {
        // Only include Claude and Gemini models
        if (!isSupportedModel(modelId)) continue;

        if (modelData.quotaInfo) {
            quotas[modelId] = {
                remainingFraction: modelData.quotaInfo.remainingFraction ?? null,
                resetTime: modelData.quotaInfo.resetTime ?? null
            };
        }
    }

    return quotas;
}
