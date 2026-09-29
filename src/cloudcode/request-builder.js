/**
 * Request Builder for Cloud Code
 *
 * Builds request payloads and headers for the Cloud Code API.
 */

import crypto from 'crypto';
import {
    ANTIGRAVITY_HEADERS,
    getModelFamily,
    isThinkingModel
} from '../constants.js';
import { resolveBackendModel, isThinkingModelResolved } from '../model-mapper.js';
import { convertAnthropicToGoogle } from '../format/index.js';
import { deriveSessionId } from './session-manager.js';

/**
 * Build the wrapped request body for Cloud Code API
 *
 * @param {Object} anthropicRequest - The Anthropic-format request
 * @param {string} projectId - The project ID to use
 * @returns {Object} The Cloud Code API request payload
 */
export function buildCloudCodeRequest(anthropicRequest, projectId) {
    const requestedModel = anthropicRequest.model;
    const backendModel = anthropicRequest.backendModel || resolveBackendModel(requestedModel);
    const googleRequest = convertAnthropicToGoogle({
        ...anthropicRequest,
        backendModel
    });

    // Use stable session ID derived from first user message for cache continuity
    googleRequest.sessionId = deriveSessionId(anthropicRequest);

    const payload = {
        project: projectId,
        model: backendModel,
        request: googleRequest,
        userAgent: 'antigravity',
        requestId: 'agent-' + crypto.randomUUID()
    };

    return payload;
}

/**
 * Build headers for Cloud Code API requests
 *
 * @param {string} token - OAuth access token
 * @param {string} model - Model name
 * @param {string} accept - Accept header value (default: 'application/json')
 * @returns {Object} Headers object
 */
export function buildHeaders(token, model, accept = 'application/json') {
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...ANTIGRAVITY_HEADERS
    };

    const backendModel = resolveBackendModel(model);
    const modelFamily = getModelFamily(backendModel) !== 'unknown' ? getModelFamily(backendModel) : getModelFamily(model);
    const isThinking = isThinkingModelResolved(model, backendModel);

    // Add interleaved thinking header only for Claude thinking models
    if (modelFamily === 'claude' && isThinking) {
        headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
    }

    if (accept !== 'application/json') {
        headers['Accept'] = accept;
    }

    return headers;
}
