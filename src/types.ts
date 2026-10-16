/**
 * Shared types for the Responses for Copilot extension.
 *
 * Historical DeepSeek-prefixed internal type names are retained; the public
 * extension identity and wire protocol use Responses.
 */

// ---- API request/response types ----

/** Reasoning efforts accepted by the Responses API model registry. */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface DeepSeekTextContentPart {
	type: 'text';
	text: string;
}

export interface DeepSeekImageUrlContentPart {
	type: 'image_url';
	image_url: {
		url: string;
	};
}

export type DeepSeekContentPart = DeepSeekTextContentPart | DeepSeekImageUrlContentPart;

export interface ResponsesInputTextPart {
	type: 'input_text';
	text: string;
}

export interface ResponsesInputImagePart {
	type: 'input_image';
	image_url: string;
	detail?: 'auto' | 'low' | 'high';
}

export interface ResponsesOutputTextPart {
	type: 'output_text';
	text: string;
}

export interface ResponsesRefusalPart {
	type: 'refusal';
	refusal: string;
}

export type ResponsesMessageContentPart =
	| ResponsesInputTextPart
	| ResponsesInputImagePart
	| ResponsesOutputTextPart
	| ResponsesRefusalPart;

export interface ResponsesMessageItem {
	type: 'message';
	role: 'system' | 'developer' | 'user' | 'assistant';
	content: ResponsesMessageContentPart[];
	status?: string;
	id?: string;
}

export interface ResponsesReasoningSummaryPart {
	type: 'summary_text';
	text: string;
}

/** A reasoning output item that must be replayed verbatim across turns. */
export interface ResponsesReasoningItem {
	type: 'reasoning';
	id?: string;
	summary?: ResponsesReasoningSummaryPart[];
	encrypted_content?: string | null;
	status?: string;
	readonly [key: string]: unknown;
}

export interface ResponsesFunctionCallItem {
	type: 'function_call';
	id?: string;
	call_id: string;
	name: string;
	arguments: string;
	status?: string;
}

export interface ResponsesFunctionCallOutputItem {
	type: 'function_call_output';
	call_id: string;
	output: string | (ResponsesInputTextPart | ResponsesInputImagePart)[];
	status?: string;
}

export type ResponsesInputItem =
	| ResponsesMessageItem
	| ResponsesReasoningItem
	| ResponsesFunctionCallItem
	| ResponsesFunctionCallOutputItem;

export interface ResponsesTool {
	type: 'function';
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
	strict?: boolean;
}

export interface ResponsesOutputMessageItem extends ResponsesMessageItem {
	role: 'assistant';
	id?: string;
}

export type ResponsesOutputItem =
	| ResponsesOutputMessageItem
	| ResponsesReasoningItem
	| ResponsesFunctionCallItem;

export interface DeepSeekMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | DeepSeekContentPart[];
	tool_call_id?: string;
	tool_calls?: DeepSeekToolCall[];
	reasoning_content?: string;
	/** Internal replay metadata; never sent as a chat-completions field. */
	responsesReasoningItems?: ResponsesReasoningItem[];
	responsesOutputItems?: ResponsesOutputItem[];
}

export interface DeepSeekToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

/** Legacy internal tool shape; converted to a flat Responses function tool on the wire. */
export interface DeepSeekTool {
	type: 'function';
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
	};
}

export interface DeepSeekUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	prompt_cache_hit_tokens?: number;
	prompt_cache_miss_tokens?: number;
	reasoning_tokens?: number;
}

export interface DeepSeekRequest {
	model: string;
	/** Internal chat-shaped history retained for diagnostics and classification. */
	messages: DeepSeekMessage[];
	/** The actual OpenAI Responses input item list sent by the client. */
	input: ResponsesInputItem[];
	stream: boolean;
	temperature?: number;
	top_p?: number;
	max_output_tokens?: number;
	tools?: DeepSeekTool[];
	tool_choice?: 'none' | 'auto' | 'required';
	reasoning?: { effort: ReasoningEffort };
	prompt_cache_key?: string;
}

// ---- Stream callbacks ----

export interface StreamCallbacks {
	onContent: (content: string) => void;
	onThinking: (text: string) => void;
	onToolCall: (toolCall: DeepSeekToolCall) => void;
	onReasoningItem?: (item: ResponsesReasoningItem) => void;
	onOutputItems?: (items: ResponsesOutputItem[]) => void;
	onError: (error: Error) => void;
	onDone: () => void;
	onUsage?: (usage: DeepSeekUsage) => void;
}

// ---- Model definitions ----

export type PricingCurrency = 'USD' | 'CNY';

export type PriceCategory = 'low' | 'medium' | 'high' | 'very_high';

export interface ModelPricing {
	cacheHitInput: number;
	cacheMissInput: number;
	output: number;
}

/** Current DeepSeek prices for the peak and off-peak billing periods. */
export interface ModelPricingSchedule {
	offPeak: ModelPricing;
	peak: ModelPricing;
}

export interface ThinkingCapability {
	/** Effort values this model implements and may receive in API requests. */
	supportedEfforts: readonly ReasoningEffort[];
	defaultEffort: ReasoningEffort;
	canDisable: boolean;
}

export interface ModelDefinition {
	id: string;
	name: string;
	family: string;
	version: string;
	detail: string;
	maxInputTokens: number;
	maxOutputTokens: number;
	contextWindowTokens?: number;
	capabilities: {
		toolCalling: boolean;
		imageInput: boolean;
		nativeImageInput?: boolean;
		thinking: ThinkingCapability | false;
	};
	requiresThinkingParam: boolean;
	pricing?: Readonly<Record<PricingCurrency, ModelPricingSchedule>>;
	priceCategory?: PriceCategory;
}
