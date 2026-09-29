/**
 * Test Claude Model Mapping, Extended Thinking, and Token Counting
 *
 * Verifies that external Claude Opus 4.6 tiers (low, medium, high)
 * are properly resolved, thinking budgets match Gemini 3.8 Flash tiers,
 * token counts are estimated, and tool results support multimodal parts.
 */

const assert = require('assert');

async function runTests() {
    console.log('Testing Claude Model Mapping and Extended Thinking...');

    // Dynamic import for ES modules
    const {
        resolveBackendModel,
        isExternalClaudeModel,
        isThinkingModelResolved,
        getExternalClaudeModels,
        estimateTokenCount
    } = await import('../src/model-mapper.js');

    const { convertAnthropicToGoogle } = await import('../src/format/request-converter.js');
    const { buildCloudCodeRequest } = await import('../src/cloudcode/request-builder.js');

    // 1. Model Resolution Tests
    console.log('1. Testing model resolution...');
    assert.strictEqual(resolveBackendModel('claude-opus-4-6-low'), 'gemini-3.8-flash-tiered');
    assert.strictEqual(resolveBackendModel('claude-opus-4-6-medium'), 'gemini-3.8-flash-tiered');
    assert.strictEqual(resolveBackendModel('claude-opus-4-6-high'), 'gemini-3.8-flash-tiered');
    // Suffix [1m] and :1m resolution for 1M context variants
    assert.strictEqual(resolveBackendModel('claude-opus-4-6-low[1m]'), 'gemini-3.8-flash-tiered');
    assert.strictEqual(resolveBackendModel('claude-opus-4-6-high[1m]'), 'gemini-3.8-flash-tiered');
    // Fallback: any other model defaults cleanly to gemini-3.8-flash-tiered
    assert.strictEqual(resolveBackendModel('claude-3-7-sonnet-20250219'), 'gemini-3.8-flash-tiered');
    assert.strictEqual(resolveBackendModel('claude-fake'), 'gemini-3.8-flash-tiered');
    console.log('   ✓ Model resolution passed');

    // 2. External Model Detection Tests
    console.log('2. Testing external model detection...');
    assert.strictEqual(isExternalClaudeModel('claude-opus-4-6-low'), true);
    assert.strictEqual(isExternalClaudeModel('claude-opus-4-6-medium'), true);
    assert.strictEqual(isExternalClaudeModel('claude-opus-4-6-high'), true);
    console.log('   ✓ External model detection passed');

    // 3. Extended Thinking Resolution Tests
    console.log('3. Testing thinking resolution on external models...');
    assert.strictEqual(isThinkingModelResolved('claude-opus-4-6-low', 'gemini-3.8-flash-tiered'), true);
    assert.strictEqual(isThinkingModelResolved('claude-opus-4-6-medium', 'gemini-3.8-flash-tiered'), true);
    assert.strictEqual(isThinkingModelResolved('claude-opus-4-6-high', 'gemini-3.8-flash-tiered'), true);
    assert.strictEqual(
        isThinkingModelResolved('claude-opus-4-6-low', 'gemini-3.8-flash-tiered', { type: 'disabled' }),
        false
    );
    console.log('   ✓ Thinking resolution and toggle disabling passed');

    // 4. Extended Thinking Budget & Max Tokens Adjustment Tests
    console.log('4. Testing extended thinking budget, effort, and tier defaults on Gemini 3.8 Flash...');
    const googleReqWithIncreasedBudget = convertAnthropicToGoogle({
        model: 'claude-opus-4-6-high',
        messages: [{ role: 'user', content: 'Solve this difficult problem.' }],
        temperature: 0.7,
        top_p: 0.9,
        thinking: { type: 'enabled', budget_tokens: 32000 }
    });

    assert.ok(googleReqWithIncreasedBudget.generationConfig.thinkingConfig);
    assert.strictEqual(googleReqWithIncreasedBudget.generationConfig.thinkingConfig.includeThoughts, true);
    assert.strictEqual(googleReqWithIncreasedBudget.generationConfig.thinkingConfig.thinkingBudget, 32000);
    // maxOutputTokens must be adjusted to > 32000
    assert.ok(googleReqWithIncreasedBudget.generationConfig.maxOutputTokens > 32000);
    // Conflicting sampling params (temperature, top_p) must be removed to prevent 400 errors
    assert.strictEqual(googleReqWithIncreasedBudget.generationConfig.temperature, undefined);
    assert.strictEqual(googleReqWithIncreasedBudget.generationConfig.topP, undefined);

    // Test tier defaults: claude-opus-4-6-low -> 2048, medium -> 8192, high -> 32000
    const lowReq = convertAnthropicToGoogle({
        model: 'claude-opus-4-6-low',
        messages: [{ role: 'user', content: 'Quick thought.' }]
    });
    assert.strictEqual(lowReq.generationConfig.thinkingConfig.thinkingBudget, 2048);

    const medReq = convertAnthropicToGoogle({
        model: 'claude-opus-4-6-medium',
        messages: [{ role: 'user', content: 'Medium thought.' }]
    });
    assert.strictEqual(medReq.generationConfig.thinkingConfig.thinkingBudget, 8192);

    const highReq = convertAnthropicToGoogle({
        model: 'claude-opus-4-6-high',
        messages: [{ role: 'user', content: 'Deep thought.' }]
    });
    assert.strictEqual(highReq.generationConfig.thinkingConfig.thinkingBudget, 32000);
    console.log('   ✓ Extended thinking budget, reasoning tiers, and temperature cleanup passed');

    // 5. Build Cloud Code Request Tests
    console.log('5. Testing request builder with external Claude models...');
    const builtReq = buildCloudCodeRequest({
        model: 'claude-opus-4-6-medium',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'enabled', budget_tokens: 8192 }
    }, 'test-project');

    assert.strictEqual(builtReq.model, 'gemini-3.8-flash-tiered');
    assert.strictEqual(builtReq.request.generationConfig.thinkingConfig.thinkingBudget, 8192);
    console.log('   ✓ Request builder passed');

    // 6. External Models Listing Tests
    console.log('6. Testing external models list for GET /v1/models...');
    const externalModels = getExternalClaudeModels();
    assert.ok(Array.isArray(externalModels));
    assert.strictEqual(externalModels.length, 3);
    assert.ok(externalModels.some(m => m.id === 'claude-opus-4-6-low[1m]'));
    assert.ok(externalModels.some(m => m.id === 'claude-opus-4-6-medium[1m]'));
    assert.ok(externalModels.some(m => m.id === 'claude-opus-4-6-high[1m]'));
    assert.ok(externalModels.every(m => m.owned_by === 'anthropic'));
    assert.ok(externalModels.every(m => m.max_input_tokens === 1000000));
    assert.ok(externalModels.every(m => m.max_tokens === 65536));
    console.log('   ✓ External models listing strictly limited to the 3 Opus 4.6 tiers with 1M tokens');

    // 7. Token Estimation Tests
    console.log('7. Testing token count estimation...');
    const tokenCount = estimateTokenCount({
        model: 'claude-opus-4-6-medium',
        system: 'You are a helpful coding assistant.',
        messages: [
            { role: 'user', content: 'Write a quicksort algorithm in JavaScript.' },
            { role: 'assistant', content: 'Here is the quicksort implementation:\n\nfunction quicksort(arr) { ... }' }
        ],
        tools: [
            {
                name: 'run_terminal_command',
                description: 'Runs a shell command',
                input_schema: { type: 'object', properties: { cmd: { type: 'string' } } }
            }
        ]
    });
    assert.ok(typeof tokenCount === 'number');
    assert.ok(tokenCount > 20);
    console.log(`   ✓ Token count estimated: ${tokenCount} tokens`);

    // 8. Multimodal Tool Results Tests (Claude Desktop Previews)
    console.log('8. Testing native multimodal tool results extraction for Claude Desktop previews...');
    const multimodalToolReq = convertAnthropicToGoogle({
        model: 'claude-opus-4-6-high',
        messages: [
            { role: 'user', content: 'Take a screenshot of the web preview.' },
            {
                role: 'assistant',
                content: [
                    { type: 'tool_use', id: 'toolu_preview_shot', name: 'preview_screenshot', input: { serverId: 's1' } }
                ]
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: 'toolu_preview_shot',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: 'image/jpeg',
                                    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
                                }
                            },
                            {
                                type: 'text',
                                text: 'Screenshot captured successfully'
                            }
                        ]
                    }
                ]
            }
        ],
        tools: [
            {
                name: 'preview_screenshot',
                description: 'Take screenshot for preview',
                input_schema: { type: 'object', properties: { serverId: { type: 'string' } } }
            }
        ]
    });

    const userTurnParts = multimodalToolReq.contents[2].parts;
    assert.ok(userTurnParts.some(p => p.functionResponse && p.functionResponse.name === 'preview_screenshot'));
    assert.ok(userTurnParts.some(p => p.inlineData && p.inlineData.mimeType === 'image/jpeg'));
    console.log('   ✓ Native multimodal preview tool results successfully converted to Google parts');


    console.log('\nALL CLAUDE MODEL MAPPING AND EXTENDED THINKING TESTS PASSED!');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
