import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import {
    DATA_PATHS,
    ENV_KEYS,
    RESUME_ATTACHMENT_NAME,
    SEND_ACTIONS,
    SEND_DELAY_MS,
    SMTP,
    STEP_NAMES,
    TEST_SUBJECT_PREFIX,
    TEXT_CLEANUP_PATTERNS,
} from "../constants.ts";
import type { JobPostRecord, ProcessedRecord, SendAction, SenderAddress, SendSummary } from "../interfaces.ts";
import { getTodayDate } from "../utils/date-utils.ts";
import { isDuplicate, isSamePost } from "../utils/email-utils.ts";
import { readOptionalEnv, requireEnv } from "../utils/env-utils.ts";
import { appendRecords, readJsonArray, writeJsonArray } from "../utils/json-store.ts";
import { log } from "../utils/logger.ts";

export async function sendEmails(rawFilePath: string): Promise<SendSummary> {
    const resumeExists = existsSync(DATA_PATHS.RESUME_FILE);
    if (!resumeExists) {
        throw new Error(`Missing ${DATA_PATHS.RESUME_FILE}. Add your resume before sending.`);
    }

    const records = readJsonArray<JobPostRecord>(rawFilePath);
    const testRecipient = readOptionalEnv(ENV_KEYS.TEST_RECIPIENT);
    const summary: SendSummary = { sent: 0, skipped: 0, failed: 0 };
    let transporter: Transporter | null = null;

    for (const record of records) {
        const processedRecords = readJsonArray<ProcessedRecord>(DATA_PATHS.PROCESSED_FILE);
        const action = getSendAction(record, processedRecords);

        switch (action) {
            case SEND_ACTIONS.SKIP_MISMATCH:
                summary.skipped++;
                log(`[${STEP_NAMES.SENDER}] skipped ${record.email}: post is not a match for the profile`);
                break;
            case SEND_ACTIONS.SKIP_NO_DRAFT:
                summary.skipped++;
                log(`[${STEP_NAMES.SENDER}] skipped ${record.email}: no subject or body`);
                break;
            case SEND_ACTIONS.SKIP_PROCESSED:
                summary.skipped++;
                log(`[${STEP_NAMES.SENDER}] skipped ${record.email}: already processed`);
                break;
            case SEND_ACTIONS.SEND: {
                const hasSentBefore = transporter !== null;
                if (hasSentBefore) await sleep(SEND_DELAY_MS);

                transporter ??= await createVerifiedTransporter();
                const isSent = await deliverEmail(transporter, record, testRecipient);
                if (isSent) {
                    summary.sent++;
                    markProcessed(record, testRecipient);
                } else {
                    summary.failed++;
                }
                break;
            }
        }
    }

    removeProcessedRecords(rawFilePath, records);
    log(`[${STEP_NAMES.SENDER}] sent ${summary.sent}, skipped ${summary.skipped}, failed ${summary.failed}`);
    return summary;
}

// Sends one drafted record right away. Used by the API when the user clicks send on a job.
export async function sendSingleEmail(jobsFilePath: string, record: JobPostRecord): Promise<void> {
    const resumeExists = existsSync(DATA_PATHS.RESUME_FILE);
    if (!resumeExists) {
        throw new Error("No resume found. Upload your resume before sending.");
    }

    const hasDraft = Boolean(record.subject && record.body);
    if (!hasDraft) {
        throw new Error("This job has no email draft yet.");
    }

    const processedRecords = readJsonArray<ProcessedRecord>(DATA_PATHS.PROCESSED_FILE);
    const isAlreadyProcessed = isDuplicate(record, processedRecords);
    if (isAlreadyProcessed) {
        throw new Error("This recruiter was already emailed.");
    }

    const testRecipient = readOptionalEnv(ENV_KEYS.TEST_RECIPIENT);
    const transporter = await createVerifiedTransporter();
    const isSent = await deliverEmail(transporter, record, testRecipient);
    if (!isSent) {
        throw new Error("Gmail refused the message. Check logs/agent.log for the reason.");
    }

    markProcessed(record, testRecipient);

    const isTestMode = testRecipient.length > 0;
    if (isTestMode) return;

    const records = readJsonArray<JobPostRecord>(jobsFilePath);
    const remainingRecords = records.filter((existing) => !isSamePost(existing, record));
    writeJsonArray(jobsFilePath, remainingRecords);
}

// Runs after sending. Rewrites the jobs file without the records that are now in processed-records.json.
function removeProcessedRecords(rawFilePath: string, records: JobPostRecord[]): void {
    const processedRecords = readJsonArray<ProcessedRecord>(DATA_PATHS.PROCESSED_FILE);
    const remainingRecords: JobPostRecord[] = [];

    for (const record of records) {
        const isProcessed = isDuplicate(record, processedRecords);
        if (!isProcessed) remainingRecords.push(record);
    }

    const hasRemoved = remainingRecords.length < records.length;
    if (hasRemoved) writeJsonArray(rawFilePath, remainingRecords);
}

function getSendAction(record: JobPostRecord, processedRecords: ProcessedRecord[]): SendAction {
    const isMismatch = record.isMatch === false;
    const hasDraft = Boolean(record.subject && record.body);
    const isAlreadyProcessed = isDuplicate(record, processedRecords);

    switch (true) {
        case isMismatch:
            return SEND_ACTIONS.SKIP_MISMATCH;
        case !hasDraft:
            return SEND_ACTIONS.SKIP_NO_DRAFT;
        case isAlreadyProcessed:
            return SEND_ACTIONS.SKIP_PROCESSED;
        default:
            return SEND_ACTIONS.SEND;
    }
}

async function createVerifiedTransporter(): Promise<Transporter> {
    const transporter = nodemailer.createTransport({
        host: SMTP.HOST,
        port: SMTP.PORT,
        secure: SMTP.SECURE,
        auth: {
            user: requireEnv(ENV_KEYS.GMAIL_USER),
            pass: requireEnv(ENV_KEYS.GMAIL_APP_PASSWORD).replace(TEXT_CLEANUP_PATTERNS.ALL_WHITESPACE, ""),
        },
    });

    await transporter.verify();
    log(`[${STEP_NAMES.SENDER}] connected to Gmail SMTP`);

    return transporter;
}

async function deliverEmail(transporter: Transporter, record: JobPostRecord, testRecipient: string): Promise<boolean> {
    const isTestMode = testRecipient.length > 0;
    const recipient = isTestMode ? testRecipient : record.email;
    const subject = isTestMode ? `${TEST_SUBJECT_PREFIX} ${record.email}] ${record.subject}` : record.subject;

    try {
        await transporter.sendMail({
            from: buildSender(),
            to: recipient,
            subject,
            text: record.body,
            attachments: [{ filename: RESUME_ATTACHMENT_NAME, path: DATA_PATHS.RESUME_FILE }],
        });
        log(`[${STEP_NAMES.SENDER}] sent "${subject}" to ${recipient}`);
        return true;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        log(`[${STEP_NAMES.SENDER}] failed to send to ${recipient}: ${reason}`);
        return false;
    }
}

function markProcessed(record: JobPostRecord, testRecipient: string): void {
    const isTestMode = testRecipient.length > 0;
    if (isTestMode) return;

    const processedRecord: ProcessedRecord = { ...record, processedDate: getTodayDate() };
    appendRecords(DATA_PATHS.PROCESSED_FILE, [processedRecord]);
}

function buildSender(): string | SenderAddress {
    const address = requireEnv(ENV_KEYS.GMAIL_USER);
    const name = readOptionalEnv(ENV_KEYS.SENDER_NAME);
    const hasName = name.length > 0;

    return hasName ? { name, address } : address;
}
