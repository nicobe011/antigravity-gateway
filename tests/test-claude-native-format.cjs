/**
 * Test Claude Native Compatibility
 * Validates that response structures match Anthropic Messages API specification:
 * - id: "msg_..."
 * - type: "message"
 * - role: "assistant"
 * - content: array with "thinking" and "text" or "tool_use" blocks
 * - stop_reason: "end_turn", "tool_use", "max_tokens"
 * - stop_sequence: null or string
 * - usage: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
 * - model: matches client requested external Claude model
 */

const assert = require('assert');
const http = require('http');
const net = require('net');

async function testClaudeNativeFormat() {
    console.log('Testing Claude Native Compatibility...');

    const { convertGoogleToAnthropic } = await import('../src/format/response-converter.js');
    const { convertAnthropicToGoogle } = await import('../src/format/request-converter.js');
    const { resolveBackendModel } = await import('../src/model-mapper.js');
    const { default: app } = await import('../src/server.js');

    // 1. Validate Non-streaming response format conversion
    console.log('1. Testing convertGoogleToAnthropic with thinking and tool calls...');
    const mockGoogleResponse = {
        response: {
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                thought: true,
                                text: 'Analyzing user inquiry...',
                                thoughtSignature: 'valid_sig_1234567890123456'
                            },
                            {
                                text: 'Here is the response'
                            },
                            {
                                functionCall: {
                                    name: 'calculate',
                                    args: { expr: '2+2' },
                                    id: 'toolu_12345678'
                                },
                                thoughtSignature: 'sig_gemini_tool_123456'
                            }
                        ]
                    },
                    finishReason: 'TOOL_USE'
                }
            ],
            usageMetadata: {
                promptTokenCount: 150,
                cachedContentTokenCount: 50,
                candidatesTokenCount: 42
            }
        }
    };

    const requestedModel = 'claude-3-7-sonnet-20250219';
    const anthropicResponse = convertGoogleToAnthropic(mockGoogleResponse, requestedModel);

    // Assert top-level fields
    assert.ok(anthropicResponse.id.startsWith('msg_'), 'id must start with msg_');
    assert.strictEqual(anthropicResponse.type, 'message');
    assert.strictEqual(anthropicResponse.role, 'assistant');
    assert.strictEqual(anthropicResponse.model, requestedModel, 'Preserves requested model');
    assert.strictEqual(anthropicResponse.stop_reason, 'tool_use');
    assert.strictEqual(anthropicResponse.stop_sequence, null);

    // Assert usage structure
    assert.strictEqual(anthropicResponse.usage.input_tokens, 100);
    assert.strictEqual(anthropicResponse.usage.output_tokens, 42);
    assert.strictEqual(anthropicResponse.usage.cache_read_input_tokens, 50);
    assert.strictEqual(anthropicResponse.usage.cache_creation_input_tokens, 0);

    // Assert content blocks
    assert.strictEqual(anthropicResponse.content.length, 3);
    assert.strictEqual(anthropicResponse.content[0].type, 'thinking');
    assert.strictEqual(anthropicResponse.content[0].thinking, 'Analyzing user inquiry...');
    assert.strictEqual(anthropicResponse.content[0].signature, 'valid_sig_1234567890123456');

    assert.strictEqual(anthropicResponse.content[1].type, 'text');
    assert.strictEqual(anthropicResponse.content[1].text, 'Here is the response');

    assert.strictEqual(anthropicResponse.content[2].type, 'tool_use');
    assert.strictEqual(anthropicResponse.content[2].name, 'calculate');
    assert.deepStrictEqual(anthropicResponse.content[2].input, { expr: '2+2' });
    console.log('   ✓ Non-streaming response structure matches Claude native specification');

    // 2. Validate convertAnthropicToGoogle request conversion
    console.log('2. Testing convertAnthropicToGoogle with Claude request...');
    const claudeReq = {
        model: 'claude-opus-4-6-thinking',
        backendModel: resolveBackendModel('claude-opus-4-6-thinking'),
        messages: [
            {
                role: 'user',
                content: 'What is 2+2?'
            }
        ],
        system: 'You are Claude Code assistant.',
        thinking: {
            type: 'enabled',
            budget_tokens: 4096
        },
        tools: [
            {
                name: 'bash',
                description: 'Execute bash commands',
                input_schema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string' }
                    },
                    required: ['command']
                }
            }
        ]
    };

    const googleReq = convertAnthropicToGoogle(claudeReq);
    assert.ok(googleReq.contents.length > 0);
    assert.strictEqual(googleReq.contents[0].role, 'user');
    assert.ok(googleReq.systemInstruction);
    assert.ok(googleReq.generationConfig.thinkingConfig);
    assert.ok(googleReq.generationConfig.maxOutputTokens > 4096);
    assert.ok(googleReq.tools);
    assert.strictEqual(googleReq.tools[0].functionDeclarations[0].name, 'bash');
    console.log('   ✓ Request conversion matches Google Generative AI Cloud Code specification');

    console.log('\nALL CLAUDE NATIVE FORMAT TESTS PASSED!');
}

testClaudeNativeFormat().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
