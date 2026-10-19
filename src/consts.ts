import type { ModelDefinition } from './types';

/**
 * Compile-time constants shared across the extension.
 *
 * These do NOT depend on the VS Code runtime (no workspace configuration,
 * no secrets API). For run-time settings reads see `config.ts`.
 */

/** VS Code configuration section prefix for all extension settings. */
export const CONFIG_SECTION = 'responses-copilot';
export const MODEL_VENDOR = 'responses-copilot';

export const EXTERNAL_URLS = {
	deepseek: {
		apiKeys: 'https://platform.deepseek.com/api_keys',
		usage: 'https://platform.deepseek.com/usage',
		status: 'https://status.deepseek.com',
	},
} as const;

/** URI path handled by this extension to reveal the output log. */
export const SHOW_LOGS_URI_PATH = '/showLogs';

/** URI path handled by this extension to open API key configuration. */
export const CONFIGURE_API_KEY_URI_PATH = '/setApiKey';

// VS Code's internal LanguageModelChatMessageRole.System is not exposed in @types/vscode.
export const LANGUAGE_MODEL_CHAT_SYSTEM_ROLE = 3;

// ---- Secret keys ----

/** SecretStorage key for the configured Responses endpoint API key. */
export const API_KEY_SECRET = 'responses-copilot.apiKey';

/** memento key tracking whether the welcome walkthrough has been shown. */
export const WELCOME_SHOWN_KEY = 'responses-copilot.welcomeShown';

// ---- Walkthrough ----

/** Walkthrough contribution ID. */
export const WALKTHROUGH_ID = 'responses-local.responses-for-copilot#responsesGettingStarted';

// ---- Model registry ----

/** User-supplied endpoint profile, not independently verified public model specifications. */
export const MODELS: (ModelDefinition & { contextWindowTokens?: number })[] = [
	{
		id: 'gpt-6.1-sol',
		name: 'GPT 6.1 Sol',
		family: 'gpt',
		version: '6.1-sol',
		detail: '用户配置的 Responses 模型',
		maxInputTokens: 272000,
		maxOutputTokens: 64000,
		contextWindowTokens: 272000,
		capabilities: {
			toolCalling: true,
			imageInput: true,
			nativeImageInput: true,
			thinking: {
				supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
				defaultEffort: 'high',
				canDisable: false,
			},
		},
		requiresThinkingParam: false,
	},
];
