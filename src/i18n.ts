/**
 * Lightweight i18n module — zero dependencies, using Simplified Chinese by default.
 */

function isZh(): boolean {
	return true;
}

// ---- Translation dictionaries ----

type Translations = Record<string, string>;

const zh: Translations = {
	// Model descriptions
	'model.gpt-6.1-sol.detail': '用户提供的 Responses 模型配置',
	'model.gpt-6.1-sol.tooltip':
		'该模型的能力与令牌限制来自用户提供的端点配置，并非独立验证的公开模型规格。',
	'model.deepseek-flash.detail': '图像理解与思考模式',
	'model.deepseek-flash.tooltip': 'DeepSeek V4.1 Flash，支持图片与文本输入、思考模式和工具调用。',
	'model.retirement.custom':
		'**旧模型入口。**  \n请先确认服务商支持 DeepSeek V4.1 Flash。  \n选择“DeepSeek V4.1 Flash”以使用新模型。',
	'model.retirement.flashRetired':
		'**已下线。**  \n请求由 DeepSeek V4.1 Flash 提供服务，并按 Flash 价格计费。  \n选择“DeepSeek V4.1 Flash”以使用新模型。',
	'model.flash.detail': '快速高效',
	'model.pro.detail': '深度推理',
	'model.flash-vision-exp.detail': '原生视觉实验模型',
	'model.flash.tooltip': '快速高效的 DeepSeek V4 模型，推理能力接近 V4 Pro，API 定价更经济。',
	'model.pro.tooltip': 'DeepSeek V4 模型，面向 Agent 编程、广泛世界知识和高阶推理任务。',
	'model.pricing.currentPeak': '高峰时段',
	'model.pricing.currentOffPeak': '空闲时段',
	'model.pricing.inputLabel': '输入',
	'model.pricing.cacheHitInputLabel': '输入 (缓存命中)',
	'model.pricing.outputLabel': '输出',
	'model.pricing.unitSuffix': ' / 百万 tokens',
	'model.pricing.periodStarts': '{1}进入{0}',
	'model.pricing.transitionTime.today': '{0}',
	'model.pricing.transitionTime.tomorrow': '明天 {0}',
	'model.pricing.transitionTime.weekday': '{0} {1}',
	'model.flash-vision-exp.tooltip': 'DeepSeek V4 Flash 视觉实验模型，支持原生图片与文本输入。',

	// API Key
	'auth.apiKeyRequiredDetail': '请先配置 API Key',
	'auth.prompt': '请输入所配置 Responses 端点的 API Key 或服务商令牌。',
	'auth.placeholder': 'sk-... 或服务商令牌',
	'auth.emptyValidation': 'API Key 不能为空',
	'auth.saved': 'API Key 已安全保存。',
	'auth.removed': 'API Key 已移除。',
	'auth.clearConfirm': '清除已保存的 API Key？',
	'auth.clearDetail': '清除后，再次使用时可能需要重新设置 API Key。',
	'auth.clearAction': '清除 API Key',
	'auth.notConfigured': '尚未配置 API Key，请先设置 API Key 后重试。',

	// Settings
	'settings.resetBaseUrl.title': '恢复 Responses Base URL 默认配置',
	'settings.resetBaseUrl.chooseScope': '选择要重置的范围；仅移除该范围的自定义地址',
	'settings.resetBaseUrl.user': '用户设置',
	'settings.resetBaseUrl.workspace': '当前工作区',
	'settings.resetBaseUrl.current': '当前配置：{0}',
	'settings.resetBaseUrl.notConfigured': '未自定义，无需重置',
	'settings.resetBaseUrl.after': '重置后生效地址：{0}',
	'settings.resetBaseUrl.afterInherited': '重置后继承其余配置，实际生效地址请查看设置',
	'settings.resetBaseUrl.failed':
		'重置 Base URL 失败，请运行 "Responses for Copilot: 显示日志" 查看详情。',

	// Thinking Effort — short labels for model picker dropdown
	'status.thinking': '思考模式',
	'thinking.none': '停用',
	'thinking.none.desc': '停用推理，仅适用于明确支持此选项的后端',
	'thinking.low': '低',
	'thinking.low.desc': '请求较低的推理强度',
	'thinking.medium': '中',
	'thinking.medium.desc': '请求中等推理强度',
	'thinking.high': '高',
	'thinking.high.desc': '请求高推理强度，默认配置',
	'thinking.xhigh': '更高',
	'thinking.xhigh.desc': '请求更高的推理强度',
	'thinking.max': '最高',
	'thinking.max.desc': '请求端点配置允许的最高推理强度',
	'thinking.unsupported': '不支持思考强度“{0}”。此模型允许的值：{1}。',

	// Request
	'request.preflightRoundLimitExceeded':
		'实验性稳定工具列表设置已尝试 {0} 轮，仍无法得到稳定的已启用工具列表。请关闭该实验性设置，或先用 VS Code 的 Configure Tools 关闭不常用的工具。',
	'notice.toolDrift':
		'⚠️ 工具列表不稳定，缓存命中率可能下降。[了解更多](https://github.com/Vizards/deepseek-v4-for-copilot/blob/main/docs/notices/tool-drift.zh.md)',

	// Errors
	'error.http.400': '[{0}] 请求体格式错误。请根据错误信息提示修改请求体。',
	'error.http.401':
		'[{0}] API Key 错误，认证失败。请检查您的 API Key 是否正确。如没有 API key，请先创建 API Key。',
	'error.http.401.withCreateApiKeyLink':
		'[{0}] API Key 错误，认证失败。请检查您的 API Key 是否正确。如没有 API key，请先[创建 API Key]({1})。',
	'error.http.402': '[{0}] 账号余额不足。请确认账户余额，并前往充值页面进行充值。',
	'error.http.422': '[{0}] 请求体参数错误。请根据错误信息提示修改相关参数。',
	'error.http.429': '[{0}] 请求速率（TPM 或 RPM）达到上限。请合理规划您的请求速率。',
	'error.http.500': '[{0}] 服务器内部故障。请等待后重试。',
	'error.http.503': '[{0}] 服务器负载过高。请稍后重试您的请求。',
	'error.http.generic': '[{0}] 服务返回错误响应。',
	'error.action.setApiKey': '设置 API Key',
	'error.action.createApiKey': '创建 API Key',
	'error.action.viewUsage': '用量',
	'error.action.checkDeepSeekStatus': 'DeepSeek 状态',
	'error.action.viewDetails': '错误详情',
	'error.network.dns': '[{0}] DNS 解析失败。请检查网络连接、防火墙或代理设置，以及自定义 baseUrl。',
	'error.network.unreachable':
		'[{0}] 目标不可达或拒绝连接。请检查自定义 baseUrl、代理服务、网络连接或防火墙设置。',
	'error.network.interrupted': '[{0}] 连接被中断。请检查网络连接、防火墙或代理设置，或稍后重试。',
	'error.network.timeout': '[{0}] 连接超时。请稍后重试，或检查网络连接、防火墙或代理设置。',
	'error.network.tls': '[{0}] TLS/证书校验失败。请检查代理、证书配置或自定义 baseUrl。',
	'error.network.aborted':
		'[{0}] 请求已中止。如果不是主动取消，请检查网络连接或代理设置，或稍后重试。',
	'error.network.protocol':
		'[{0}] HTTP 连接或响应解析失败。请检查代理设置、自定义 baseUrl 或服务响应。',
	'error.network.configuration': '[{0}] 请求配置无效。请检查自定义 baseUrl 或扩展设置。',
	'error.network.generic':
		'[{0}] 网络请求失败。请检查网络连接、防火墙或代理设置，以及自定义 baseUrl。',
	'error.unknown': 'Responses 请求失败：{0}',

	// Extension
	'extension.activateFailed':
		'Responses for Copilot 激活失败，请运行 "Responses for Copilot: 显示日志" 查看详情。',
	'extension.welcomeFailed': '欢迎引导加载异常',
	'extension.openRequestDumpsFolderFailed':
		'打开请求 dump 目录失败，请运行 "Responses for Copilot: 显示日志" 查看详情。',
};

const en: Translations = {
	// Model descriptions
	'model.gpt-6.1-sol.detail': 'User-supplied Responses model profile',
	'model.gpt-6.1-sol.tooltip':
		"This model's capabilities and token limits come from a user-supplied endpoint profile, not independently verified public specifications.",
	'model.deepseek-flash.detail': 'Vision and thinking mode',
	'model.deepseek-flash.tooltip':
		'DeepSeek V4.1 Flash with image and text input, thinking mode, and tool calling.',
	'model.retirement.custom':
		'**Legacy model entry.**  \nCheck that your provider supports DeepSeek V4.1 Flash.  \nSelect “DeepSeek V4.1 Flash” to use the new model.',
	'model.retirement.flashRetired':
		'**Retired.**  \nRequests are served by DeepSeek V4.1 Flash and billed at the Flash price.  \nSelect “DeepSeek V4.1 Flash” to use the new model.',
	'model.flash.detail': 'Fast, general-purpose model',
	'model.pro.detail': 'Most capable reasoning model',
	'model.flash-vision-exp.detail': 'Experimental native vision model',
	'model.flash.tooltip':
		'Fast, efficient DeepSeek V4 model with reasoning close to V4 Pro and economical API pricing.',
	'model.pro.tooltip':
		'DeepSeek V4 model for agentic coding, broad world knowledge, and high-end reasoning.',
	'model.pricing.currentPeak': 'Peak',
	'model.pricing.currentOffPeak': 'Off-peak',
	'model.pricing.inputLabel': 'Input',
	'model.pricing.cacheHitInputLabel': 'Cache Input',
	'model.pricing.outputLabel': 'Output',
	'model.pricing.unitSuffix': ' per 1M tokens',
	'model.pricing.periodStarts': '{0} starts {1}',
	'model.pricing.transitionTime.today': 'at {0}',
	'model.pricing.transitionTime.tomorrow': 'tomorrow at {0}',
	'model.pricing.transitionTime.weekday': 'on {0} at {1}',
	'model.flash-vision-exp.tooltip':
		'Experimental DeepSeek V4 Flash vision model with native image and text input.',

	// API Key
	'auth.apiKeyRequiredDetail': 'Please run Responses for Copilot: Set API Key to configure.',
	'auth.prompt': 'Enter the API key or provider token for your configured Responses endpoint.',
	'auth.placeholder': 'sk-... or provider token',
	'auth.emptyValidation': 'API key cannot be empty',
	'auth.saved': 'API key saved securely.',
	'auth.removed': 'API key removed.',
	'auth.clearConfirm': 'Clear the saved API Key?',
	'auth.clearDetail': 'You may need to set an API Key again before using the extension.',
	'auth.clearAction': 'Clear API Key',
	'auth.notConfigured':
		'API key is not configured. Run Responses for Copilot: Set API Key and try again.',

	// Settings
	'settings.resetBaseUrl.title': 'Reset Responses Base URL',
	'settings.resetBaseUrl.chooseScope': 'Choose a scope; only its custom URL will be removed',
	'settings.resetBaseUrl.user': 'User Settings',
	'settings.resetBaseUrl.workspace': 'Current Workspace',
	'settings.resetBaseUrl.current': 'Configured URL: {0}',
	'settings.resetBaseUrl.notConfigured': 'Not customized; no reset needed',
	'settings.resetBaseUrl.after': 'Effective URL after reset: {0}',
	'settings.resetBaseUrl.afterInherited':
		'Inherits remaining configuration after reset; check Settings for the effective URL',
	'settings.resetBaseUrl.failed':
		'Failed to reset Base URL. Run "Responses for Copilot: Show Logs" for details.',

	// Thinking Effort
	'status.thinking': 'Thinking Effort',
	'thinking.none': 'None',
	'thinking.none.desc': 'Disable reasoning only when explicitly supported by the backend',
	'thinking.low': 'Low',
	'thinking.low.desc': 'Request low reasoning effort',
	'thinking.medium': 'Medium',
	'thinking.medium.desc': 'Request medium reasoning effort',
	'thinking.high': 'High',
	'thinking.high.desc': 'Request high reasoning effort, the default profile setting',
	'thinking.xhigh': 'Extra High',
	'thinking.xhigh.desc': 'Request extra-high reasoning effort',
	'thinking.max': 'Max',
	'thinking.max.desc': 'Request the highest reasoning effort declared by the endpoint profile',
	'thinking.unsupported': 'Unsupported reasoning effort "{0}". This model supports: {1}.',

	// Request
	'request.preflightRoundLimitExceeded':
		'Experimental tool-list stabilization tried {0} rounds but still could not get a stable enabled-tools list. Turn this experimental setting off, or use VS Code Configure Tools to disable tools you rarely use first.',
	'notice.toolDrift':
		'⚠️ Tool list is unstable; cache hit rate may drop. [Learn more](https://github.com/Vizards/deepseek-v4-for-copilot/blob/main/docs/notices/tool-drift.en.md)',

	// Errors
	'error.http.400':
		'[{0}] Invalid request body format. Please modify your request body according to the hints in the error message.',
	'error.http.401':
		"[{0}] Authentication fails due to the wrong API key. Please check your API key. If you don't have one, please create an API key first.",
	'error.http.401.withCreateApiKeyLink':
		"[{0}] Authentication fails due to the wrong API key. Please check your API key. If you don't have one, please [create an API key]({1}) first.",
	'error.http.402':
		"[{0}] You have run out of balance. Please check your account's balance, and go to the Top up page to add funds.",
	'error.http.422':
		'[{0}] Your request contains invalid parameters. Please modify your request parameters according to the hints in the error message.',
	'error.http.429':
		'[{0}] You are sending requests too quickly. Please pace your requests reasonably.',
	'error.http.500':
		'[{0}] Our server encounters an issue. Please retry your request after a brief wait.',
	'error.http.503':
		'[{0}] The server is overloaded due to high traffic. Please retry your request after a brief wait.',
	'error.http.generic': '[{0}] The service returned an error response.',
	'error.action.setApiKey': 'Set API Key',
	'error.action.createApiKey': 'Create API Key',
	'error.action.viewUsage': 'Usage',
	'error.action.checkDeepSeekStatus': 'DeepSeek Status',
	'error.action.viewDetails': 'Error Details',
	'error.network.dns':
		'[{0}] DNS lookup failed. Check your network connection, firewall, or proxy settings, and your custom baseUrl.',
	'error.network.unreachable':
		'[{0}] The target is unreachable or refused the connection. Check your custom baseUrl, proxy service, network connection, or firewall settings.',
	'error.network.interrupted':
		'[{0}] The connection was interrupted. Check your network connection, firewall, or proxy settings, or try again later.',
	'error.network.timeout':
		'[{0}] Connection timed out. Try again later, or check your network connection, firewall, or proxy settings.',
	'error.network.tls':
		'[{0}] TLS/certificate verification failed. Check your proxy settings, certificate configuration, or custom baseUrl.',
	'error.network.aborted':
		'[{0}] The request was aborted. If you did not cancel it, check your network connection or proxy settings, or try again later.',
	'error.network.protocol':
		'[{0}] The HTTP connection or response parsing failed. Check your proxy settings, custom baseUrl, or service response.',
	'error.network.configuration':
		'[{0}] The request configuration is invalid. Check your custom baseUrl or extension settings.',
	'error.network.generic':
		'[{0}] Network request failed. Check your network connection, firewall, or proxy settings, and your custom baseUrl.',
	'error.unknown': 'Responses request failed: {0}',

	// Extension
	'extension.activateFailed':
		'Responses for Copilot failed to activate. Run "Responses for Copilot: Show Logs" for details.',
	'extension.welcomeFailed': 'Failed to show Responses for Copilot welcome prompt',
	'extension.openRequestDumpsFolderFailed':
		'Failed to open request dumps folder. Run "Responses for Copilot: Show Logs" for details.',
};

/**
 * Resolve a translation key for the current VS Code display language.
 * Supports positional placeholders {0}, {1}, ...
 */
export function t(key: string, ...args: (string | number)[]): string {
	const dict = isZh() ? zh : en;
	let text = dict[key];
	if (text === undefined) {
		// Fall back to English when a key is missing from the active locale.
		text = en[key];
	}
	if (text === undefined) {
		return key;
	}
	// Replace all occurrences of each positional placeholder.
	for (let i = 0; i < args.length; i++) {
		text = text.replaceAll(`{${i}}`, String(args[i]));
	}
	return text;
}
