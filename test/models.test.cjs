const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const manifest = require('../package.json');
const defaults = manifest.contributes.configuration.properties['responses-copilot.models'].default;
const extra = { id: 'custom-model', name: 'Custom model', maxInputTokens: 120000, maxOutputTokens: 8000 };
let globalModels;
let workspaceModels;
let writes;
let answers;
let choices;
let inputIndex;
let pickIndex;
let onInput;
const configuration = {
	get(key, fallback) {
		if (key === 'models') return workspaceModels ?? globalModels ?? defaults;
		return fallback;
	},
	inspect(key) {
		return key === 'models' ? { defaultValue: defaults, globalValue: globalModels, workspaceValue: workspaceModels } : {};
	},
	async update(key, value, target) {
		writes.push({ key, value, target });
		if (target === 2) workspaceModels = value;
		else globalModels = value;
	},
};
const vscode = {
	env: { language: 'en' },
	ConfigurationTarget: { Global: 1, Workspace: 2 },
	workspace: { getConfiguration() { return configuration; } },
	window: {
		async showQuickPick(items) {
			const selected = choices[pickIndex++];
			if (selected === undefined) return undefined;
			const find = (value) => items.find((item) => (item.id ?? item.label) === value);
			return Array.isArray(selected) ? selected.map(find) : find(selected);
		},
		async showInputBox(options) {
			await onInput?.(options, inputIndex);
			const answer = answers[inputIndex++];
			if (answer !== undefined) assert.equal(await options.validateInput(answer), undefined);
			return answer;
		},
		showInformationMessage() {},
	},
	commands: { async executeCommand(command, args) { writes.push({ command, args }); } },
};
const originalLoad = Module._load;
Module._load = function(id, ...args) { return id === 'vscode' ? vscode : originalLoad.call(this, id, ...args); };
const { manageModels } = require('../out/runtime/models');
const { parseModelProfiles } = require('../out/config');
const { toChatInfo } = require('../out/provider/models');
const { TokenCalibration, tokenCalibrationKey } = require('../out/provider/tokens');
Module._load = originalLoad;

function reset() {
	globalModels = undefined;
	workspaceModels = undefined;
	writes = [];
	answers = ['custom-model', 'Custom model', '120000', '8000', '128000'];
	choices = ['add', ['toolCalling', 'imageInput', 'thinking'], ['medium', 'high'], 'medium'];
	inputIndex = 0;
	pickIndex = 0;
	onInput = undefined;
}

test('native model wizard preserves defaults and writes a validated independent profile', async () => {
	reset();
	await manageModels();
	assert.equal(writes.length, 1);
	assert.equal(writes[0].target, 1);
	assert.deepEqual(writes[0].value.slice(0, -1), defaults);
	const model = parseModelProfiles(writes[0].value).at(-1);
	assert.equal(model.id, 'custom-model');
	assert.equal(model.maxInputTokens, 120000);
	assert.equal(model.maxOutputTokens, 8000);
	assert.equal(model.capabilities.toolCalling, true);
	assert.equal(model.capabilities.nativeImageInput, true);
	assert.deepEqual(model.capabilities.thinking, { supportedEfforts: ['medium', 'high'], defaultEffort: 'medium', canDisable: false });
});

test('wizard preserves workspace scope and edits made while the wizard is open', async () => {
	reset();
	workspaceModels = [...defaults];
	globalModels = [{ ...extra, id: 'user-only' }];
	onInput = (_options, index) => { if (index === 4) workspaceModels.push({ ...extra, id: 'concurrent' }); };
	await manageModels();
	assert.equal(writes[0].target, 2);
	assert.deepEqual(writes[0].value.map((item) => item.id), [...defaults.map((item) => item.id), 'concurrent', 'custom-model']);
	assert.equal(globalModels[0].id, 'user-only');
});

test('wizard cancellation at every step leaves settings unchanged', async () => {
	for (let step = 0; step < 5; step++) {
		reset();
		answers[step] = undefined;
		await manageModels();
		assert.deepEqual(writes, []);
	}
	for (let step = 0; step < 4; step++) {
		reset();
		choices[step] = undefined;
		await manageModels();
		assert.deepEqual(writes, []);
	}
});

test('wizard validates duplicate IDs, integer limits and shared context reservations', async () => {
	reset();
	onInput = (options, index) => {
		if (index === 0) {
			assert.ok(options.validateInput(` ${defaults[0].id} `));
			assert.ok(options.validateInput(' '));
		}
		if (index === 2) for (const value of ['0', '-1', '1.5', 'Infinity', '9007199254740992']) assert.ok(options.validateInput(value));
		if (index === 4) {
			assert.ok(options.validateInput('8000'));
			assert.equal(options.validateInput(''), undefined);
		}
	};
	await manageModels();
});

test('wizard detects concurrent duplicate IDs and scope changes before saving', async () => {
	reset();
	onInput = (_options, index) => { if (index === 4) globalModels = [...defaults, extra]; };
	await assert.rejects(manageModels(), /已由其他操作添加/);
	assert.deepEqual(writes, []);
	reset();
	onInput = (_options, index) => { if (index === 4) workspaceModels = [...defaults]; };
	await assert.rejects(manageModels(), /配置范围已改变/);
	assert.deepEqual(writes, []);
});

test('wizard permits an empty registry and a text-only model without reasoning', async () => {
	reset();
	globalModels = [];
	answers[4] = '';
	choices[1] = [];
	await manageModels();
	assert.equal(globalModels.length, 1);
	assert.equal(globalModels[0].contextWindowTokens, undefined);
	const model = parseModelProfiles(globalModels)[0];
	assert.equal(model.capabilities.thinking, false);
	assert.equal(model.capabilities.imageInput, false);
	assert.equal(model.capabilities.toolCalling, false);
});

test('model editor opens the effective configuration scope without changing settings', async () => {
	reset();
	choices = ['edit'];
	await manageModels();
	assert.equal(writes[0].command, 'workbench.action.openSettingsJson');
	reset();
	workspaceModels = [];
	choices = ['edit'];
	await manageModels();
	assert.equal(writes[0].command, 'workbench.action.openWorkspaceSettingsFile');
});

test('custom names and details are honored even for the bundled model ID', () => {
	reset();
	const model = parseModelProfiles([{ ...defaults[0], name: 'Deployment A', detail: 'Custom profile description' }])[0];
	const info = toChatInfo(model, true, undefined, new Date(), false);
	assert.equal(info.name, 'Deployment A');
	assert.equal(info.detail, 'Custom profile description');
	assert.equal(info.tooltip, 'Custom profile description');
});

test('token calibration isolates endpoints and transmitted model IDs with bounded retention', () => {
	const calibration = new TokenCalibration();
	const a = tokenCalibrationKey('https://a.test/v1', 'model-a');
	const b = tokenCalibrationKey('https://a.test/v1', 'model-b');
	const c = tokenCalibrationKey('https://b.test/v1', 'model-a');
	calibration.set(a, 2);
	calibration.set(b, 3);
	assert.equal(calibration.get(a), 2);
	assert.equal(calibration.get(b), 3);
	assert.equal(calibration.get(c), 4);
	calibration.set(a, Infinity);
	assert.equal(calibration.get(a), 2);
	for (let i = 0; i < 32; i++) calibration.set(`extra-${i}`, 1);
	assert.equal(calibration.get(a), 4);
	assert.equal(calibration.get(b), 4);
});
