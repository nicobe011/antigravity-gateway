/**
 * OpenCode Zen Request & Response Converter
 *
 * Converts Anthropic Messages API requests to OpenAI Chat Completions payload for OpenCode Zen.
 * Handles graceful image sanitization: if a model doesn't support images, converts the image block
 * into a descriptive text indicator without breaking the conversation history or crashing.
 * Also handles tools, system instructions, and streaming response conversion back to Anthropic SSE.
 */

import crypto from 'crypto';
import { getOpenCodeZenModelMetadata, resolveOpenCodeZenModel } from './zen-client.js';

/**
 * Convert Anthropic Messages request to OpenCode Zen (OpenAI-compatible) payload
 *
 * @param {Object} anthropicRequest - Anthropic format request
 * @returns {Object} OpenCode Zen API payload
 */
export function convertAnthropicToOpenCodeZen(anthropicRequest) {
    const requestedModel = anthropicRequest.model || 'opencode/nemotron-3.5-lightning-free';
    const canonicalModel = resolveOpenCodeZenModel(requestedModel);
    const metadata = getOpenCodeZenModelMetadata(canonicalModel);
    const supportsImages = metadata?.supportsImages ?? false;

    const messages = [];

    // 1. Process System Prompt
    if (anthropicRequest.system) {
        let systemText = '';
        if (typeof anthropicRequest.system === 'string') {
            systemText = anthropicRequest.system;
        } else if (Array.isArray(anthropicRequest.system)) {
            systemText = anthropicRequest.system
                .filter(b => b.type === 'text')
                .map(b => b.text)
                .join('\n\n');
        }

        if (systemText.trim()) {
            messages.push({
                role: 'system',
                content: systemText
            });
        }
    }

    // 2. Process Messages with Graceful Image Fallback
    for (const msg of anthropicRequest.messages || []) {
        const role = msg.role === 'assistant' ? 'assistant' : 'user';

        if (typeof msg.content === 'string') {
            messages.push({
                role,
                content: msg.content
            });
            continue;
        }

        if (!Array.isArray(msg.content)) {
            messages.push({
                role,
                content: String(msg.content || '')
            });
            continue;
        }

        const openAiContent = [];
        const toolCalls = [];
        let toolResultsText = '';

        for (const block of msg.content) {
            if (!block) continue;

            if (block.type === 'text') {
                if (block.text && block.text.trim()) {
                    openAiContent.push({
                        type: 'text',
                        text: block.text
                    });
                }
            } else if (block.type === 'image') {
                if (supportsImages) {
                    let imageUrl = '';
                    if (block.source?.type === 'base64') {
                        const mime = block.source.media_type || 'image/jpeg';
                        imageUrl = `data:${mime};base64,${block.source.data}`;
                    } else if (block.source?.type === 'url') {
                        imageUrl = block.source.url;
                    }

                    if (imageUrl) {
                        openAiContent.push({
                            type: 'image_url',
                            image_url: { url: imageUrl }
                        });
                    }
                } else {
                    // Graceful image handling for models without vision:
                    // Preserve conversation flow without throwing API 400 errors
                    openAiContent.push({
                        type: 'text',
                        text: `[Nota do Sistema: O usuário anexou uma imagem, mas o modelo atual (${metadata.displayName}) opera exclusivamente em modo texto. Uma descrição textual ou o uso de um modelo com suporte visual é recomendado caso a análise da imagem seja essencial.]`
                    });
                }
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id || `call_${crypto.randomBytes(8).toString('hex')}`,
                    type: 'function',
                    function: {
                        name: block.name,
                        arguments: JSON.stringify(block.input || {})
                    }
                });
            } else if (block.type === 'tool_result') {
                let resText = '';
                if (typeof block.content === 'string') {
                    resText = block.content;
                } else if (Array.isArray(block.content)) {
                    resText = block.content
                        .filter(b => b.type === 'text')
                        .map(b => b.text)
                        .join('\n');
                } else if (block.content) {
                    resText = JSON.stringify(block.content);
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: block.tool_use_id,
                    content: resText || (block.is_error ? 'Error executing tool' : 'Success')
                });
            }
        }

        if (openAiContent.length > 0 || toolCalls.length > 0) {
            const outMsg = { role };
            if (openAiContent.length === 1 && openAiContent[0].type === 'text') {
                outMsg.content = openAiContent[0].text;
            } else if (openAiContent.length > 0) {
                outMsg.content = openAiContent;
            } else {
                outMsg.content = null;
            }

            if (toolCalls.length > 0) {
                outMsg.tool_calls = toolCalls;
            }

            messages.push(outMsg);
        }
    }

    const payload = {
        model: canonicalModel,
        messages,
        max_tokens: Math.min(anthropicRequest.max_tokens || 4096, metadata?.limit?.output || 16384),
        stream: !!anthropicRequest.stream
    };

    if (anthropicRequest.temperature !== undefined) {
        payload.temperature = anthropicRequest.temperature;
    }
    if (anthropicRequest.top_p !== undefined) {
        payload.top_p = anthropicRequest.top_p;
    }

    // Convert tools if provided
    if (anthropicRequest.tools && anthropicRequest.tools.length > 0 && metadata.tool_call) {
        payload.tools = anthropicRequest.tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description || '',
                parameters: t.input_schema || { type: 'object' }
            }
        }));
    }

    return payload;
}

/**
 * Convert OpenCode Zen response (OpenAI format) to Anthropic Messages response
 *
 * @param {Object} openAiResponse - OpenAI format response
 * @param {string} originalModel - Requested model name from client
 * @returns {Object} Anthropic format response
 */
export function convertOpenCodeZenToAnthropic(openAiResponse, originalModel) {
    const choice = openAiResponse.choices?.[0] || {};
    const message = choice.message || {};
    const content = [];

    // Thinking / reasoning content if model emitted reasoning
    if (message.reasoning_content) {
        content.push({
            type: 'thinking',
            thinking: message.reasoning_content,
            signature: crypto.randomBytes(32).toString('base64')
        });
    }

    // Text content
    if (message.content) {
        content.push({
            type: 'text',
            text: message.content
        });
    }

    // Tool calls
    if (Array.isArray(message.tool_calls)) {
        for (const tc of message.tool_calls) {
            let inputArgs = {};
            try {
                inputArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch {
                inputArgs = { raw: tc.function?.arguments };
            }

            content.push({
                type: 'tool_use',
                id: tc.id || `toolu_${crypto.randomBytes(12).toString('hex')}`,
                name: tc.function?.name,
                input: inputArgs
            });
        }
    }

    let stopReason = 'end_turn';
    if (choice.finish_reason === 'tool_calls') {
        stopReason = 'tool_use';
    } else if (choice.finish_reason === 'length') {
        stopReason = 'max_tokens';
    }

    return {
        id: `msg_${crypto.randomBytes(16).toString('hex')}`,
        type: 'message',
        role: 'assistant',
        content: content.length > 0 ? content : [{ type: 'text', text: '' }],
        model: originalModel,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: {
            input_tokens: openAiResponse.usage?.prompt_tokens || 0,
            output_tokens: openAiResponse.usage?.completion_tokens || 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0
        }
    };
}

/**
 * Stream OpenCode Zen response and yield Anthropic SSE events
 *
 * @param {AsyncGenerator} openAiChunkStream - Generator yielding OpenAI chunks
 * @param {string} originalModel - Model name requested by client
 * @yields {Object} Anthropic SSE events
 */
export async function* streamOpenCodeZenResponse(openAiChunkStream, originalModel) {
    const messageId = `msg_${crypto.randomBytes(16).toString('hex')}`;
    let hasEmittedStart = false;
    let blockIndex = 0;
    let currentBlockType = null;
    let stopReason = 'end_turn';

    for await (const chunk of openAiChunkStream) {
        const choice = chunk.choices?.[0] || {};
        const delta = choice.delta || {};

        if (!hasEmittedStart) {
            hasEmittedStart = true;
            yield {
                type: 'message_start',
                message: {
                    id: messageId,
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model: originalModel,
                    stop_reason: null,
                    stop_sequence: null,
                    usage: {
                        input_tokens: 0,
                        output_tokens: 0,
                        cache_read_input_tokens: 0,
                        cache_creation_input_tokens: 0
                    }
                }
            };
        }

        // Handle reasoning content
        if (delta.reasoning_content) {
            if (currentBlockType !== 'thinking') {
                if (currentBlockType !== null) {
                    yield { type: 'content_block_stop', index: blockIndex };
                    blockIndex++;
                }
                currentBlockType = 'thinking';
                yield {
                    type: 'content_block_start',
                    index: blockIndex,
                    content_block: { type: 'thinking', thinking: '' }
                };
            }

            yield {
                type: 'content_block_delta',
                index: blockIndex,
                delta: { type: 'thinking_delta', thinking: delta.reasoning_content }
            };
        }

        // Handle normal text content
        if (delta.content) {
            if (currentBlockType !== 'text') {
                if (currentBlockType !== null) {
                    yield { type: 'content_block_stop', index: blockIndex };
                    blockIndex++;
                }
                currentBlockType = 'text';
                yield {
                    type: 'content_block_start',
                    index: blockIndex,
                    content_block: { type: 'text', text: '' }
                };
            }

            yield {
                type: 'content_block_delta',
                index: blockIndex,
                delta: { type: 'text_delta', text: delta.content }
            };
        }

        // Handle tool calls in stream
        if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
                if (tc.function?.name) {
                    if (currentBlockType !== null) {
                        yield { type: 'content_block_stop', index: blockIndex };
                        blockIndex++;
                    }
                    currentBlockType = 'tool_use';
                    stopReason = 'tool_use';

                    yield {
                        type: 'content_block_start',
                        index: blockIndex,
                        content_block: {
                            type: 'tool_use',
                            id: tc.id || `toolu_${crypto.randomBytes(12).toString('hex')}`,
                            name: tc.function.name,
                            input: {}
                        }
                    };
                }

                if (tc.function?.arguments) {
                    yield {
                        type: 'content_block_delta',
                        index: blockIndex,
                        delta: {
                            type: 'input_json_delta',
                            partial_json: tc.function.arguments
                        }
                    };
                }
            }
        }

        if (choice.finish_reason) {
            if (choice.finish_reason === 'tool_calls') {
                stopReason = 'tool_use';
            } else if (choice.finish_reason === 'length') {
                stopReason = 'max_tokens';
            }
        }
    }

    if (currentBlockType !== null) {
        yield { type: 'content_block_stop', index: blockIndex };
    }

    yield {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 0 }
    };

    yield { type: 'message_stop' };
}
