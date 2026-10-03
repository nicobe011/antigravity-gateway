/**
 * Test OpenCode Zen Integration, Image Graceful Fallback, and History Compactor
 */

const assert = require('assert');

async function runTests() {
    console.log('Testing OpenCode Zen Integration & Graceful Image Fallback...');

    // 1. Dynamic imports
    const {
        isOpenCodeZenModel,
        resolveOpenCodeZenModel,
        getOpenCodeZenModelMetadata
    } = await import('../src/opencode/zen-client.js');

    const {
        convertAnthropicToOpenCodeZen,
        convertOpenCodeZenToAnthropic
    } = await import('../src/opencode/request-converter.js');

    const { compactHistoryIfNeeded } = await import('../src/format/history-compactor.js');

    // 2. Model Detection and Resolution
    console.log('1. Testing OpenCode Zen model resolution...');
    assert.strictEqual(isOpenCodeZenModel('opencode/mimo-v2.6-flash-free'), true);
    assert.strictEqual(isOpenCodeZenModel('opencode/muse-spark-1.3-contributor-free'), true);
    assert.strictEqual(isOpenCodeZenModel('claude-mimo-v2.6-flash'), false); // canonical check
    assert.strictEqual(resolveOpenCodeZenModel('claude-mimo-v2.6-flash'), 'opencode/mimo-v2.6-flash-free');
    assert.strictEqual(resolveOpenCodeZenModel('mimo-v2.5-free'), 'opencode/mimo-v2.6-flash-free'); // legacy alias
    assert.strictEqual(resolveOpenCodeZenModel('claude-muse-spark'), 'opencode/muse-spark-1.3-contributor-free');
    console.log('   ✓ Model resolution passed');

    // 3. Graceful Image Handling (Text-only model: Ling 3.1 Flash Free)
    console.log('2. Testing graceful image fallback for text-only model...');
    const nemotronReq = convertAnthropicToOpenCodeZen({
        model: 'opencode/ling-3.1-flash-free',
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analise este arquivo:' },
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/png',
                            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
                        }
                    }
                ]
            }
        ]
    });

    assert.ok(nemotronReq.messages.length > 0);
    const userMsg = nemotronReq.messages[0];
    assert.ok(Array.isArray(userMsg.content));
    // Must NOT have image_url block to prevent API 400 rejection on text-only models
    assert.strictEqual(userMsg.content.some(c => c.type === 'image_url'), false);
    // Must have graceful system note in text to preserve conversation continuity
    assert.ok(userMsg.content.some(c => c.type === 'text' && c.text.includes('opera exclusivamente em modo texto')));
    console.log('   ✓ Graceful image fallback preserved conversation history without API 400 rejection');

    // 4. Vision Model (Muse Spark 1.3 Free)
    console.log('3. Testing image preservation for vision model...');
    const museReq = convertAnthropicToOpenCodeZen({
        model: 'opencode/muse-spark-1.3-contributor-free',
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/png',
                            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
                        }
                    }
                ]
            }
        ]
    });

    const museUserMsg = museReq.messages[0];
    assert.ok(Array.isArray(museUserMsg.content));
    assert.ok(museUserMsg.content.some(c => c.type === 'image_url'));
    console.log('   ✓ Vision model correctly preserves native image_url block');

    // 5. Native History Compaction
    console.log('4. Testing native history compaction...');
    const longConversation = [];
    longConversation.push({ role: 'user', content: 'Qual é o objetivo inicial do projeto?' });
    longConversation.push({ role: 'assistant', content: 'O objetivo é construir uma gateway unificada.' });

    for (let i = 0; i < 20; i++) {
        longConversation.push({ role: 'user', content: `Pergunta intermediária número ${i}: detalhe o código com muito texto. ` + 'palavra '.repeat(500) });
        longConversation.push({ role: 'assistant', content: `Resposta detalhada intermediária número ${i}: aqui está o código. ` + 'codigo '.repeat(500) });
    }

    longConversation.push({ role: 'user', content: 'Última pergunta da conversa ativa.' });

    const compacted = compactHistoryIfNeeded({
        model: 'opencode/mimo-v2.6-flash-free',
        messages: longConversation
    }, 20000); // 20k target limit to trigger compaction

    assert.ok(compacted.messages.length < longConversation.length);
    assert.ok(compacted.messages.some(m => typeof m.content === 'string' && m.content.includes('CONTEXTO COMPACTADO AUTOMATICAMENTE')));
    assert.strictEqual(compacted.messages[compacted.messages.length - 1].content, 'Última pergunta da conversa ativa.');
    console.log(`   ✓ Compaction reduced ${longConversation.length} turns to ${compacted.messages.length} structured turns`);

    console.log('\nALL OPENCODE ZEN INTEGRATION TESTS PASSED!');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
