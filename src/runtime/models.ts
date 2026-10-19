import vscode from 'vscode';
import { CONFIG_SECTION } from '../consts';
import { parseModelProfiles } from '../config';

export async function manageModels(): Promise<void> {
	const action = await vscode.window.showQuickPick(
		[
			{ label: '添加模型', id: 'add', description: '保留现有模型，追加新的 Responses 模型配置' },
			{ label: '编辑模型配置', id: 'edit', description: '编辑模型列表、能力与令牌限制' },
		],
		{ title: 'Responses for Copilot：管理模型', ignoreFocusOut: true },
	);
	if (!action) return;
	if (action.id === 'edit') {
		const inspection = vscode.workspace.getConfiguration(CONFIG_SECTION).inspect('models');
		await vscode.commands.executeCommand(
			inspection?.workspaceValue === undefined
				? 'workbench.action.openSettingsJson'
				: 'workbench.action.openWorkspaceSettingsFile',
			{ revealSetting: { key: `${CONFIG_SECTION}.models`, edit: true } },
		);
		return;
	}

	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const inspection = config.inspect<unknown[]>('models');
	const hasWorkspaceModels = inspection?.workspaceValue !== undefined;
	const profiles = config.get<unknown[]>('models', []);
	const parsedProfiles = parseModelProfiles(profiles);
	const id = await vscode.window.showInputBox({
		title: '添加 Responses 模型：模型 ID',
		prompt: '填写服务商实际接受的模型 ID；多个模型使用当前配置的端点和 API Key。',
		ignoreFocusOut: true,
		validateInput: (value) => {
			if (!value.trim()) return '模型 ID 不能为空。';
			if (parsedProfiles.some((profile) => profile.id === value.trim())) {
				return '模型 ID 已存在，请编辑现有配置。';
			}
			return undefined;
		},
	});
	if (id === undefined) return;
	const name = await vscode.window.showInputBox({
		title: '添加 Responses 模型：显示名称',
		value: id.trim(),
		ignoreFocusOut: true,
		validateInput: (value) => (value.trim() ? undefined : '显示名称不能为空。'),
	});
	if (name === undefined) return;
	const input = await readLimit(
		'最大输入令牌数',
		'填写服务商声明的输入上限，不使用其他模型的规格。',
	);
	if (input === undefined) return;
	const output = await readLimit('最大输出令牌数', '填写服务商声明的输出上限，包含推理令牌额度。');
	if (output === undefined) return;
	const context = await readLimit(
		'合计上下文令牌数（可选）',
		'若输入与输出共享上下文，填写合计上限；仅在两者可独立使用时留空。',
		true,
		output,
	);
	if (context === undefined) return;
	const capabilities = await vscode.window.showQuickPick(
		[
			{ label: '工具调用', id: 'toolCalling' },
			{ label: '原生图片输入', id: 'imageInput' },
			{ label: '推理强度配置', id: 'thinking' },
		],
		{
			title: '添加 Responses 模型：选择后端明确支持的能力',
			canPickMany: true,
			ignoreFocusOut: true,
		},
	);
	if (capabilities === undefined) return;
	const enabled = new Set(capabilities.map((capability) => capability.id));
	let reasoning: Record<string, unknown> = {};
	if (enabled.has('thinking')) {
		const efforts = await vscode.window.showQuickPick(
			['low', 'medium', 'high', 'xhigh', 'max'].map((effort) => ({ label: effort })),
			{ title: '选择此模型支持的推理强度', canPickMany: true, ignoreFocusOut: true },
		);
		if (!efforts?.length) return;
		const defaultEffort = await vscode.window.showQuickPick(efforts, {
			title: '选择默认推理强度',
			ignoreFocusOut: true,
		});
		if (!defaultEffort) return;
		reasoning = {
			thinking: true,
			supportedReasoningEfforts: efforts.map((effort) => effort.label),
			defaultReasoningEffort: defaultEffort.label,
		};
	}

	// Re-read after the wizard so another settings edit is never overwritten.
	const latest = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const latestProfiles = latest.get<unknown[]>('models', []);
	const parsedLatest = parseModelProfiles(latestProfiles);
	if (parsedLatest.some((profile) => profile.id === id.trim())) {
		throw new Error('该模型已由其他操作添加，请重新打开模型管理。');
	}
	const latestInspection = latest.inspect<unknown[]>('models');
	if ((latestInspection?.workspaceValue !== undefined) !== hasWorkspaceModels) {
		throw new Error('模型配置范围已改变，请重新打开模型管理。');
	}
	if (latestInspection?.workspaceFolderValue !== undefined) {
		throw new Error('当前文件夹有独立模型配置，请使用“编辑模型配置”修改。');
	}
	const updatedProfiles = [
		...latestProfiles,
		{
			id: id.trim(),
			name: name.trim(),
			maxInputTokens: input,
			maxOutputTokens: output,
			...(context > 0 ? { contextWindowTokens: context } : {}),
			toolCalling: enabled.has('toolCalling'),
			imageInput: enabled.has('imageInput'),
			...reasoning,
		},
	];
	parseModelProfiles(updatedProfiles);
	await latest.update(
		'models',
		updatedProfiles,
		hasWorkspaceModels ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global,
	);
	vscode.window.showInformationMessage(`已添加 ${name.trim()}，模型选择器将自动刷新。`);
}

async function readLimit(
	label: string,
	prompt: string,
	optional = false,
	minimum = 0,
): Promise<number | undefined> {
	const value = await vscode.window.showInputBox({
		title: `添加 Responses 模型：${label}`,
		prompt,
		ignoreFocusOut: true,
		validateInput: (text) => {
			if (optional && !text.trim()) return undefined;
			const number = Number(text);
			return /^\d+$/u.test(text.trim()) && Number.isSafeInteger(number) && number > minimum
				? undefined
				: `请填写大于 ${minimum} 的正整数。`;
		},
	});
	return value === undefined ? undefined : Number(value);
}
