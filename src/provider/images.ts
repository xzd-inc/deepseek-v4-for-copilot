import vscode from 'vscode';

export type NormalizedToolResultContentPart =
	| {
			type: 'text';
			text: string;
	  }
	| {
			type: 'image';
			mimeType: string;
			data: Uint8Array;
	  }
	| {
			type: 'other';
			value: unknown;
	  };

export interface NormalizedToolResult {
	callId: string;
	parts: NormalizedToolResultContentPart[];
	originalContent: readonly unknown[];
}

export interface ImageInputMimeStats {
	mimeType: string;
	imageParts: number;
	imageBytes: number;
}

export interface ImageInputSummary {
	inputImageParts: number;
	inputImageMessages: number;
	inputImageBytes: number;
	inputImageMimes: ImageInputMimeStats[];
	toolResultImageParts: number;
	toolResultImageBytes: number;
	toolResultImageMimes: ImageInputMimeStats[];
	toolResultsWithImages: number;
}

/**
 * Normalize a tool result without making any model-routing decisions.
 *
 * Only actual image data parts are classified as images. Tool names, tool-call
 * input paths, resource URIs, and other opaque values are deliberately not
 * inspected or hydrated here.
 */
export function normalizeToolResult(
	part: vscode.LanguageModelToolResultPart,
): NormalizedToolResult {
	return {
		callId: part.callId,
		parts: part.content.map(normalizeToolResultContentPart),
		originalContent: part.content,
	};
}

/** Collect authoritative image metadata across supported provider input shapes. */
export function collectImageInputSummary(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
): ImageInputSummary {
	const inputMimeStats = new Map<string, ImageInputMimeStats>();
	const toolResultMimeStats = new Map<string, ImageInputMimeStats>();
	const messageIndexesWithInputImages = new Set<number>();
	let inputImageParts = 0;
	let inputImageBytes = 0;
	let toolResultImageParts = 0;
	let toolResultImageBytes = 0;
	let toolResultsWithImages = 0;

	const recordInputImage = (
		part: { mimeType: string; data: Uint8Array },
		messageIndex: number,
	): void => {
		const byteLength = part.data.byteLength;
		const mimeType = normalizeMimeType(part.mimeType);
		recordMimeStats(inputMimeStats, mimeType, byteLength);
		inputImageParts += 1;
		inputImageBytes += byteLength;
		messageIndexesWithInputImages.add(messageIndex);
	};

	const recordToolResultImage = (part: { mimeType: string; data: Uint8Array }): void => {
		const byteLength = part.data.byteLength;
		const mimeType = normalizeMimeType(part.mimeType);
		recordMimeStats(toolResultMimeStats, mimeType, byteLength);
		toolResultImageParts += 1;
		toolResultImageBytes += byteLength;
	};

	for (const [messageIndex, message] of messages.entries()) {
		for (const part of message.content) {
			if (message.role === vscode.LanguageModelChatMessageRole.User && isImageDataPart(part)) {
				recordInputImage(part, messageIndex);
				continue;
			}
			if (!(part instanceof vscode.LanguageModelToolResultPart)) {
				continue;
			}

			let toolResultHasImages = false;
			for (const item of normalizeToolResult(part).parts) {
				if (item.type !== 'image') {
					continue;
				}
				toolResultHasImages = true;
				recordToolResultImage(item);
			}
			if (toolResultHasImages) {
				toolResultsWithImages += 1;
			}
		}
	}

	return {
		inputImageParts,
		inputImageMessages: messageIndexesWithInputImages.size,
		inputImageBytes,
		inputImageMimes: sortMimeStats(inputMimeStats),
		toolResultImageParts,
		toolResultImageBytes,
		toolResultImageMimes: sortMimeStats(toolResultMimeStats),
		toolResultsWithImages,
	};
}

export function isImageDataPart(part: unknown): part is vscode.LanguageModelDataPart {
	return (
		part instanceof vscode.LanguageModelDataPart && part.mimeType.toLowerCase().startsWith('image/')
	);
}

function normalizeToolResultContentPart(item: unknown): NormalizedToolResultContentPart {
	if (item instanceof vscode.LanguageModelTextPart) {
		return { type: 'text', text: item.value };
	}
	if (isImageDataPart(item)) {
		return {
			type: 'image',
			mimeType: item.mimeType,
			data: item.data,
		};
	}
	return { type: 'other', value: item };
}

function normalizeMimeType(mimeType: string): string {
	return mimeType.trim().toLowerCase() || 'unknown';
}

function recordMimeStats(
	stats: Map<string, ImageInputMimeStats>,
	mimeType: string,
	byteLength: number,
): void {
	const current = stats.get(mimeType);
	if (current) {
		current.imageParts += 1;
		current.imageBytes += byteLength;
		return;
	}
	stats.set(mimeType, {
		mimeType,
		imageParts: 1,
		imageBytes: byteLength,
	});
}

function sortMimeStats(stats: Map<string, ImageInputMimeStats>): ImageInputMimeStats[] {
	return [...stats.values()].sort((a, b) => a.mimeType.localeCompare(b.mimeType));
}
