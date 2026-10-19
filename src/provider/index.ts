import vscode from 'vscode';
import { AuthManager } from '../auth';
import {
	getApiModelId,
	getBaseUrl,
	getConfiguredModels,
	getStabilizeToolListEnabled,
} from '../config';
import { isOfficialDeepSeekBaseUrl, normalizeBaseUrl } from '../endpoint';
import { t } from '../i18n';
import { logger } from '../logger';
import { createCacheDiagnosticsRecorder, dumpProviderInput } from './debug';
import { toChatInfo } from './models';
import { BalanceCurrencyResolver } from './pricing/currency';
import { PricingRefreshScheduler } from './pricing/schedule';
import { prepareChatRequest } from './request';
import { classifyProviderRequest } from './routing';
import { resolveConversationSegment } from './segment';
import { streamChatCompletion } from './stream';
import { estimateTokenCount, TokenCalibration, tokenCalibrationKey } from './tokens';
import { processToolFlow } from './tools/flow';

/**
 * Responses Chat Provider — exposes configured Responses models in Copilot Chat.
 */
export class DeepSeekChatProvider implements vscode.LanguageModelChatProvider {
	private readonly authManager: AuthManager;
	private readonly globalStorageUri: vscode.Uri;
	private readonly storageUri: vscode.Uri | undefined;
	private readonly onDidChangeLanguageModelChatInformationEmitter = new vscode.EventEmitter<void>();

	readonly onDidChangeLanguageModelChatInformation =
		this.onDidChangeLanguageModelChatInformationEmitter.event;

	private readonly cacheDiagnostics = createCacheDiagnosticsRecorder();

	private readonly balanceCurrencyResolver: BalanceCurrencyResolver;
	private readonly pricingRefreshScheduler: PricingRefreshScheduler;

	private readonly tokenCalibration = new TokenCalibration();

	constructor(context: vscode.ExtensionContext) {
		this.authManager = new AuthManager(context);
		this.globalStorageUri = context.globalStorageUri;
		this.storageUri = context.storageUri;
		this.balanceCurrencyResolver = new BalanceCurrencyResolver(context, this.authManager, () =>
			this.onDidChangeLanguageModelChatInformationEmitter.fire(),
		);
		this.pricingRefreshScheduler = new PricingRefreshScheduler(() =>
			this.onDidChangeLanguageModelChatInformationEmitter.fire(),
		);

		context.subscriptions.push(
			this.onDidChangeLanguageModelChatInformationEmitter,
			this.pricingRefreshScheduler,
			// Settings-based fallback API key + base URL changes.
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (
					e.affectsConfiguration('responses-copilot.apiKey') ||
					e.affectsConfiguration('responses-copilot.baseUrl')
				) {
					this.invalidateCurrencyAndRefreshModels();
				} else if (
					e.affectsConfiguration('responses-copilot.modelIdOverrides') ||
					e.affectsConfiguration('responses-copilot.models') ||
					e.affectsConfiguration('responses-copilot.maxTokens')
				) {
					this.refreshModelPicker();
				}
			}),
			// Multi-window: SecretStorage changes don't fire onDidChangeConfiguration.
			// When another window sets/clears the API key, refresh this window's
			// model picker so the warning state stays in sync.
			context.secrets.onDidChange((e) => {
				if (e.key === 'responses-copilot.apiKey') {
					this.invalidateCurrencyAndRefreshModels();
				}
			}),
		);
	}

	// ---- Public commands ----

	async configureApiKey(): Promise<void> {
		const saved = await this.authManager.promptForApiKey();
		if (saved) {
			this.invalidateCurrencyAndRefreshModels();
		}
	}

	async clearApiKey(): Promise<void> {
		const clearAction = t('auth.clearAction');
		const selected = await vscode.window.showWarningMessage(
			t('auth.clearConfirm'),
			{ modal: true, detail: t('auth.clearDetail') },
			clearAction,
		);
		if (selected !== clearAction) {
			return;
		}

		await this.authManager.deleteApiKey();
		this.invalidateCurrencyAndRefreshModels();
		vscode.window.showInformationMessage(t('auth.removed'));
	}

	async hasApiKey(): Promise<boolean> {
		return this.authManager.hasApiKey();
	}

	/** Force Copilot Chat to re-query model information (including configurationSchema). */
	refreshModelPicker(): void {
		this.onDidChangeLanguageModelChatInformationEmitter.fire();
	}

	private invalidateCurrencyAndRefreshModels(): void {
		void this.balanceCurrencyResolver
			.invalidate()
			.catch((error) => logger.warn('Failed to invalidate DeepSeek balance currency', error))
			.finally(() => this.onDidChangeLanguageModelChatInformationEmitter.fire());
	}

	// ---- LanguageModelChatProvider ----

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelChatInformation[]> {
		const hasKey = await this.authManager.hasApiKey();
		const pricingCurrency = this.balanceCurrencyResolver.getDisplayCurrency();
		const isOfficialEndpoint = isOfficialDeepSeekBaseUrl(normalizeBaseUrl(getBaseUrl()));
		const now = new Date();
		if (hasKey) {
			this.balanceCurrencyResolver.refreshInBackground();
		}
		return getConfiguredModels().map((model) =>
			toChatInfo(
				model,
				hasKey,
				pricingCurrency,
				now,
				isOfficialEndpoint && getApiModelId(model.id) === model.id,
			),
		);
	}

	async provideLanguageModelChatResponse(
		modelInfo: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const segment = resolveConversationSegment(messages);
		const requestKind = classifyProviderRequest({
			messages,
			tools: options.tools,
		});

		dumpProviderInput({
			globalStorageUri: this.globalStorageUri,
			segment,
			modelInfo,
			messages,
			requestOptions: options,
			requestKind,
		});

		const toolFlow = processToolFlow({
			stabilizeToolList: getStabilizeToolListEnabled(),
			messages,
			tools: options.tools,
			progress,
			requestKind,
		});
		if (toolFlow.preflightHandled) {
			return;
		}

		const prepared = await prepareChatRequest({
			authManager: this.authManager,
			globalStorageUri: this.globalStorageUri,
			storageUri: this.storageUri,
			modelInfo,
			segment,
			messages: toolFlow.messages,
			options,
			cacheDiagnostics: this.cacheDiagnostics,
		});

		return streamChatCompletion({
			prepared,
			progress,
			token,
			initialResponseNotice: toolFlow.initialResponseNotice,
			getCharsPerToken: () => this.tokenCalibration.get(prepared.tokenCalibrationKey),
			setCharsPerToken: (charsPerToken) => {
				this.tokenCalibration.set(prepared.tokenCalibrationKey, charsPerToken);
			},
		});
	}

	async provideTokenCount(
		modelInfo: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		return estimateTokenCount(
			text,
			this.tokenCalibration.get(tokenCalibrationKey(getBaseUrl(), getApiModelId(modelInfo.id))),
		);
	}
}
