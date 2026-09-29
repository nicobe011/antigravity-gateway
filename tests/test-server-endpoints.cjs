/**
 * Test Server Endpoints for Claude Support
 * Tests /v1/models, /models, /v1/messages/count_tokens, /messages/count_tokens, /health
 * Uses in-memory HTTP dispatch to verify Express routing without requiring open network sockets.
 */

const assert = require('assert');
const http = require('http');
const net = require('net');

function dispatch(app, method, url, body = null, headers = {}) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const req = new http.IncomingMessage(socket);
        req.method = method;
        req.url = url;
        const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
        req.headers = {
            host: 'localhost',
            ...(bodyStr ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(bodyStr).toString()
            } : {}),
            ...headers
        };

        const res = new http.ServerResponse(req);
        let responseData = '';

        res.assignSocket(socket);

        socket.write = (chunk, encoding, cb) => {
            if (chunk) responseData += chunk.toString();
            if (typeof encoding === 'function') encoding();
            else if (typeof cb === 'function') cb();
            return true;
        };
        socket.destroy = () => {};
        socket.cork = () => {};
        socket.uncork = () => {};

        res.on('finish', () => {
            const splitIndex = responseData.indexOf('\r\n\r\n');
            const bodyStrRes = splitIndex !== -1 ? responseData.slice(splitIndex + 4) : responseData;
            resolve({
                status: res.statusCode,
                statusCode: res.statusCode,
                headers: res.getHeaders(),
                body: bodyStrRes,
                json: () => JSON.parse(bodyStrRes)
            });
        });

        app(req, res);

        if (bodyStr) {
            req.push(bodyStr);
        }
        req.push(null);
    });
}

async function testServerEndpoints() {
    console.log('Testing Express server endpoints for Claude...');
    const { default: app } = await import('../src/server.js');

    // 1. Test /v1/messages/count_tokens
    console.log('1. Testing POST /v1/messages/count_tokens...');
    const countRes = await dispatch(app, 'POST', '/v1/messages/count_tokens', {
        model: 'claude-3-7-sonnet-20250219',
        messages: [{ role: 'user', content: 'Hello world' }]
    });

    assert.strictEqual(countRes.status, 200);
    const countData = countRes.json();
    assert.ok(typeof countData.input_tokens === 'number');
    assert.ok(countData.input_tokens > 0);
    console.log(`   ✓ /v1/messages/count_tokens returned: ${JSON.stringify(countData)}`);

    // 2. Test /messages/count_tokens alias
    console.log('2. Testing POST /messages/count_tokens alias...');
    const countAliasRes = await dispatch(app, 'POST', '/messages/count_tokens', {
        model: 'claude-fake',
        messages: [{ role: 'user', content: 'Testing fake claude model token count' }]
    });

    assert.strictEqual(countAliasRes.status, 200);
    const countAliasData = countAliasRes.json();
    assert.ok(countAliasData.input_tokens > 0);
    console.log(`   ✓ /messages/count_tokens alias returned: ${JSON.stringify(countAliasData)}`);

    // 3. Test GET /v1/models
    console.log('3. Testing GET /v1/models...');
    const modelsRes = await dispatch(app, 'GET', '/v1/models');
    assert.strictEqual(modelsRes.status, 200);
    const modelsData = modelsRes.json();
    assert.ok(Array.isArray(modelsData.data));
    assert.ok(modelsData.data.length > 0);
    assert.strictEqual(modelsData.data[0].type, 'model');
    assert.ok(modelsData.data[0].display_name);
    assert.strictEqual(modelsData.has_more, false);
    console.log(`   ✓ /v1/models returned ${modelsData.data.length} models with Anthropic & OpenAI fields`);

    // 4. Test GET /v1/v1/models (nested /v1 prefix as seen in Claude client)
    console.log('4. Testing GET /v1/v1/models (nested client prefix)...');
    const nestedModelsRes = await dispatch(app, 'GET', '/v1/v1/models');
    assert.strictEqual(nestedModelsRes.status, 200);
    const nestedModelsData = nestedModelsRes.json();
    assert.strictEqual(nestedModelsData.data.length, modelsData.data.length);
    console.log(`   ✓ /v1/v1/models normalized and returned HTTP 200 successfully`);

    // 5. Test GET /models alias
    console.log('5. Testing GET /models alias...');
    const plainModelsRes = await dispatch(app, 'GET', '/models');
    assert.strictEqual(plainModelsRes.status, 200);
    const plainModelsData = plainModelsRes.json();
    assert.strictEqual(plainModelsData.data.length, modelsData.data.length);
    console.log(`   ✓ /models alias returned HTTP 200 successfully`);

    // 6. Test GET /health
    console.log('6. Testing GET /health...');
    const healthRes = await dispatch(app, 'GET', '/health');
    assert.strictEqual(healthRes.status, 200);
    const healthData = healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    console.log(`   ✓ /health returned: ${JSON.stringify(healthData)}`);

    console.log('\nALL SERVER ENDPOINT TESTS PASSED!');
}

testServerEndpoints().catch(err => {
    console.error('Server endpoint test failed:', err);
    process.exit(1);
});
