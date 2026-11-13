import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RateLimitError } from "./agent-sdk.ts";
import { runEmailWriterAgent } from "./agents/email-writer-agent.ts";
import { runScraperAgent } from "./agents/scraper-agent.ts";
import { DATA_DIRS, DATA_PATHS, DEFAULT_SEARCH_QUERY, ENV_KEYS, PIPELINE_STAGES, STEP_NAMES } from "./constants.ts";
import type { AuditSummary } from "./interfaces.ts";
import { auditRecords } from "./steps/audit-records.ts";
import { saveLinkedInSession } from "./steps/save-linkedin-session.ts";
import { sendEmails } from "./steps/send-emails.ts";
import { readOptionalEnv } from "./utils/env-utils.ts";
import { ensureJsonArrayFile, getJobsFilePath, migrateLegacyRawFiles } from "./utils/json-store.ts";
import { log } from "./utils/logger.ts";

export async function runStartupChecks(stage: string): Promise<void> {
    for (const dir of Object.values(DATA_DIRS)) {
        mkdirSync(dir, { recursive: true });
    }

    ensureJsonArrayFile(DATA_PATHS.JOBS_FILE);
    ensureJsonArrayFile(DATA_PATHS.PROCESSED_FILE);
    ensureJsonArrayFile(DATA_PATHS.MISSING_FILE);
    ensureJsonArrayFile(DATA_PATHS.SKIPPED_FILE);

    const migratedCount = migrateLegacyRawFiles();
    const hasMigrated = migratedCount > 0;
    if (hasMigrated) {
        log(`[${STEP_NAMES.PIPELINE}] migrated ${migratedCount} records from date-wise raw files into ${DATA_PATHS.JOBS_FILE}`);
    }

    const browserProfileNeeded = stage === PIPELINE_STAGES.SCRAPE || stage === PIPELINE_STAGES.ALL;
    const hasBrowserProfile = existsSync(DATA_PATHS.BROWSER_PROFILE_DIR);
    if (browserProfileNeeded && !hasBrowserProfile) {
        log(`[${STEP_NAMES.PIPELINE}] no LinkedIn browser profile found. Opening LinkedIn to sign in.`);
        await saveLinkedInSession();
    }
}

async function runAllStages(jobsFilePath: string, searchQuery: string): Promise<void> {
    await runScraperAgent(searchQuery);
    log('Scrape Stage Completed\n');

    const auditSummary: AuditSummary = auditRecords(jobsFilePath);
    const hasNoRecords = auditSummary.kept === 0;
    if (hasNoRecords) {
        log(`[${STEP_NAMES.PIPELINE}] no new records to email today.`);
        return;
    }
    log('Audit Stage Completed\n');

    await runEmailWriterAgent(jobsFilePath);
    await sendEmails(jobsFilePath);
}

async function runPipeline(stage: string): Promise<void> {
    const jobsFilePath = getJobsFilePath();
    const searchQuery = readOptionalEnv(ENV_KEYS.SEARCH_QUERY) || DEFAULT_SEARCH_QUERY;
    log(`[${STEP_NAMES.PIPELINE}] stage: ${stage}, file: ${jobsFilePath}`);

    await runStartupChecks(stage);

    switch (stage) {
        case PIPELINE_STAGES.LOGIN:
            await saveLinkedInSession();
            break;
        case PIPELINE_STAGES.SCRAPE:
            await runScraperAgent(searchQuery);
            break;
        case PIPELINE_STAGES.AUDIT:
            auditRecords(jobsFilePath);
            break;
        case PIPELINE_STAGES.WRITE:
            await runEmailWriterAgent(jobsFilePath);
            break;
        case PIPELINE_STAGES.SEND:
            await sendEmails(jobsFilePath);
            break;
        case PIPELINE_STAGES.ALL:
            await runAllStages(jobsFilePath, searchQuery);
            break;
        default:
            throw new Error(`Unknown stage "${stage}". Use one of: ${Object.values(PIPELINE_STAGES).join(", ")}.`);
    }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
const isDirectRun = entryPath.toLowerCase() === modulePath.toLowerCase();

if (isDirectRun) {
    try {
        const stage = process.argv[2] ?? PIPELINE_STAGES.ALL;
        await runPipeline(stage);
    } catch (error) {
        const isRateLimited = error instanceof RateLimitError;
        const reason = error instanceof Error ? error.message : String(error);

        if (isRateLimited) {
            log(`[${STEP_NAMES.PIPELINE}] stopped: ${reason} No more agent calls were made. Work saved so far is kept; run again later.`);
        } else {
            log(`[${STEP_NAMES.PIPELINE}] failed: ${reason}`);
        }

        process.exitCode = 1;
    }
}
