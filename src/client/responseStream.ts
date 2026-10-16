import type { ResponsesOutputItem, StreamCallbacks } from '../types';
import {
	isRecord,
	isResponsesOutputItem,
	normalizeResponsesUsage,
	type ResponsesEvent,
} from './responses';

/** Tracks Responses output indexes, item ids, and call ids as separate identities. */
export class ResponsesStreamProcessor {
	private readonly items = new Map<number, ResponsesOutputItem>();
	private readonly itemIndexes = new Map<string, number>();
	private readonly text = new Map<string, string>();
	private completed = false;

	constructor(private readonly callbacks: StreamCallbacks) {}

	get isCompleted(): boolean {
		return this.completed;
	}

	process(event: ResponsesEvent): void {
		if (this.completed) {
			return;
		}
		switch (event.type) {
			case 'response.output_item.added':
				this.rememberItem(event.output_index, event.item, false);
				break;
			case 'response.output_item.done':
				this.rememberItem(event.output_index, event.item, true);
				break;
			case 'response.output_text.delta':
			case 'response.refusal.delta':
				this.appendText(event, false);
				break;
			case 'response.reasoning_summary_text.delta':
				this.appendText(event, true);
				break;
			case 'response.output_text.done':
			case 'response.refusal.done':
				this.completeText(event, false);
				break;
			case 'response.reasoning_summary_text.done':
				this.completeText(event, true);
				break;
			case 'response.function_call_arguments.delta':
			case 'response.function_call_arguments.done': {
				const index = this.getIndex(event);
				const item = this.items.get(index);
				if (item?.type !== 'function_call') {
					throw new Error('Responses tool arguments have no matching function_call item.');
				}
				if (event.type.endsWith('.delta') && typeof event.delta === 'string') {
					item.arguments += event.delta;
				} else if (typeof event.arguments === 'string') {
					item.arguments = event.arguments;
				}
				break;
			}
			case 'response.completed':
				this.complete(event.response);
				break;
			case 'response.failed':
			case 'response.incomplete': {
				const response = isRecord(event.response) ? event.response : {};
				const error = isRecord(response.error) ? response.error : {};
				const details = isRecord(response.incomplete_details) ? response.incomplete_details : {};
				throw new Error(
					`Responses ${event.type.slice('response.'.length)}: ${String(error.message ?? details.reason ?? response.status ?? 'generation failed')}`,
				);
			}
			case 'error': {
				const error = isRecord(event.error) ? event.error : event;
				throw new Error(
					`Responses error: ${String(error.message ?? error.code ?? 'unknown error')}`,
				);
			}
		}
	}

	assertCompleted(): void {
		if (!this.completed) {
			throw new Error(
				'Responses stream ended before response.completed; the response is incomplete.',
			);
		}
	}

	private getIndex(event: ResponsesEvent): number {
		if (typeof event.output_index === 'number' && Number.isSafeInteger(event.output_index)) {
			return event.output_index;
		}
		if (typeof event.item_id === 'string') {
			const index = this.itemIndexes.get(event.item_id);
			if (index !== undefined) {
				return index;
			}
		}
		throw new Error(`Responses event ${event.type} has no output item identity.`);
	}

	private rememberItem(index: unknown, value: unknown, done: boolean): void {
		if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
			throw new Error('Responses output item has an invalid output_index.');
		}
		if (!isResponsesOutputItem(value)) {
			throw new Error(
				`Unsupported Responses output item: ${isRecord(value) ? String(value.type) : 'invalid item'}`,
			);
		}
		this.items.set(index, structuredClone(value));
		if (value.id) {
			this.itemIndexes.set(value.id, index);
		}
		if (!done) {
			return;
		}
		if (value.type === 'message') {
			for (const [contentIndex, part] of value.content.entries()) {
				if (part.type === 'output_text') {
					this.reportText(`${index}:text:${contentIndex}`, part.text, false, true);
				} else if (part.type === 'refusal') {
					this.reportText(`${index}:refusal:${contentIndex}`, part.refusal, false, true);
				}
			}
		} else if (value.type === 'reasoning') {
			for (const [summaryIndex, part] of (value.summary ?? []).entries()) {
				this.reportText(`${index}:summary:${summaryIndex}`, part.text, true, true);
			}
		}
	}

	private textKey(event: ResponsesEvent, thinking: boolean): string {
		const kind = thinking ? 'summary' : event.type.includes('refusal') ? 'refusal' : 'text';
		const partIndex = thinking ? event.summary_index : event.content_index;
		return `${this.getIndex(event)}:${kind}:${typeof partIndex === 'number' ? partIndex : 0}`;
	}

	private appendText(event: ResponsesEvent, thinking: boolean): void {
		if (typeof event.delta === 'string') {
			this.reportText(this.textKey(event, thinking), event.delta, thinking, false);
		}
	}

	private completeText(event: ResponsesEvent, thinking: boolean): void {
		const text = event.type.includes('refusal') ? event.refusal : event.text;
		if (typeof text === 'string') {
			this.reportText(this.textKey(event, thinking), text, thinking, true);
		}
	}

	private reportText(key: string, text: string, thinking: boolean, full: boolean): void {
		const previous = this.text.get(key) ?? '';
		if (full && !text.startsWith(previous)) {
			throw new Error('Responses final text does not match the streamed text.');
		}
		const delta = full ? text.slice(previous.length) : text;
		this.text.set(key, full ? text : previous + text);
		if (delta) {
			if (thinking) {
				this.callbacks.onThinking(delta);
			} else {
				this.callbacks.onContent(delta);
			}
		}
	}

	private complete(value: unknown): void {
		if (!isRecord(value) || (value.status && value.status !== 'completed')) {
			throw new Error('Responses completion event has no completed response.');
		}
		if (Array.isArray(value.output)) {
			value.output.forEach((item, index) => this.rememberItem(index, item, true));
		}
		const items = [...this.items.entries()].sort(([a], [b]) => a - b);
		const callIds = new Set<string>();
		for (const [, item] of items) {
			if (item.type !== 'function_call') {
				continue;
			}
			if (!item.call_id || !item.name || callIds.has(item.call_id)) {
				throw new Error('Responses function_call has a missing or duplicate call_id or name.');
			}
			callIds.add(item.call_id);
			let args: unknown;
			try {
				args = JSON.parse(item.arguments);
			} catch {
				throw new Error(`Responses function_call ${item.name} has invalid JSON arguments.`);
			}
			if (!isRecord(args)) {
				throw new Error(`Responses function_call ${item.name} arguments must be an object.`);
			}
		}
		this.callbacks.onOutputItems?.(items.map(([, item]) => structuredClone(item)));
		for (const [, item] of items) {
			if (item.type === 'reasoning') {
				// Summaries are display text; only the original item is replayable state.
				this.callbacks.onReasoningItem?.(item);
			} else if (item.type === 'function_call') {
				this.callbacks.onToolCall({
					id: item.call_id,
					type: 'function',
					function: { name: item.name, arguments: item.arguments },
				});
			}
		}
		const usage = normalizeResponsesUsage(value.usage);
		if (usage) {
			this.callbacks.onUsage?.(usage);
		}
		this.completed = true;
		this.callbacks.onDone();
	}
}
