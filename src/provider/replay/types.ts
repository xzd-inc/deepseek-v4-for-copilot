import type { ResponsesOutputItem, ResponsesReasoningItem } from '../../types';

export interface ReplayMarkerParseResult {
	valid: boolean;
	segmentId?: string;
	visionText?: string;
	visionTextIgnoredReason?: VisionMarkerTextIgnoredReason;
	toolVision?: ToolVisionReplayEntry[];
	reasoningText?: string;
	reasoningTextIgnoredReason?: ReasoningMarkerTextIgnoredReason;
	reasoningItems?: ResponsesReasoningItem[];
	outputItems?: ResponsesOutputItem[];
	reasoningTokens?: number;
	legacySegmentOnly?: boolean;
	payloadFormat?: ReplayMarkerPayloadFormat;
	error?: string;
}

export interface LocatedReplayMarker {
	partIndex: number;
	marker: ReplayMarkerParseResult;
}

export type ReplayMarkerPayloadFormat = 'json-base64url' | 'raw-json' | 'raw-uuid';

export type VisionMarkerTextIgnoredReason =
	| 'vision-not-object'
	| 'vision-text-not-string'
	| 'vision-text-empty';

export interface ToolVisionReplayEntry {
	callId: string;
	resolvedContent: string;
	imageParts: number;
}

export type ReasoningMarkerTextIgnoredReason =
	| 'reasoning-not-object'
	| 'reasoning-text-not-string'
	| 'reasoning-text-empty';

export interface ReplayMarkerMetadata {
	visionText?: string;
	toolVision?: readonly ToolVisionReplayEntry[];
	reasoningText?: string;
	reasoningItems?: readonly ResponsesReasoningItem[];
	outputItems?: readonly ResponsesOutputItem[];
	reasoningTokens?: number;
}
