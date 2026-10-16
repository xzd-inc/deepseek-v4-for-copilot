const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const Module = require('node:module');

class TextPart { constructor(value) { this.value = value; } }
class DataPart { constructor(data, mimeType) { this.data = data; this.mimeType = mimeType; } }
class ToolCallPart { constructor(callId, name, input) { Object.assign(this, { callId, name, input }); } }
class ToolResultPart { constructor(callId, content) { Object.assign(this, { callId, content }); } }
class ThinkingPart { constructor(value) { this.value = value; } }
const settings = new Map();
const vscode = {
	LanguageModelTextPart: TextPart,
	LanguageModelDataPart: DataPart,
	LanguageModelToolCallPart: ToolCallPart,
	LanguageModelToolResultPart: ToolResultPart,
	LanguageModelThinkingPart: ThinkingPart,
	LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
	LanguageModelChatToolMode: { Auto: 1, Required: 2 },
	env: { language: 'en' },
	workspace: { getConfiguration: () => ({ get: (key, fallback) => settings.has(key) ? settings.get(key) : fallback, inspect: () => ({}) }) },
	window: { createOutputChannel: () => ({ info() {}, warn() {}, error() {}, debug() {} }) },
};
const originalLoad = Module._load;
Module._load = function (id, ...args) {
	return id === 'vscode' ? vscode : originalLoad.call(this, id, ...args);
};
const { DeepSeekClient, createResponsesRequestBody, getResponsesUrl } = require('../out/client/core');
const { ResponsesStreamProcessor } = require('../out/client/responseStream');
const { parseResponsesSseBlock, parseResponsesEvent, normalizeResponsesUsage } = require('../out/client/responses');
const { convertMessages, convertResponsesInput } = require('../out/provider/convert');
const { createReplayMarkerPart, parseReplayMarkerData } = require('../out/provider/replay/markers');
const { getConfiguredModels, getEffectiveModelLimits } = require('../out/config');
const { getConfiguredThinkingEffort } = require('../out/provider/models');
const { estimateTokenCount } = require('../out/provider/tokens');
const { streamChatCompletion } = require('../out/provider/stream');
const { prepareChatRequest } = require('../out/provider/request');
Module._load = originalLoad;

function recorder() {
	const result = { text: '', thinking: '', tools: [], reasoning: [], output: [], usage: [], errors: [], done: 0 };
	const callbacks = {
		onContent: (text) => { result.text += text; },
		onThinking: (text) => { result.thinking += text; },
		onToolCall: (call) => result.tools.push(call),
		onReasoningItem: (item) => result.reasoning.push(item),
		onOutputItems: (items) => { result.output = items; },
		onUsage: (usage) => result.usage.push(usage),
		onError: (error) => result.errors.push(error),
		onDone: () => { result.done++; },
	};
	return { result, callbacks, processor: new ResponsesStreamProcessor(callbacks) };
}
const message = (text, id = 'msg_1') => ({
	type: 'message', role: 'assistant', id, status: 'completed',
	content: [{ type: 'output_text', text, annotations: [] }],
});
const reasoning = (id = 'rs_1') => ({
	type: 'reasoning', id, summary: [{ type: 'summary_text', text: 'Checking tools.' }], encrypted_content: 'opaque-reasoning-state',
});
const call = (callId = 'call_a', id = 'fc_1', args = '{"path":"src"}') => ({
	type: 'function_call', id, call_id: callId, name: 'read_file', arguments: args, status: 'completed',
});
const complete = (output, usage) => ({ type: 'response.completed', response: { status: 'completed', output, usage } });
const request = (input = []) => ({ model: 'customendpoint/yundu/gpt-6.1-sol', messages: [], input, stream: true, max_output_tokens: 64000, reasoning: { effort: 'high' }, prompt_cache_key: 'test-key' });
const sse = (event) => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;

// Lifecycle snapshots repeat text already delivered by delta events.
test('SSE parses event names, multiline data, comments and DONE without hiding invalid JSON', () => {
	const block = parseResponsesSseBlock(': keep-alive\r\nevent: response.output_text.delta\r\ndata: {"delta":"hi",\r\ndata: "output_index":0}');
	assert.equal(parseResponsesEvent(block).type, 'response.output_text.delta');
	assert.equal(parseResponsesEvent(parseResponsesSseBlock('data:[DONE]')), 'done');
	assert.throws(() => parseResponsesEvent({ data: '{broken' }), /Invalid JSON/);
	assert.throws(() => parseResponsesEvent({ data: '{"choices":[]}' }), /no event type/);
});

test('text and summary deltas are not duplicated by done events or final output snapshots', () => {
	const { result, processor } = recorder();
	processor.process({ type: 'response.output_item.added', output_index: 0, item: { ...reasoning(), summary: [] } });
	processor.process({ type: 'response.reasoning_summary_text.delta', item_id: 'rs_1', summary_index: 0, delta: 'Checking ' });
	processor.process({ type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 0, delta: 'tools.' });
	processor.process({ type: 'response.reasoning_summary_text.done', output_index: 0, summary_index: 0, text: 'Checking tools.' });
	processor.process({ type: 'response.output_item.done', output_index: 0, item: reasoning() });
	processor.process({ type: 'response.output_item.added', output_index: 1, item: message('') });
	processor.process({ type: 'response.output_text.delta', output_index: 1, content_index: 0, delta: '你好' });
	processor.process({ type: 'response.output_text.done', output_index: 1, content_index: 0, text: '你好 world' });
	processor.process({ type: 'response.output_item.done', output_index: 1, item: message('你好 world') });
	processor.process(complete([reasoning(), message('你好 world')], { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 60 } }));
	processor.process(complete([reasoning(), message('你好 world')]));
	assert.equal(result.text, '你好 world');
	assert.equal(result.thinking, 'Checking tools.');
	assert.deepEqual(result.reasoning, [reasoning()]);
	assert.equal(result.done, 1);
	assert.deepEqual(result.usage, [{ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40 }]);
});

test('interleaved tool arguments use output identity, emit call_id, and never use item id', () => {
	const { result, processor } = recorder();
	processor.process({ type: 'response.output_item.added', output_index: 0, item: call('call_a', 'fc_a', '') });
	processor.process({ type: 'response.output_item.added', output_index: 1, item: call('call_b', 'fc_b', '') });
	processor.process({ type: 'response.function_call_arguments.delta', item_id: 'fc_b', delta: '{"path":' });
	processor.process({ type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"path":"src"}' });
	processor.process({ type: 'response.function_call_arguments.delta', item_id: 'fc_b', delta: '"test"}' });
	processor.process({ type: 'response.function_call_arguments.done', output_index: 0, arguments: '{"path":"src"}' });
	assert.equal(result.tools.length, 0);
	processor.process({ type: 'response.completed', response: { status: 'completed' } });
	assert.deepEqual(result.tools.map((tool) => [tool.id, JSON.parse(tool.function.arguments).path]), [['call_a', 'src'], ['call_b', 'test']]);
});

test('completed snapshots alone recover text, refusals, reasoning and tools', () => {
	const { result, processor } = recorder();
	const refusal = { ...message(''), content: [{ type: 'refusal', refusal: 'Request declined.' }] };
	processor.process(complete([reasoning(), refusal, call()]));
	assert.equal(result.text, 'Request declined.');
	assert.equal(result.thinking, 'Checking tools.');
	assert.equal(result.tools[0].id, 'call_a');
});

test('failed, incomplete, truncated, malformed or invalid tool responses cannot execute tools', () => {
	for (const event of [
		{ type: 'response.failed', response: { error: { message: 'backend failed' } } },
		{ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } },
		{ type: 'error', message: 'rate limited' },
		complete([call('call_a', 'fc_1', '{broken')]),
		complete([call('call_a', 'fc_1', '[]')]),
		complete([call('', 'fc_1')]),
		complete([call(), call('call_a', 'fc_2')]),
		complete([{ type: 'web_search_call' }]),
	]) {
		const { result, processor } = recorder();
		assert.throws(() => processor.process(event));
		assert.equal(result.tools.length, 0);
		assert.equal(result.done, 0);
	}
	assert.throws(() => recorder().processor.assertCompleted(), /incomplete/);
});

test('replay marker retains canonical item order, ids, summary and encrypted reasoning across tool turns', () => {
	const output = [reasoning(), message('Reading files.'), call('call_a', 'fc_1', '{ "path": "src" }'), reasoning('rs_2'), call('call_b', 'fc_2')];
	const marker = createReplayMarkerPart({ outputItems: output });
	assert.deepEqual(parseReplayMarkerData(marker.data).reasoningItems, [reasoning(), reasoning('rs_2')]);
	const history = [
		{ role: 1, content: [new TextPart('Inspect project')] },
		{ role: 2, content: [new ThinkingPart('Checking tools.Checking tools.'), new TextPart('Reading files.'), new ToolCallPart('call_a', 'read_file', { path: 'src' }), new ToolCallPart('call_b', 'read_file', { path: 'src' }), marker] },
		{ role: 1, content: [new ToolResultPart('call_b', [new TextPart('second result')]), new ToolResultPart('call_a', [new TextPart('first result')])] },
	];
	const input = convertResponsesInput(convertMessages(history, true, false));
	assert.deepEqual(input.slice(1, -2), output);
	assert.deepEqual(input.slice(-2), [
		{ type: 'function_call_output', call_id: 'call_b', output: 'second result' },
		{ type: 'function_call_output', call_id: 'call_a', output: 'first result' },
	]);
	assert.equal(input.filter((item) => item.type === 'reasoning').length, 2);
});

test('visible history without a marker never fabricates reasoning items from display summaries', () => {
	const input = convertResponsesInput(convertMessages([{ role: 2, content: [new ThinkingPart('Display summary'), new TextPart('Answer')] }], true, false));
	assert.deepEqual(input, [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Answer' }] }]);
});

test('system messages and native user/tool-result images convert to Responses content parts', () => {
	const image = new DataPart(Uint8Array.of(1, 2, 3), 'image/png');
	const input = convertResponsesInput(convertMessages([
		{ role: 3, content: [new TextPart('System instruction')] },
		{ role: 1, content: [new TextPart('Describe'), image] },
		{ role: 1, content: [new ToolResultPart('call_a', [new TextPart('Screenshot'), image])] },
	], true, true));
	assert.equal(input[0].role, 'system');
	assert.equal(input[1].content[1].type, 'input_image');
	assert.equal(input[2].output[1].image_url, 'data:image/png;base64,AQID');
});

test('wire request uses Responses fields only and explicit non-strict VS Code function schemas', () => {
	const body = createResponsesRequestBody({ ...request(), max_tokens: 1, thinking: { type: 'enabled' }, reasoning_effort: 'max', stream_options: { include_usage: true }, tools: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }], tool_choice: 'required' });
	assert.equal(body.store, false);
	assert.deepEqual(body.include, ['reasoning.encrypted_content']);
	assert.deepEqual(body.reasoning, { effort: 'high', summary: 'auto' });
	assert.equal(body.max_output_tokens, 64000);
	assert.equal(body.prompt_cache_key, 'test-key');
	assert.equal(body.tool_choice, 'required');
	assert.equal(body.tools[0].name, 'read_file');
	assert.equal(body.tools[0].strict, false);
	for (const key of ['messages', 'max_tokens', 'thinking', 'reasoning_effort', 'stream_options']) assert.equal(key in body, false);
	assert.equal(getResponsesUrl('https://example.test/v1/'), 'https://example.test/v1/responses');
	assert.equal(getResponsesUrl('https://example.test/v1/responses?api-version=1'), 'https://example.test/v1/responses?api-version=1');
});

test('usage maps input/output/cache counts without inventing absent usage', () => {
	assert.equal(normalizeResponsesUsage(null), undefined);
	assert.equal(normalizeResponsesUsage({}), undefined);
	assert.deepEqual(normalizeResponsesUsage({ input_tokens: 10, output_tokens: 5, total_tokens: 15 }), { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
});

test('HTTP client posts to /responses and replays reasoning and matching call results on next request', async (t) => {
	const requests = [];
	const output = [reasoning(), call()];
	const server = createServer(async (req, res) => {
		let body = '';
		for await (const chunk of req) body += chunk;
		requests.push({ url: req.url, body: JSON.parse(body), authorization: req.headers.authorization });
		res.writeHead(200, { 'Content-Type': 'text/event-stream' });
		res.end(sse(complete(requests.length === 1 ? output : [message('Done')])));
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(() => new Promise((resolve) => server.close(resolve)));
	const client = new DeepSeekClient(`http://127.0.0.1:${server.address().port}/v1`, 'test-token');
	const first = recorder();
	await client.streamChatCompletion(request(), first.callbacks);
	const marker = createReplayMarkerPart({ outputItems: first.result.output });
	const input = convertResponsesInput(convertMessages([
		{ role: 2, content: [new ToolCallPart('call_a', 'read_file', { path: 'src' }), marker] },
		{ role: 1, content: [new ToolResultPart('call_a', [new TextPart('file content')])] },
	], true, false));
	const second = recorder();
	await client.streamChatCompletion(request(input), second.callbacks);
	assert.equal(requests[0].url, '/v1/responses');
	assert.equal(requests[0].authorization, 'Bearer test-token');
	assert.deepEqual(requests[1].body.input.slice(0, 2), output);
	assert.equal(requests[1].body.input[2].call_id, 'call_a');
	assert.equal(second.result.text, 'Done');
});

test('HTTP stream decoding survives split UTF-8, CRLF and an unterminated final SSE block', async (t) => {
	const originalFetch = global.fetch;
	t.after(() => { global.fetch = originalFetch; });
	const bytes = Buffer.from(sse({ type: 'response.output_text.delta', output_index: 0, delta: '你好' }) + sse(complete([message('你好')])).trimEnd());
	global.fetch = async () => new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
	const { result, callbacks } = recorder();
	await new DeepSeekClient('https://example.test/v1', 'test').streamChatCompletion(request(), callbacks);
	assert.equal(result.text, '你好');
	assert.equal(result.done, 1);
});

test('HTTP errors, truncated streams and callback failures reject without a successful completion', async (t) => {
	const originalFetch = global.fetch;
	t.after(() => { global.fetch = originalFetch; });
	for (const response of [
		new Response('{"error":{"message":"unauthorized"}}', { status: 401 }),
		new Response('data: {broken\n\n'),
		new Response(sse({ type: 'response.output_text.delta', output_index: 0, delta: 'partial' })),
		new Response('data: [DONE]\n\n'),
	]) {
		global.fetch = async () => response;
		const { result, callbacks } = recorder();
		await assert.rejects(new DeepSeekClient('https://example.test/v1', 'test').streamChatCompletion(request(), callbacks));
		assert.equal(result.done, 0);
		assert.equal(result.errors.length, 1);
	}
	global.fetch = async () => new Response(sse(complete([message('hello')])));
	const { callbacks } = recorder();
	await assert.rejects(new DeepSeekClient('https://example.test/v1', 'test').streamChatCompletion(request(), { ...callbacks, onContent: () => { throw new Error('consumer failed'); } }), /consumer failed/);
});

test('configured model limits reserve output within total context and honor reduced output settings', () => {
	settings.clear();
	const model = getConfiguredModels()[0];
	assert.equal(model.name, 'GPT 6.1 Sol');
	assert.equal(model.maxInputTokens, 208000);
	assert.equal(model.maxOutputTokens, 64000);
	assert.equal(model.capabilities.nativeImageInput, true);
	assert.equal(model.capabilities.toolCalling, true);
	settings.set('maxTokens', 16000);
	assert.deepEqual(getEffectiveModelLimits(model), { maxInputTokens: 208000, maxOutputTokens: 16000 });
	assert.equal(getConfiguredModels()[0].maxInputTokens, 256000);
	assert.equal(getConfiguredModels()[0].maxOutputTokens, 16000);
	settings.clear();
});

test('provider request prepares effort, output cap, required tools and stable cache keys', async () => {
	settings.clear();
	const model = getConfiguredModels()[0];
	const base = {
		authManager: { async getApiKey() { return 'test-token'; } },
		modelInfo: model, globalStorageUri: { fsPath: '/unused-test' },
		segment: { id: 'test' },
		messages: [{ role: 3, content: [new TextPart('Stable system prefix')] }, { role: 1, content: [new TextPart('Hello')] }],
		options: { modelOptions: { reasoningEffort: 'max' }, toolMode: 2, tools: [{ name: 'read_file', inputSchema: { type: 'object', properties: {} } }] },
		token: { isCancellationRequested: false },
		cacheDiagnostics: { beginRequest() { return {}; } },
		async getVisionDescriber() { return undefined; },
	};
	const first = await prepareChatRequest(base);
	const second = await prepareChatRequest({ ...base, messages: [...base.messages, { role: 2, content: [new TextPart('Hi')] }, { role: 1, content: [new TextPart('Continue')] }] });
	assert.deepEqual(first.request.reasoning, { effort: 'max' });
	assert.equal(first.request.tool_choice, 'required');
	assert.equal(first.request.max_output_tokens, 64000);
	assert.equal(first.request.prompt_cache_key, second.request.prompt_cache_key);
	assert.equal(first.request.prompt_cache_key.length, 64);
	assert.equal(first.request.input[0].role, 'system');
	await assert.rejects(prepareChatRequest({ ...base, modelInfo: { ...model, id: 'removed-model' } }), /no longer configured/);
	settings.set('models', [{ id: model.id, maxInputTokens: 272000, maxOutputTokens: 32000, toolCalling: true, imageInput: true }]);
	assert.equal((await prepareChatRequest({ ...base, options: { ...base.options, modelOptions: {} } })).request.max_output_tokens, 32000);
	settings.delete('models');
	settings.set('maxTokens', 999999);
	settings.set('promptCacheKey', 'explicit-cache-key');
	assert.equal((await prepareChatRequest(base)).request.max_output_tokens, 64000);
	assert.equal((await prepareChatRequest(base)).request.prompt_cache_key, 'explicit-cache-key');
	settings.set('promptCacheKey', '');
	assert.equal((await prepareChatRequest(base)).request.prompt_cache_key, undefined);
	settings.clear();
});

test('reasoning efforts resolve all supported option paths, reject unsupported values and explicitly disable', () => {
	const capability = { supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high', canDisable: false };
	assert.equal(getConfiguredThinkingEffort({}, capability), 'high');
	for (const options of [
		{ modelOptions: { reasoningEffort: 'max' } },
		{ modelOptions: { reasoning: { effort: 'max' } } },
		{ modelConfiguration: { thinkingLevel: 'max' } },
		{ configuration: { 'reasoning.effort': 'max' } },
	]) assert.equal(getConfiguredThinkingEffort(options, capability), 'max');
	assert.throws(() => getConfiguredThinkingEffort({ modelOptions: { reasoningEffort: 'invalid' } }, capability));
	assert.throws(() => getConfiguredThinkingEffort({ modelOptions: { reasoningEffort: 'none' } }, capability));
	assert.equal(getConfiguredThinkingEffort({ modelOptions: { reasoningEffort: 'none' } }, { ...capability, canDisable: true }), 'none');
	assert.deepEqual(createResponsesRequestBody({ ...request(), reasoning: { effort: 'none' } }).reasoning, { effort: 'none' });
});

test('reasoning usage survives replay and participates in context token estimation', () => {
	const usage = normalizeResponsesUsage({ input_tokens: 100, output_tokens: 90, output_tokens_details: { reasoning_tokens: 80 } });
	assert.equal(usage.reasoning_tokens, 80);
	const marker = createReplayMarkerPart({ outputItems: [reasoning()], reasoningTokens: 80 });
	assert.equal(parseReplayMarkerData(marker.data).reasoningTokens, 80);
	assert.equal(estimateTokenCount({ role: 2, content: [marker] }, 4), 80);
});

test('VS Code stream bridge emits call_id, usage and a replayable marker even without ThinkingPart API', async (t) => {
	const originalThinkingPart = vscode.LanguageModelThinkingPart;
	vscode.LanguageModelThinkingPart = undefined;
	t.after(() => { vscode.LanguageModelThinkingPart = originalThinkingPart; });
	const parts = [];
	let finalDiagnostics;
	const client = { async streamChatCompletion(_request, callbacks) {
		const processor = new ResponsesStreamProcessor(callbacks);
		processor.process(complete([reasoning(), call()], { input_tokens: 100, output_tokens: 30, output_tokens_details: { reasoning_tokens: 20 } }));
	} };
	await streamChatCompletion({
		prepared: {
			client, request: request(), requestKind: 'chat', totalRequestChars: 400,
			trailingToolResultIds: [], hasNativeImages: false, replayMarkerMetadata: {},
			cacheDiagnostics: { onCancellationTokenRequested() {}, onUsage() {}, onReplayMarkerReport() {}, onDone(value) { finalDiagnostics = value; } },
		},
		progress: { report(part) { parts.push(part); } },
		token: { isCancellationRequested: false, onCancellationRequested() { return { dispose() {} }; } },
		getCharsPerToken: () => 4, setCharsPerToken() {},
	});
	assert.equal(parts.find((part) => part instanceof ToolCallPart).callId, 'call_a');
	const marker = parts.find((part) => part instanceof DataPart && part.mimeType !== 'usage');
	assert.deepEqual(parseReplayMarkerData(marker.data).outputItems, [reasoning(), call()]);
	assert.equal(parseReplayMarkerData(marker.data).reasoningTokens, 20);
	assert.equal(finalDiagnostics.emittedToolCalls, 1);
});

test('cancellation aborts fetch without reporting completion or an error', async (t) => {
	const originalFetch = global.fetch;
	t.after(() => { global.fetch = originalFetch; });
	let cancel;
	let disposed = false;
	const token = { isCancellationRequested: false, onCancellationRequested(listener) { cancel = listener; return { dispose() { disposed = true; } }; } };
	global.fetch = async (_url, options) => {
		const result = new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
		token.isCancellationRequested = true;
		cancel();
		return result;
	};
	const { result, callbacks } = recorder();
	await new DeepSeekClient('https://example.test/v1', 'test').streamChatCompletion(request(), callbacks, token);
	assert.equal(result.done, 0);
	assert.equal(result.errors.length, 0);
	assert.equal(disposed, true);
});
