import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
    CONTENT_TYPES,
    DATA_PATHS,
    INTERNSHIP_PATTERN,
    LINKEDIN_URLS,
    MCP_SERVERS,
    MCP_SERVER_VERSION,
    SAVE_POST_INPUT_SCHEMA,
    SAVE_POST_STATUSES,
    TOOL_DESCRIPTIONS,
    TOOL_NAMES,
    URN_PREFIX,
} from "../constants.ts";
import type { JobPostRecord, ProcessedRecord, SavePostInput, SavePostResult, SavePostStatus } from "../interfaces.ts";
import { extractEmailFromText, isValidEmail, normalizeEmail } from "../utils/email-utils.ts";
import { appendRecords, getRawFilePath, readJsonArray } from "../utils/json-store.ts";
import { log } from "../utils/logger.ts";

let processedEmails: Set<string> | null = null;

const savePostTool = tool(TOOL_NAMES.SAVE_POST, TOOL_DESCRIPTIONS.SAVE_POST, SAVE_POST_INPUT_SCHEMA, async (args) => {
    const result = savePost(args);

    return { content: [{ type: CONTENT_TYPES.TEXT, text: JSON.stringify(result) }] };
});

export const jobToolsServer = createSdkMcpServer({
    name: MCP_SERVERS.JOB_TOOLS,
    version: MCP_SERVER_VERSION,
    alwaysLoad: true,
    tools: [savePostTool],
});

export function savePost(input: SavePostInput): SavePostResult {
    const rawFilePath = getRawFilePath();
    const savedCount = readJsonArray<JobPostRecord>(rawFilePath).length;
    const record = buildRecord(input);
    const status = getSaveStatus(record);
    const isSaved = status === SAVE_POST_STATUSES.SAVED;

    if (isSaved) appendRecords(rawFilePath, [record]);

    log(`[save_post] ${status}: ${record.authorName || "unknown author"} ${record.email}`);
    return { status, savedToday: isSaved ? savedCount + 1 : savedCount };
}

function getSaveStatus(record: JobPostRecord): SavePostStatus {
    const isInternship = INTERNSHIP_PATTERN.test(record.postContent);
    const isAlreadyEmailed = record.email.length > 0 && getProcessedEmails().has(record.email);

    switch (true) {
        case isInternship:
            return SAVE_POST_STATUSES.SKIPPED_INTERNSHIP;
        case isAlreadyEmailed:
            return SAVE_POST_STATUSES.SKIPPED_ALREADY_EMAILED;
        default:
            return SAVE_POST_STATUSES.SAVED;
    }
}

function getProcessedEmails(): Set<string> {
    processedEmails ??= new Set(
        readJsonArray<ProcessedRecord>(DATA_PATHS.PROCESSED_FILE)
            .map((processed) => normalizeEmail(processed.email))
            .filter((email) => email.length > 0),
    );

    return processedEmails;
}

function buildRecord(input: SavePostInput): JobPostRecord {
    const writtenEmail = normalizeEmail(input.email);
    const hasValidEmail = isValidEmail(writtenEmail);

    return {
        authorName: input.authorName.trim(),
        email: hasValidEmail ? writtenEmail : extractEmailFromText(input.postContent),
        companyName: input.companyName.trim(),
        postContent: input.postContent.trim(),
        postUrl: toPostUrl(input.postUrl),
    };
}

function toPostUrl(value: string): string {
    const trimmedValue = value.trim();
    const isBareUrn = trimmedValue.startsWith(URN_PREFIX);

    return isBareUrn ? `${LINKEDIN_URLS.POST_PREFIX}${trimmedValue}/` : trimmedValue;
}
