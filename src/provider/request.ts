import { createHash } from 'crypto';
import vscode from 'vscode';
import { AuthManager } from '../auth';
import { createApiKeyNotConfiguredError, DeepSeekClient } from '../client';
import {
	getApiModelId,
	getBaseUrl,
	getConfiguredModels,
	getMaxTokens,
	getPromptCacheKey,
	getRequestHeaders,
} from '../config';
import type { DeepSeekRequest } from '../types';
import { convertMessages, convertResponsesInput, countMessageChars } from './convert';
import {
	dumpDeepSeekRequest,
	type CacheDiagnosticsRecorder,
	type CacheDiagnosticsRun,
} from './debug';
import { resolveRequestHeaders } from './headers';
import { getConfiguredThinkingEffort, type ModelConfigurationOptions } from './models';
import type { ReplayMarkerMetadata } from './replay';
import { classifyDeepSeekRequest, type RequestKind } from './routing';
import type { ConversationSegment } from './segment';
import { collectTrailingToolResultIds, prepareRequestTools } from './tools/request';
import { collectImageInputSummary } from './images';
import { tokenCalibrationKey } from './tokens';

export interface PreparedChatRequest {
	client: DeepSeekClient;
	request: DeepSeekRequest;
	isThinkingModel: boolean;
	totalRequestChars: number;
	tokenCalibrationKey: string;
	hasNativeImages: boolean;
	trailingToolResultIds: string[];
	cacheDiagnostics: CacheDiagnosticsRun;
	requestKind: RequestKind;
	segment: ConversationSegment;
	replayMarkerMetadata: ReplayMarkerMetadata;
}

export interface PrepareChatRequestOptions {
	authManager: AuthManager;
	globalStorageUri: vscode.Uri;
	storageUri?: vscode.Uri;
	modelInfo: vscode.LanguageModelChatInformation;
	segment: ConversationSegment;
	messages: readonly vscode.LanguageModelChatRequestMessage[];
	options: vscode.ProvideLanguageModelChatResponseOptions;
	cacheDiagnostics: CacheDiagnosticsRecorder;
}

export async function prepareChatRequest({
	authManager,
	globalStorageUri,
	storageUri,
	modelInfo,
	segment,
	messages,
	options,
	cacheDiagnostics,
}: PrepareChatRequestOptions): Promise<PreparedChatRequest> {
	const apiKey = await authManager.getApiKey();
	if (!apiKey) {
		throw createApiKeyNotConfiguredError();
	}

	const baseUrl = getBaseUrl();
	const requestHeaders = resolveRequestHeaders(getRequestHeaders(), options, storageUri);
	const client = new DeepSeekClient(baseUrl, apiKey, requestHeaders);
	const modelDef = getConfiguredModels().find((m) => m.id === modelInfo.id);
	if (!modelDef) {
		throw new Error(
			`Responses model "${modelInfo.id}" is no longer configured; select a configured model.`,
		);
	}
	const thinkingCapability = modelDef.capabilities.thinking;
	const isThinkingModel = Boolean(thinkingCapability);
	const nativeImageInput = modelDef?.capabilities.nativeImageInput === true;
	const configuredMaxTokens = getMaxTokens();
	const maxTokens = Math.min(
		configuredMaxTokens ?? modelDef.maxOutputTokens,
		modelDef.maxOutputTokens,
		modelInfo.maxOutputTokens,
	);
	const imageStats = collectImageInputSummary(messages);
	const hasNativeImages = imageStats.inputImageParts + imageStats.toolResultImageParts > 0;
	if (hasNativeImages && !nativeImageInput) {
		throw new Error(
			'当前模型未启用原生图片输入，请选择多模态模型，或在模型配置中启用 imageInput。',
		);
	}
	const deepseekMessages = convertMessages(messages, isThinkingModel, nativeImageInput);
	const tools = prepareRequestTools(modelDef.capabilities.toolCalling, options);
	const totalRequestChars = countMessageChars(deepseekMessages);
	const apiModelId = getApiModelId(modelInfo.id);
	const baseRequest: DeepSeekRequest = {
		model: apiModelId,
		messages: deepseekMessages,
		input: convertResponsesInput(deepseekMessages),
		stream: true,
		tools,
		tool_choice:
			tools && tools.length > 0
				? options.toolMode === vscode.LanguageModelChatToolMode.Required
					? 'required'
					: 'auto'
				: undefined,
		max_output_tokens: maxTokens,
		prompt_cache_key: resolvePromptCacheKey(apiModelId, deepseekMessages, options),
	};
	const requestKind = classifyDeepSeekRequest({
		request: baseRequest,
		inputMessages: messages,
	});
	const thinkingEffort = thinkingCapability
		? getConfiguredThinkingEffort(options as ModelConfigurationOptions, thinkingCapability)
		: 'none';
	const request: DeepSeekRequest = {
		...baseRequest,
		...(thinkingCapability ? { reasoning: { effort: thinkingEffort } } : {}),
	};
	dumpDeepSeekRequest(request, {
		globalStorageUri,
		segment,
		requestKind,
		vscodeModelId: modelInfo.id,
		isThinkingModel,
		thinkingEffort,
		maxTokens,
		inputMessages: messages,
		resolvedMessages: messages,
		requestOptions: options,
		imageStats,
	});

	const diagnosticsRun = cacheDiagnostics.beginRequest({
		request,
		segment,
		requestKind,
		vscodeModelId: modelInfo.id,
		isThinkingModel,
		thinkingEffort,
		maxTokens,
		inputMessages: messages,
		resolvedMessages: messages,
		imageStats,
	});

	return {
		client,
		request,
		isThinkingModel,
		totalRequestChars,
		hasNativeImages,
		tokenCalibrationKey: tokenCalibrationKey(baseUrl, apiModelId),
		trailingToolResultIds: collectTrailingToolResultIds(deepseekMessages),
		cacheDiagnostics: diagnosticsRun,
		requestKind,
		segment,
		replayMarkerMetadata: {},
	};
}

function resolvePromptCacheKey(
	modelId: string,
	messages: DeepSeekRequest['messages'],
	options: vscode.ProvideLanguageModelChatResponseOptions,
): string | undefined {
	const requestKey = options.modelOptions?.prompt_cache_key ?? options.modelOptions?.promptCacheKey;
	if (typeof requestKey === 'string' && requestKey.trim()) {
		return requestKey.trim();
	}

	const configured = getPromptCacheKey();
	if (configured === '') {
		return undefined;
	}
	if (configured !== 'auto') {
		return configured;
	}

	// A stable non-identifying key improves routing without sending prompt text as a key.
	const prefix = messages.find((message) => message.role === 'system')?.content ?? '';
	return `copilot-${createHash('sha256')
		.update(`${modelId}:${JSON.stringify(prefix)}`)
		.digest('hex')
		.slice(0, 56)}`;
}
