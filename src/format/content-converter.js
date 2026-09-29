/**
 * Content Converter
 * Converts Anthropic message content to Google Generative AI parts format
 */

import { MIN_SIGNATURE_LENGTH, GEMINI_SKIP_SIGNATURE } from '../constants.js';
import { getCachedSignature, getCachedSignatureFamily, cacheToolName, getCachedToolName } from './signature-cache.js';
import { logger } from '../utils/logger.js';

/**
 * Convert Anthropic role to Google role
 * @param {string} role - Anthropic role ('user', 'assistant')
 * @returns {string} Google role ('user', 'model')
 */
export function convertRole(role) {
    if (role === 'assistant') return 'model';
    if (role === 'user') return 'user';
    return 'user'; // Default to user
}

/**
 * Convert Anthropic message content to Google Generative AI parts
 * @param {string|Array} content - Anthropic message content
 * @param {boolean} isClaudeModel - Whether the model is a Claude model
 * @param {boolean} isGeminiModel - Whether the model is a Gemini model
 * @returns {Array} Google Generative AI parts array
 */
export function convertContentToParts(content, isClaudeModel = false, isGeminiModel = false) {
    if (typeof content === 'string') {
        return [{ text: content }];
    }

    if (!Array.isArray(content)) {
        return [{ text: String(content) }];
    }

    const parts = [];

    for (const block of content) {
        if (!block) continue;

        if (block.type === 'text') {
            // Skip empty text blocks - they cause API errors
            if (block.text && block.text.trim()) {
                const textContent = block.text.trim();
                // Check if text block contains a standalone data URI image
                const dataUriMatch = textContent.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
                if (dataUriMatch) {
                    parts.push({
                        inlineData: {
                            mimeType: dataUriMatch[1],
                            data: dataUriMatch[2].replace(/[\r\n\s]/g, '')
                        }
                    });
                } else {
                    parts.push({ text: block.text });
                }
            }
        } else if (block.type === 'image') {
            // Handle image content with clean base64 extraction
            if (block.source?.type === 'base64') {
                let base64Data = block.source.data || '';
                let mimeType = block.source.media_type || 'image/jpeg';
                if (typeof base64Data === 'string' && base64Data.includes(';base64,')) {
                    const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        mimeType = match[1] || mimeType;
                        base64Data = match[2];
                    } else {
                        base64Data = base64Data.split(';base64,')[1];
                    }
                }
                parts.push({
                    inlineData: {
                        mimeType,
                        data: String(base64Data).replace(/[\r\n\s]/g, '')
                    }
                });
            } else if (block.source?.type === 'url') {
                // URL-referenced image
                parts.push({
                    fileData: {
                        mimeType: block.source.media_type || 'image/jpeg',
                        fileUri: block.source.url
                    }
                });
            }
        } else if (block.type === 'document') {
            // Handle document content (e.g. PDF)
            if (block.source?.type === 'base64') {
                let base64Data = block.source.data || '';
                let mimeType = block.source.media_type || 'application/pdf';
                if (typeof base64Data === 'string' && base64Data.includes(';base64,')) {
                    base64Data = base64Data.split(';base64,')[1];
                }
                parts.push({
                    inlineData: {
                        mimeType,
                        data: String(base64Data).replace(/[\r\n\s]/g, '')
                    }
                });
            } else if (block.source?.type === 'url') {
                parts.push({
                    fileData: {
                        mimeType: block.source.media_type || 'application/pdf',
                        fileUri: block.source.url
                    }
                });
            }
        } else if (block.type === 'tool_use') {
            // Convert tool_use to functionCall (Google format)
            // Cache tool name for tool_use id to resolve tool_result accurately
            if (block.id && block.name) {
                cacheToolName(block.id, block.name);
            }

            const functionCall = {
                name: String(block.name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
                args: block.input || {}
            };

            if (block.id) {
                functionCall.id = block.id;
            }

            // Build the part with functionCall
            const part = { functionCall };

            // For Gemini models, include thoughtSignature at the part level
            // This is required by Gemini 3+ for tool calls to work correctly
            if (isGeminiModel) {
                // Priority: block.thoughtSignature > cache > GEMINI_SKIP_SIGNATURE
                let signature = block.thoughtSignature;

                if (!signature && block.id) {
                    signature = getCachedSignature(block.id);
                    if (signature) {
                        logger.debug(`[ContentConverter] Restored signature from cache for: ${block.id}`);
                    }
                }

                part.thoughtSignature = signature || GEMINI_SKIP_SIGNATURE;
            }

            parts.push(part);
        } else if (block.type === 'tool_result') {
            // Convert tool_result to functionResponse (Google format)
            let responseContent = block.content;
            let imageParts = [];

            // Helper to extract embedded base64 data URIs from strings
            const extractDataUris = (str) => {
                if (typeof str !== 'string') return str;
                const dataUriRegex = /data:(image\/[a-zA-Z0-9.+_-]+);base64,([A-Za-z0-9+/=\r\n]+)/g;
                let match;
                let cleanedStr = str;
                while ((match = dataUriRegex.exec(str)) !== null) {
                    imageParts.push({
                        inlineData: {
                            mimeType: match[1],
                            data: match[2].replace(/[\r\n\s]/g, '')
                        }
                    });
                }
                if (imageParts.length > 0) {
                    cleanedStr = cleanedStr.replace(dataUriRegex, '[Image preview captured]');
                }
                return cleanedStr;
            };

            if (typeof responseContent === 'string') {
                const cleanedText = extractDataUris(responseContent);
                let parsedJson = null;
                const trimmed = cleanedText.trim();
                if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                    try {
                        parsedJson = JSON.parse(trimmed);
                    } catch {
                        // ignore JSON parse error, use raw string
                    }
                }

                if (parsedJson !== null && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
                    responseContent = parsedJson;
                } else if (Array.isArray(parsedJson)) {
                    responseContent = { result: parsedJson };
                } else {
                    responseContent = { result: cleanedText };
                }
            } else if (Array.isArray(responseContent)) {
                // Extract images and documents from tool results (e.g., Read tool reading images/PDFs, browser screenshots, preview tools)
                for (const item of responseContent) {
                    if (item.type === 'image') {
                        if (item.source?.type === 'base64') {
                            let data = item.source.data || '';
                            let mimeType = item.source.media_type || 'image/jpeg';
                            if (typeof data === 'string' && data.includes(';base64,')) {
                                data = data.split(';base64,')[1];
                            }
                            imageParts.push({
                                inlineData: {
                                    mimeType,
                                    data: String(data).replace(/[\r\n\s]/g, '')
                                }
                            });
                        } else if (item.source?.type === 'url') {
                            imageParts.push({
                                fileData: {
                                    mimeType: item.source.media_type || 'image/jpeg',
                                    fileUri: item.source.url
                                }
                            });
                        }
                    } else if (item.type === 'document') {
                        if (item.source?.type === 'base64') {
                            let data = item.source.data || '';
                            let mimeType = item.source.media_type || 'application/pdf';
                            if (typeof data === 'string' && data.includes(';base64,')) {
                                data = data.split(';base64,')[1];
                            }
                            imageParts.push({
                                inlineData: {
                                    mimeType,
                                    data: String(data).replace(/[\r\n\s]/g, '')
                                }
                            });
                        } else if (item.source?.type === 'url') {
                            imageParts.push({
                                fileData: {
                                    mimeType: item.source.media_type || 'application/pdf',
                                    fileUri: item.source.url
                                }
                            });
                        }
                    }
                }

                // Extract text content and check for embedded data URIs
                const rawTexts = responseContent
                    .filter(c => c.type === 'text')
                    .map(c => extractDataUris(c.text))
                    .join('\n');

                let parsedTextJson = null;
                const trimmedTexts = rawTexts.trim();
                if ((trimmedTexts.startsWith('{') && trimmedTexts.endsWith('}')) || (trimmedTexts.startsWith('[') && trimmedTexts.endsWith(']'))) {
                    try {
                        parsedTextJson = JSON.parse(trimmedTexts);
                    } catch {
                        // ignore JSON parse error
                    }
                }

                if (parsedTextJson !== null && typeof parsedTextJson === 'object' && !Array.isArray(parsedTextJson)) {
                    responseContent = parsedTextJson;
                } else if (Array.isArray(parsedTextJson)) {
                    responseContent = { result: parsedTextJson };
                } else {
                    responseContent = { result: rawTexts || (imageParts.length > 0 ? 'Image/document attached' : '') };
                }
            }

            // Support is_error flag for subagents to recognize tool failures
            if (block.is_error) {
                if (typeof responseContent === 'object' && responseContent !== null) {
                    responseContent.is_error = true;
                }
            }

            // Resolve function name: prefer cached tool name for the id, fallback to tool_use_id
            const toolName = block.tool_name || (block.tool_use_id ? getCachedToolName(block.tool_use_id) : null) || block.tool_use_id || 'unknown';
            const sanitizedToolName = String(toolName).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

            const functionResponse = {
                name: sanitizedToolName,
                response: responseContent
            };

            // Include id matching tool_use_id
            if (block.tool_use_id) {
                functionResponse.id = block.tool_use_id;
            }

            parts.push({ functionResponse });

            // Add any images from the tool result as separate native inlineData/fileData parts
            parts.push(...imageParts);
        } else if (block.type === 'thinking') {
            // Handle thinking blocks with signature compatibility check
            if (block.signature && block.signature.length >= MIN_SIGNATURE_LENGTH) {
                const signatureFamily = getCachedSignatureFamily(block.signature);
                const targetFamily = isClaudeModel ? 'claude' : isGeminiModel ? 'gemini' : null;

                // Drop blocks with incompatible signatures for Gemini (cross-model switch)
                if (isGeminiModel && signatureFamily && targetFamily && signatureFamily !== targetFamily) {
                    logger.debug(`[ContentConverter] Dropping incompatible ${signatureFamily} thinking for ${targetFamily} model`);
                    continue;
                }

                // Drop blocks with unknown signature origin for Gemini (cold cache - safe default)
                if (isGeminiModel && !signatureFamily && targetFamily) {
                    logger.debug(`[ContentConverter] Dropping thinking with unknown signature origin`);
                    continue;
                }

                // Compatible - convert to Gemini format with signature
                parts.push({
                    text: block.thinking,
                    thought: true,
                    thoughtSignature: block.signature
                });
            }
            // Unsigned thinking blocks are dropped (existing behavior)
        }
    }

    return parts;
}
