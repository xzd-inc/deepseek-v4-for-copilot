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
import {
	finalizeVisionResolutionStats,
	prepareVisionMessages,
	type VisionDescriber,
} from './vision';

export interface PreparedChatRequest {
	client: DeepSeekClient;
	request: DeepSeekRequest;
	isThinkingModel: boolean;
	totalRequestChars: number;
	hasNativeImages: boolean;
	trailingToolResultIds: string[];
	cacheDiagnostics: CacheDiagnosticsRun;
	requestKind: RequestKind;
	segment: ConversationSegment;
	replayMarkerMetadata: ReplayMarkerMetadata;
	visionMarkerTextChars?: number;
	initialResponseNotice?: string;
}

export interface PrepareChatRequestOptions {
	authManager: AuthManager;
	globalStorageUri: vscode.Uri;
	storageUri?: vscode.Uri;
	modelInfo: vscode.LanguageModelChatInformation;
	segment: ConversationSegment;
	messages: readonly vscode.LanguageModelChatRequestMessage[];
	options: vscode.ProvideLanguageModelChatResponseOptions;
	token: vscode.CancellationToken;
	cacheDiagnostics: CacheDiagnosticsRecorder;
	getVisionDescriber: () => Promise<VisionDescriber | undefined>;
}

export async function prepareChatRequest({
	authManager,
	globalStorageUri,
	storageUri,
	modelInfo,
	segment,
	messages,
	options,
	token,
	cacheDiagnostics,
	getVisionDescriber,
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
	const visionResolution = await prepareVisionMessages({
		messages,
		nativeImageInput,
		token,
		getDescriber: getVisionDescriber,
	});

	const resolvedMessages = visionResolution.messages;

	const deepseekMessages = convertMessages(resolvedMessages, isThinkingModel, nativeImageInput);
	finalizeVisionResolutionStats(visionResolution.stats, deepseekMessages);
	const tools = prepareRequestTools(modelDef?.capabilities.toolCalling, options);

	const totalRequestChars = countMessageChars(deepseekMessages);
	const hasNativeImages =
		visionResolution.stats.imageHandlingMode === 'native' &&
		visionResolution.stats.input.forwardedImageParts +
			visionResolution.stats.tool.forwardedImageParts >
			0;
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
		resolvedMessages,
		requestOptions: options,
		visionModelId: visionResolution.visionModelId,
		visionProxySource: visionResolution.visionProxySource,
		visionStats: visionResolution.stats,
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
		resolvedMessages,
		visionModelId: visionResolution.visionModelId,
		visionProxySource: visionResolution.visionProxySource,
		visionStats: visionResolution.stats,
	});

	return {
		client,
		request,
		isThinkingModel,
		totalRequestChars,
		hasNativeImages,
		trailingToolResultIds: collectTrailingToolResultIds(deepseekMessages),
		cacheDiagnostics: diagnosticsRun,
		requestKind,
		segment,
		replayMarkerMetadata: visionResolution.replayMarkerMetadata,
		visionMarkerTextChars: visionResolution.stats.markerVisionTextChars || undefined,
		initialResponseNotice: visionResolution.initialResponseNotice,
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
