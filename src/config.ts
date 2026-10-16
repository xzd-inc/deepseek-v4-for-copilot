import vscode from 'vscode';
import { CONFIG_SECTION, MODELS } from './consts';
import type { ModelDefinition, ReasoningEffort } from './types';

export type DebugMode = 'minimal' | 'metadata' | 'verbose';

const DEFAULT_BASE_URL = 'https://gd.yundu.lol/v1/responses';
const REASONING_EFFORTS: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

type ContextBoundModel = ModelDefinition & { contextWindowTokens?: number };

/** Return the configured Responses base or full endpoint; the client resolves its path. */
export function getBaseUrl(): string {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const configured = config.get<unknown>('baseUrl', DEFAULT_BASE_URL);
	if (typeof configured !== 'string') {
		throw new Error(`${CONFIG_SECTION}.baseUrl must be a URL string.`);
	}
	const value = configured.trim().replace(/\/+$/u, '') || DEFAULT_BASE_URL;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${CONFIG_SECTION}.baseUrl must be a valid HTTP(S) URL.`);
	}
	if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash) {
		throw new Error(
			`${CONFIG_SECTION}.baseUrl must be an HTTP(S) URL without a query or fragment.`,
		);
	}
	if (url.username || url.password) {
		throw new Error(`${CONFIG_SECTION}.baseUrl must not contain credentials; use Set API Key.`);
	}
	return value;
}

/** Empty disables the cache hint; auto is resolved to a stable key by the request builder. */
export function getPromptCacheKey(): string {
	const value = vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.get<unknown>('promptCacheKey', 'auto');
	if (typeof value !== 'string') {
		throw new Error(`${CONFIG_SECTION}.promptCacheKey must be a string.`);
	}
	return value.trim();
}

/** Configured entries replace the defaults, so retired DeepSeek profiles are never implicit. */
export function getConfiguredModels(): ModelDefinition[] {
	const configured = vscode.workspace.getConfiguration(CONFIG_SECTION).get<unknown>('models');
	const models = configured === undefined ? MODELS : configured;
	if (!Array.isArray(models)) {
		throw new Error(`${CONFIG_SECTION}.models must be an array of model profiles.`);
	}
	const ids = new Set<string>();
	return models.map((value, index) => {
		const path = `${CONFIG_SECTION}.models[${index}]`;
		if (!isRecord(value)) throw new Error(`${path} must be an object.`);
		const id = requiredString(value.id, `${path}.id`);
		if (ids.has(id)) throw new Error(`${path}.id duplicates model "${id}".`);
		ids.add(id);
		const maxInputTokens = positiveInteger(value.maxInputTokens, `${path}.maxInputTokens`);
		const maxOutputTokens = positiveInteger(value.maxOutputTokens, `${path}.maxOutputTokens`);
		const contextWindowTokens =
			value.contextWindowTokens === undefined
				? undefined
				: positiveInteger(value.contextWindowTokens, `${path}.contextWindowTokens`);
		if (contextWindowTokens !== undefined && maxOutputTokens >= contextWindowTokens) {
			throw new Error(`${path}.maxOutputTokens must be smaller than contextWindowTokens.`);
		}

		const capabilities = isRecord(value.capabilities) ? value.capabilities : {};
		const thinkingConfig = isRecord(capabilities.thinking) ? capabilities.thinking : {};
		const efforts = value.supportedReasoningEfforts ?? thinkingConfig.supportedEfforts;
		const thinking = optionalBoolean(
			value.thinking ?? (capabilities.thinking === false ? false : undefined),
			`${path}.thinking`,
			efforts !== undefined,
		);
		let thinkingCapability: ModelDefinition['capabilities']['thinking'] = false;
		if (thinking) {
			if (!Array.isArray(efforts) || efforts.length === 0 || !efforts.every(isReasoningEffort)) {
				throw new Error(
					`${path}.supportedReasoningEfforts must be a non-empty array containing only ${REASONING_EFFORTS.join(', ')}.`,
				);
			}
			if (new Set(efforts).size !== efforts.length) {
				throw new Error(`${path}.supportedReasoningEfforts must not contain duplicates.`);
			}
			const defaultEffort = value.defaultReasoningEffort ?? thinkingConfig.defaultEffort ?? 'high';
			if (!isReasoningEffort(defaultEffort) || !efforts.includes(defaultEffort)) {
				throw new Error(
					`${path}.defaultReasoningEffort must be one of its supportedReasoningEfforts.`,
				);
			}
			thinkingCapability = {
				supportedEfforts: [...efforts],
				defaultEffort,
				canDisable: optionalBoolean(
					value.canDisableReasoning ?? thinkingConfig.canDisable,
					`${path}.canDisableReasoning`,
					false,
				),
			};
		} else if (
			efforts !== undefined ||
			value.defaultReasoningEffort !== undefined ||
			value.canDisableReasoning === true
		) {
			throw new Error(`${path} cannot configure reasoning efforts when thinking is false.`);
		}
		const imageInput = optionalBoolean(
			value.imageInput ?? capabilities.imageInput,
			`${path}.imageInput`,
			false,
		);
		const model: ContextBoundModel = {
			id,
			name: optionalString(value.name, `${path}.name`, id),
			family: optionalString(value.family, `${path}.family`, 'custom'),
			version: optionalString(value.version, `${path}.version`, id),
			detail: optionalString(
				value.detail,
				`${path}.detail`,
				'Configured Responses endpoint profile',
			),
			maxInputTokens,
			maxOutputTokens,
			...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
			capabilities: {
				toolCalling: optionalBoolean(
					value.toolCalling ?? capabilities.toolCalling,
					`${path}.toolCalling`,
					false,
				),
				imageInput,
				nativeImageInput: imageInput,
				thinking: thinkingCapability,
			},
			requiresThinkingParam: false,
		};
		return { ...model, ...getEffectiveModelLimits(model) };
	});
}

/** Reserve output within a declared total context window and honor the user output cap. */
export function getEffectiveModelLimits(
	model: ModelDefinition,
): Pick<ModelDefinition, 'maxInputTokens' | 'maxOutputTokens'> {
	const maxOutputTokens = Math.min(getMaxTokens() ?? model.maxOutputTokens, model.maxOutputTokens);
	const contextWindowTokens = (model as ContextBoundModel).contextWindowTokens;
	return {
		maxInputTokens:
			contextWindowTokens === undefined
				? model.maxInputTokens
				: Math.min(model.maxInputTokens, contextWindowTokens - maxOutputTokens),
		maxOutputTokens,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
	return REASONING_EFFORTS.some((effort) => effort === value);
}

function positiveInteger(value: unknown, path: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${path} must be a finite positive integer.`);
	}
	return value;
}

function requiredString(value: unknown, path: string): string {
	if (typeof value !== 'string' || !value.trim())
		throw new Error(`${path} must be a non-empty string.`);
	return value.trim();
}

function optionalString(value: unknown, path: string, fallback: string): string {
	return value === undefined ? fallback : requiredString(value, path);
}

function optionalBoolean(value: unknown, path: string, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean.`);
	return value;
}

export function getRequestHeaders(): Record<string, string> {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<Record<string, string>>('requestHeaders', {});
}

/**
 * Resolve the API model ID to send to the endpoint.
 *
 * Users can override model IDs via the `modelIdOverrides` setting object
 * (e.g. for third-party API proxies). Falls back to the VS Code model ID
 * when no override is configured.
 */
export function getApiModelId(vscodeModelId: string): string {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const overrides = config.get<Record<string, unknown>>('modelIdOverrides');
	const override =
		overrides && Object.hasOwn(overrides, vscodeModelId) ? overrides[vscodeModelId] : undefined;
	if (override !== undefined && typeof override !== 'string') {
		throw new Error(
			`${CONFIG_SECTION}.modelIdOverrides[${JSON.stringify(vscodeModelId)}] must be a string.`,
		);
	}
	return typeof override === 'string' && override.trim() ? override.trim() : vscodeModelId;
}

/**
 * Get the configured max output tokens limit.
 * Returns `undefined` when set to 0, leaving the limit to the configured model profile.
 */
export function getMaxTokens(): number | undefined {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const value = config.get<unknown>('maxTokens', 0);
	if (value === 0) return undefined;
	return positiveInteger(value, `${CONFIG_SECTION}.maxTokens`);
}

/**
 * Diagnostic mode. `verbose` also enables metadata logs.
 *
 * The legacy boolean `debug` setting is still read as a fallback so old
 * settings keep working even if migration cannot update every scope.
 */
export function getDebugMode(): DebugMode {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const mode = getConfiguredDebugMode(config);
	if (mode) return mode;

	return config.get<boolean>('debug', false) ? 'metadata' : 'minimal';
}

/**
 * Whether to log privacy-preserving diagnostic debug information.
 */
export function getDebugLoggingEnabled(): boolean {
	return getDebugMode() !== 'minimal';
}

/**
 * Whether to write full DeepSeek request payloads to disk.
 */
export function getRequestDumpEnabled(): boolean {
	return getDebugMode() === 'verbose';
}

export function getStabilizeToolListEnabled(): boolean {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<boolean>('experimental.stabilizeToolList', false);
}

/**
 * Migrate the legacy boolean `responses-copilot.debug` setting to `debugMode`.
 *
 * `debug: true` maps to `debugMode: metadata`; `debug: false` maps to the
 * default `minimal`, so it only needs cleanup.
 */
export async function migrateLegacyDebugSetting(): Promise<void> {
	await migrateLegacyDebugSettingAtScope(vscode.ConfigurationTarget.Global);
	if (vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length) {
		await migrateLegacyDebugSettingAtScope(vscode.ConfigurationTarget.Workspace);
	}
}

function getConfiguredDebugMode(config: vscode.WorkspaceConfiguration): DebugMode | undefined {
	const mode = config.inspect<unknown>('debugMode');
	return normalizeDebugMode(mode?.workspaceValue) ?? normalizeDebugMode(mode?.globalValue);
}

function normalizeDebugMode(value: unknown): DebugMode | undefined {
	if (value === 'minimal' || value === 'metadata' || value === 'verbose') {
		return value;
	}
	return undefined;
}

async function migrateLegacyDebugSettingAtScope(
	target: vscode.ConfigurationTarget,
	resource?: vscode.Uri,
): Promise<void> {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION, resource);
	const legacy = config.inspect<boolean>('debug');
	const mode = config.inspect<DebugMode>('debugMode');
	const legacyValue = getScopedValue(legacy, target);

	if (legacyValue === undefined) {
		return;
	}

	if (legacyValue === true && getScopedValue(mode, target) === undefined) {
		await config.update('debugMode', 'metadata', target);
	}
	await config.update('debug', undefined, target);
}

function getScopedValue<T>(
	inspection:
		| {
				globalValue?: T;
				workspaceValue?: T;
				workspaceFolderValue?: T;
		  }
		| undefined,
	target: vscode.ConfigurationTarget,
): T | undefined {
	if (!inspection) {
		return undefined;
	}

	if (target === vscode.ConfigurationTarget.Global) {
		return inspection.globalValue;
	}
	if (target === vscode.ConfigurationTarget.Workspace) {
		return inspection.workspaceValue;
	}
	return undefined;
}
