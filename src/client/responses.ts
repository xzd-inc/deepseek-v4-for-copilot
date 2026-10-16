import type { DeepSeekUsage, ResponsesOutputItem, ResponsesReasoningItem } from '../types';

export interface ResponsesSseBlock {
	event?: string;
	data?: string;
}

export interface ResponsesEvent {
	type: string;
	readonly [key: string]: unknown;
}

export function parseResponsesSseBlock(block: string): ResponsesSseBlock {
	let event: string | undefined;
	const data: string[] = [];

	for (const line of block.split(/\r\n|\r|\n/)) {
		if (line.startsWith(':')) {
			continue;
		}
		if (line.startsWith('event:')) {
			event = line.slice('event:'.length).trim() || undefined;
			continue;
		}
		if (line.startsWith('data:')) {
			const value = line.slice('data:'.length);
			data.push(value.startsWith(' ') ? value.slice(1) : value);
		}
	}

	return {
		event,
		data: data.length > 0 ? data.join('\n') : undefined,
	};
}

export function parseResponsesEvent(block: ResponsesSseBlock): ResponsesEvent | 'done' | undefined {
	if (!block.data) {
		return undefined;
	}
	if (block.data.trim() === '[DONE]') {
		return 'done';
	}

	let value: unknown;
	try {
		value = JSON.parse(block.data);
	} catch {
		throw new Error('Invalid JSON in Responses SSE event.');
	}
	if (!isRecord(value)) {
		throw new Error('Responses SSE event must be an object.');
	}
	const type = typeof value.type === 'string' ? value.type : block.event;
	if (!type) {
		throw new Error('Responses SSE event has no event type.');
	}
	return { ...value, type };
}

export function isResponsesReasoningItem(value: unknown): value is ResponsesReasoningItem {
	return (
		isRecord(value) &&
		value.type === 'reasoning' &&
		(value.id === undefined || typeof value.id === 'string') &&
		(value.encrypted_content === undefined ||
			value.encrypted_content === null ||
			typeof value.encrypted_content === 'string') &&
		(value.summary === undefined ||
			(Array.isArray(value.summary) &&
				value.summary.every(
					(part) => isRecord(part) && part.type === 'summary_text' && typeof part.text === 'string',
				)))
	);
}

export function isResponsesOutputItem(value: unknown): value is ResponsesOutputItem {
	if (!isRecord(value) || (value.id !== undefined && typeof value.id !== 'string')) {
		return false;
	}
	if (value.type === 'reasoning') {
		return isResponsesReasoningItem(value);
	}
	if (value.type === 'function_call') {
		return (
			typeof value.call_id === 'string' &&
			typeof value.name === 'string' &&
			typeof value.arguments === 'string'
		);
	}
	return (
		value.type === 'message' &&
		value.role === 'assistant' &&
		Array.isArray(value.content) &&
		value.content.every(
			(part) =>
				isRecord(part) &&
				((part.type === 'output_text' && typeof part.text === 'string') ||
					(part.type === 'refusal' && typeof part.refusal === 'string')),
		)
	);
}

export function normalizeResponsesUsage(value: unknown): DeepSeekUsage | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const promptTokens = getFiniteNumber(value.input_tokens);
	const completionTokens = getFiniteNumber(value.output_tokens);
	const totalTokens = getFiniteNumber(value.total_tokens);
	if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
		return undefined;
	}

	const inputDetails = isRecord(value.input_tokens_details)
		? value.input_tokens_details
		: undefined;
	const cachedTokens =
		getFiniteNumber(inputDetails?.cached_tokens) ?? getFiniteNumber(value.prompt_cache_hit_tokens);
	const prompt = promptTokens ?? 0;
	const completion = completionTokens ?? 0;
	const total = totalTokens ?? prompt + completion;
	const outputDetails = isRecord(value.output_tokens_details)
		? value.output_tokens_details
		: undefined;
	const reasoningTokens = getFiniteNumber(outputDetails?.reasoning_tokens);

	return {
		prompt_tokens: prompt,
		completion_tokens: completion,
		total_tokens: total,
		...(reasoningTokens !== undefined ? { reasoning_tokens: reasoningTokens } : {}),
		...(cachedTokens !== undefined
			? {
					prompt_cache_hit_tokens: cachedTokens,
					prompt_cache_miss_tokens: Math.max(0, prompt - cachedTokens),
				}
			: {}),
	};
}

export function getResponseText(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (!Array.isArray(value)) {
		return '';
	}

	return value
		.map((part) => {
			if (!isRecord(part)) {
				return '';
			}
			if (typeof part.text === 'string') {
				return part.text;
			}
			if (typeof part.refusal === 'string') {
				return part.refusal;
			}
			if (typeof part.content === 'string') {
				return part.content;
			}
			return '';
		})
		.join('');
}

export function getReasoningSummaryText(item: ResponsesReasoningItem): string {
	return (
		item.summary?.map((part) => (part.type === 'summary_text' ? part.text : '')).join('') ?? ''
	);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFiniteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
