import type { CancellationToken } from 'vscode';
import { safeStringify } from '../json';
import { logger } from '../logger';
import type { DeepSeekRequest, StreamCallbacks } from '../types';
import { createHttpError, formatRequestError, normalizeRequestError } from './error';
import { ResponsesStreamProcessor } from './responseStream';
import { parseResponsesEvent, parseResponsesSseBlock } from './responses';

/** Stateless Responses client: complete output items are replayed by the provider. */
export class DeepSeekClient {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string,
		private readonly requestHeaders: Readonly<Record<string, string>> = {},
	) {}

	async streamChatCompletion(
		request: DeepSeekRequest,
		callbacks: StreamCallbacks,
		cancellationToken?: CancellationToken,
	): Promise<void> {
		const controller = new AbortController();
		const cancelListener = cancellationToken?.onCancellationRequested(() => controller.abort());
		if (cancellationToken?.isCancellationRequested) {
			controller.abort();
		}

		try {
			const headers = new Headers({
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
				Authorization: `Bearer ${this.apiKey}`,
			});
			for (const [name, value] of Object.entries(this.requestHeaders)) {
				headers.set(name, value);
			}
			const response = await fetch(getResponsesUrl(this.baseUrl), {
				method: 'POST',
				headers,
				body: safeStringify(createResponsesRequestBody(request)),
				signal: controller.signal,
			});
			if (!response.ok) {
				throw await createHttpError(response, { baseUrl: this.baseUrl, request });
			}
			if (!response.body) {
				throw new Error('No Responses body received.');
			}

			const processor = new ResponsesStreamProcessor(callbacks);
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			const processBlock = (block: string): void => {
				const event = parseResponsesEvent(parseResponsesSseBlock(block));
				if (event === 'done') {
					processor.assertCompleted();
				} else if (event) {
					processor.process(event);
				}
			};
			try {
				while (!processor.isCompleted) {
					if (cancellationToken?.isCancellationRequested) {
						return;
					}
					const { done, value } = await reader.read();
					buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
					let separator: RegExpMatchArray | null;
					while ((separator = buffer.match(/\r\n\r\n|\n\n|\r\r/))) {
						const index = separator.index!;
						processBlock(buffer.slice(0, index));
						buffer = buffer.slice(index + separator[0].length);
						if (processor.isCompleted) {
							break;
						}
					}
					if (done) {
						if (buffer.trim() && !processor.isCompleted) {
							processBlock(buffer);
						}
						break;
					}
				}
				processor.assertCompleted();
			} finally {
				await reader.cancel().catch(() => undefined);
				reader.releaseLock();
			}
		} catch (error) {
			if (cancellationToken?.isCancellationRequested) {
				return;
			}
			const normalizedError = normalizeRequestError(error, { baseUrl: this.baseUrl, request });
			logger.error('Responses request failed:', formatRequestError(normalizedError));
			callbacks.onError(normalizedError);
			throw normalizedError;
		} finally {
			cancelListener?.dispose();
		}
	}
}

export function getResponsesUrl(baseUrl: string): string {
	const url = new URL(baseUrl);
	const path = url.pathname.replace(/\/+$/, '');
	url.pathname = path.endsWith('/responses') ? path : `${path}/responses`;
	return url.toString();
}

export function createResponsesRequestBody(request: DeepSeekRequest): Record<string, unknown> {
	return {
		model: request.model,
		input: request.input,
		stream: true,
		store: false,
		...(request.reasoning
			? {
					reasoning: {
						...request.reasoning,
						...(request.reasoning.effort !== 'none' ? { summary: 'auto' } : {}),
					},
				}
			: {}),
		...(request.reasoning || request.input.some((item) => item.type === 'reasoning')
			? { include: ['reasoning.encrypted_content'] }
			: {}),
		...(request.max_output_tokens !== undefined
			? { max_output_tokens: request.max_output_tokens }
			: {}),
		...(request.prompt_cache_key ? { prompt_cache_key: request.prompt_cache_key } : {}),
		...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
		...(request.top_p !== undefined ? { top_p: request.top_p } : {}),
		...(request.tools?.length
			? {
					tools: request.tools.map((tool) => ({
						type: tool.type,
						...tool.function,
						strict: false,
					})),
					tool_choice: request.tool_choice ?? 'auto',
				}
			: {}),
	};
}
