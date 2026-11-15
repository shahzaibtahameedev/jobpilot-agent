import { existsSync } from "node:fs";
import { runAgent } from "../agent-sdk.ts";
import {
    AGENT_LIMITS,
    AGENT_NAMES,
    DATA_PATHS,
    DRAFT_STATUSES,
    EMAIL_DETAILS_SCHEMA,
    NOT_AVAILABLE_VALUE,
    PROFILE_PLACEHOLDER_MARKER,
    SKIP_REASON_FALLBACK,
    TEXT_CLEANUP_PATTERNS,
} from "../constants.ts";
import type {
    DraftContext,
    DraftStatus,
    EmailDetails,
    JobPostRecord,
    SkippedRecord,
    WriteSummary,
} from "../interfaces.ts";
import { buildEmailTaskPrompt, EMAIL_WRITER_SYSTEM_PROMPT } from "../prompts.ts";
import { getTodayDate } from "../utils/date-utils.ts";
import { findJobIndexById, hasEmailDraft, renderEmailTemplate, sanitizeText } from "../utils/email-utils.ts";
import { appendRecords, readJsonArray, readTextFile, writeJsonArray } from "../utils/json-store.ts";
import { log } from "../utils/logger.ts";

export async function runEmailWriterAgent(rawFilePath: string): Promise<WriteSummary> {
    const context = readDraftContext();
    const records = readJsonArray<JobPostRecord>(rawFilePath);
    const summary: WriteSummary = { drafted: 0, mismatched: 0, skipped: 0, failed: 0 };

    for (const record of records) {
        const isMarkedMismatch = record.isMatch === false;
        const isDrafted = hasEmailDraft(record);
        if (isMarkedMismatch || isDrafted) {
            summary.skipped++;
            continue;
        }

        const status = await applyDraft(record, context);
        switch (status) {
            case DRAFT_STATUSES.DRAFTED:
                summary.drafted++;
                writeJsonArray(rawFilePath, records);
                break;
            case DRAFT_STATUSES.MISMATCH:
                summary.mismatched++;
                writeJsonArray(rawFilePath, records);
                break;
            case DRAFT_STATUSES.FAILED:
                summary.failed++;
                break;
        }
    }

    moveSkippedRecords(rawFilePath, records);
    log(`[${AGENT_NAMES.EMAIL_WRITER}] emails drafted ${summary.drafted}, not a match ${summary.mismatched}, skipped ${summary.skipped}, failed ${summary.failed}`);
    return summary;
}

// Redrafts one job even when it already has a draft, so the UI can offer a regenerate action.
export async function runEmailWriterForJob(rawFilePath: string, jobId: string): Promise<DraftStatus> {
    const context = readDraftContext();
    const records = readJsonArray<JobPostRecord>(rawFilePath);
    const jobIndex = findJobIndexById(records, jobId);

    const isMissing = jobIndex < 0;
    if (isMissing) {
        throw new Error("That job is no longer in the jobs file.");
    }

    const record = records[jobIndex];
    const status = await applyDraft(record, context);

    const isFailed = status === DRAFT_STATUSES.FAILED;
    if (isFailed) return status;

    writeJsonArray(rawFilePath, records);
    moveSkippedRecords(rawFilePath, records);

    return status;
}

async function applyDraft(record: JobPostRecord, context: DraftContext): Promise<DraftStatus> {
    const details = await extractEmailDetails(record, context.profile);

    const isUnreadable = details === null;
    if (isUnreadable) {
        log(`[${AGENT_NAMES.EMAIL_WRITER}] could not read the post details for ${record.email}`);
        return DRAFT_STATUSES.FAILED;
    }

    if (!details.isMatch) {
        const skipReason = readSkipReason(details.reason);
        record.isMatch = false;
        record.skipReason = skipReason;
        log(`[${AGENT_NAMES.EMAIL_WRITER}] ${record.email}: not a match, ${skipReason}`);

        return DRAFT_STATUSES.MISMATCH;
    }

    const subject = sanitizeText(details.subject);
    const hasSubject = subject.length > 0;
    if (!hasSubject) {
        log(`[${AGENT_NAMES.EMAIL_WRITER}] no subject returned for ${record.email}`);
        return DRAFT_STATUSES.FAILED;
    }

    const renderedTemplate = renderEmailTemplate(context.template, details);
    record.isMatch = true;
    record.subject = subject;
    record.body = `${renderedTemplate}\n\n${context.signature}`;
    log(`[${AGENT_NAMES.EMAIL_WRITER}] drafted "${subject}" for ${record.email}`);

    return DRAFT_STATUSES.DRAFTED;
}

function readSkipReason(reason: string): string {
    const collapsed = reason.replace(TEXT_CLEANUP_PATTERNS.ALL_WHITESPACE, " ").trim();
    const isMissing = collapsed.length === 0 || collapsed.toLowerCase() === NOT_AVAILABLE_VALUE;
    if (isMissing) return SKIP_REASON_FALLBACK;

    return collapsed;
}

function readDraftContext(): DraftContext {
    const profile = readProfileFile(DATA_PATHS.PROFILE_FILE);
    const signature = readProfileFile(DATA_PATHS.SIGNATURE_FILE);
    const template = readProfileFile(DATA_PATHS.EMAIL_TEMPLATE_FILE);
    const context: DraftContext = { profile, signature, template };

    return context;
}

function moveSkippedRecords(rawFilePath: string, records: JobPostRecord[]): void {
    const today = getTodayDate();
    const skippedRecords: SkippedRecord[] = [];
    const remainingRecords: JobPostRecord[] = [];

    for (const record of records) {
        const isMismatch = record.isMatch === false;
        if (isMismatch) {
            const skippedRecord: SkippedRecord = {
                authorName: record.authorName,
                email: record.email,
                companyName: record.companyName,
                postContent: record.postContent,
                postUrl: record.postUrl,
                isMatch: record.isMatch,
                skipReason: record.skipReason,
                subject: record.subject,
                body: record.body,
                skippedDate: today,
            };

            skippedRecords.push(skippedRecord);
        } else {
            remainingRecords.push(record);
        }
    }

    const hasSkipped = skippedRecords.length > 0;
    if (!hasSkipped) return;

    appendRecords(DATA_PATHS.SKIPPED_FILE, skippedRecords);
    writeJsonArray(rawFilePath, remainingRecords);
    log(`[${AGENT_NAMES.EMAIL_WRITER}] moved ${skippedRecords.length} records that are not a match to skipped.json`);
}

async function extractEmailDetails(record: JobPostRecord, profile: string): Promise<EmailDetails | null> {
    return runAgent<EmailDetails>({
        name: AGENT_NAMES.EMAIL_WRITER,
        systemPrompt: EMAIL_WRITER_SYSTEM_PROMPT,
        prompt: buildEmailTaskPrompt(record, profile),
        outputSchema: EMAIL_DETAILS_SCHEMA,
        maxTurns: AGENT_LIMITS.WRITER_MAX_TURNS,
    });
}

function readProfileFile(filePath: string): string {
    const fileExists = existsSync(filePath);
    if (!fileExists) {
        throw new Error(`Missing ${filePath}. Create it before writing emails.`);
    }

    const content = readTextFile(filePath);
    const isUnfilled = content.length === 0 || content.includes(PROFILE_PLACEHOLDER_MARKER);
    if (isUnfilled) {
        throw new Error(`${filePath} still has placeholder text. Fill it in before writing emails.`);
    }

    return content;
}
