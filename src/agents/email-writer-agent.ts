import { existsSync } from "node:fs";
import { runAgent } from "../agent-sdk.ts";
import { AGENT_LIMITS, AGENT_NAMES, DATA_PATHS, EMAIL_DETAILS_SCHEMA, PROFILE_PLACEHOLDER_MARKER } from "../constants.ts";
import type { EmailDetails, JobPostRecord, SkippedRecord, WriteSummary } from "../interfaces.ts";
import { buildEmailTaskPrompt, EMAIL_WRITER_SYSTEM_PROMPT } from "../prompts.ts";
import { getTodayDate } from "../utils/date-utils.ts";
import { renderEmailTemplate, sanitizeText } from "../utils/email-utils.ts";
import { appendRecords, readJsonArray, readTextFile, writeJsonArray } from "../utils/json-store.ts";
import { log } from "../utils/logger.ts";

export async function runEmailWriterAgent(rawFilePath: string): Promise<WriteSummary> {
    const profile = readProfileFile(DATA_PATHS.PROFILE_FILE);
    const signature = readProfileFile(DATA_PATHS.SIGNATURE_FILE);
    const template = readProfileFile(DATA_PATHS.EMAIL_TEMPLATE_FILE);
    const records = readJsonArray<JobPostRecord>(rawFilePath);
    const summary: WriteSummary = { drafted: 0, mismatched: 0, skipped: 0, failed: 0 };

    for (const record of records) {
        const isMarkedMismatch = record.isMatch === false;
        const hasDraft = Boolean(record.subject && record.body);
        if (isMarkedMismatch || hasDraft) {
            summary.skipped++;
            continue;
        }

        const details = await extractEmailDetails(record, profile);
        if (details === null) {
            summary.failed++;
            log(`[${AGENT_NAMES.EMAIL_WRITER}] could not read the post details for ${record.email}`);
            continue;
        }

        if (!details.isMatch) {
            record.isMatch = false;
            writeJsonArray(rawFilePath, records);
            summary.mismatched++;
            log(`[${AGENT_NAMES.EMAIL_WRITER}] ${record.email}: post is not a match for the profile`);
            continue;
        }

        const subject = sanitizeText(details.subject);
        if (subject.length === 0) {
            summary.failed++;
            log(`[${AGENT_NAMES.EMAIL_WRITER}] no subject returned for ${record.email}`);
            continue;
        }

        record.isMatch = true;
        record.subject = subject;
        record.body = `${renderEmailTemplate(template, details)}\n\n${signature}`;
        writeJsonArray(rawFilePath, records);
        summary.drafted++;
        log(`[${AGENT_NAMES.EMAIL_WRITER}] drafted "${record.subject}" for ${record.email}`);
    }

    moveSkippedRecords(rawFilePath, records);
    log(`[${AGENT_NAMES.EMAIL_WRITER}] emails drafted ${summary.drafted}, not a match ${summary.mismatched}, skipped ${summary.skipped}, failed ${summary.failed}`);
    return summary;
}

function moveSkippedRecords(rawFilePath: string, records: JobPostRecord[]): void {
    const today = getTodayDate();
    const skippedRecords: SkippedRecord[] = [];
    const remainingRecords: JobPostRecord[] = [];

    for (const record of records) {
        const isMismatch = record.isMatch === false;
        if (isMismatch) {
            skippedRecords.push({ ...record, skippedDate: today });
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
