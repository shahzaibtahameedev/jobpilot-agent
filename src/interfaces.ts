import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type {
    AUDIT_VERDICTS,
    PIPELINE_STAGES,
    SAVE_POST_STATUSES,
    SEND_ACTIONS,
} from "./constants.ts";

export type PipelineStage = (typeof PIPELINE_STAGES)[keyof typeof PIPELINE_STAGES];
export type SavePostStatus = (typeof SAVE_POST_STATUSES)[keyof typeof SAVE_POST_STATUSES];
export type AuditVerdict = (typeof AUDIT_VERDICTS)[keyof typeof AUDIT_VERDICTS];
export type SendAction = (typeof SEND_ACTIONS)[keyof typeof SEND_ACTIONS];

export interface JobPostRecord {
    authorName: string;
    email: string;
    companyName: string;
    postContent: string;
    postUrl: string;
    isMatch?: boolean;
    subject?: string;
    body?: string;
}

export interface ProcessedRecord extends JobPostRecord {
    processedDate: string;
}

export interface MissingRecord extends JobPostRecord {
    flaggedDate: string;
}

export interface SkippedRecord extends JobPostRecord {
    skippedDate: string;
}

export interface SavePostInput {
    authorName: string;
    email: string;
    companyName: string;
    postContent: string;
    postUrl: string;
}

export interface SavePostResult {
    status: SavePostStatus;
    savedToday: number;
}

export interface ScraperResult {
    postsScanned: number;
    postsSaved: number;
    reachedEnd: boolean;
}

export interface EmailDetails {
    isMatch: boolean;
    subject: string;
    positionName: string;
    companyName: string;
    recruiterName: string;
}

export type EmailTemplateValues = Pick<EmailDetails, "positionName" | "companyName" | "recruiterName">;

export interface AllowedTools {
    names: readonly string[];
    prefixes: readonly string[];
}

export interface AgentRunConfig {
    name: string;
    systemPrompt: string;
    prompt: string;
    outputSchema: Record<string, unknown>;
    maxTurns: number;
    mcpServers?: Record<string, McpServerConfig>;
    allowedTools?: AllowedTools;
    blockedTools?: readonly string[];
    autoCompactWindow?: number;
}

export interface AuditSummary {
    kept: number;
    duplicates: number;
    missingEmail: number;
}

export interface WriteSummary {
    drafted: number;
    mismatched: number;
    skipped: number;
    failed: number;
}

export interface SenderAddress {
    name: string;
    address: string;
}

export interface SendSummary {
    sent: number;
    skipped: number;
    failed: number;
}