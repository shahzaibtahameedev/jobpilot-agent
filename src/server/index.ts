import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { runEmailWriterAgent } from "../agents/email-writer-agent.ts";
import { runScraperAgent } from "../agents/scraper-agent.ts";
import {
    DATA_PATHS,
    DEFAULT_SEARCH_QUERY,
    EMAIL_TEMPLATE_PLACEHOLDERS,
    ENV_KEYS,
    OPENROUTER,
    PIPELINE_STAGES,
    RESUME_ATTACHMENT_NAME,
    RUN_STAGES,
    RUN_TYPES,
    SERVER,
    STEP_NAMES,
} from "../constants.ts";
import { runStartupChecks } from "../index.ts";
import type { JobPostRecord, JobView, ProcessedRecord } from "../interfaces.ts";
import { auditRecords } from "../steps/audit-records.ts";
import { saveLinkedInSession } from "../steps/save-linkedin-session.ts";
import { sendSingleEmail } from "../steps/send-emails.ts";
import { getRecordKey, isValidEmail } from "../utils/email-utils.ts";
import { readOptionalEnv, requireEnv } from "../utils/env-utils.ts";
import { getJobsFilePath, readJsonArray, readTextFile, writeJsonArray } from "../utils/json-store.ts";
import { log } from "../utils/logger.ts";
import { getRunState, isRunActive, setRunStage, startRun } from "./run-manager.ts";

const HTTP_STATUS = {
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
    SERVER_ERROR: 500,
} as const;

const RESUME_UPLOAD = {
    FIELD_NAME: "file",
    MAX_BYTES: 10 * 1024 * 1024,
    CONTENT_TYPE: "application/pdf",
} as const;

const app = new Hono();

function toJobId(record: JobPostRecord): string {
    const recordKey = getRecordKey(record);
    const jobId = Buffer.from(recordKey).toString("base64url");

    return jobId;
}

function toJobView(record: JobPostRecord): JobView {
    const jobView: JobView = {
        id: toJobId(record),
        authorName: record.authorName,
        email: record.email,
        companyName: record.companyName,
        postContent: record.postContent,
        postUrl: record.postUrl,
        isMatch: record.isMatch,
        subject: record.subject,
        body: record.body,
    };

    return jobView;
}

function findJobIndex(records: JobPostRecord[], jobId: string): number {
    const jobIndex = records.findIndex((record) => toJobId(record) === jobId);

    return jobIndex;
}

function readProfileText(filePath: string): string {
    const fileExists = existsSync(filePath);
    if (!fileExists) return "";

    const content = readTextFile(filePath);

    return content;
}

async function runFindJobs(): Promise<void> {
    const jobsFilePath = getJobsFilePath();
    const searchQuery = readOptionalEnv(ENV_KEYS.SEARCH_QUERY) || DEFAULT_SEARCH_QUERY;

    setRunStage(RUN_STAGES.SCRAPE);
    await runScraperAgent(searchQuery);

    setRunStage(RUN_STAGES.AUDIT);
    auditRecords(jobsFilePath);

    setRunStage(RUN_STAGES.WRITE);
    await runEmailWriterAgent(jobsFilePath);
}

async function runSession(): Promise<void> {
    setRunStage(RUN_STAGES.SESSION);
    await saveLinkedInSession();
}

app.onError((error, c) => {
    const reason = error instanceof Error ? error.message : String(error);
    log(`[server] request failed: ${reason}`);

    return c.json({ error: reason }, HTTP_STATUS.SERVER_ERROR);
});

app.get(`${SERVER.API_BASE}/jobs`, (c) => {
    const records = readJsonArray<JobPostRecord>(getJobsFilePath());
    const jobs = records.map((record) => toJobView(record));

    return c.json({ jobs });
});

app.put(`${SERVER.API_BASE}/jobs/:id`, async (c) => {
    const jobId = c.req.param("id");
    const payload = await c.req.json<{ subject?: string; body?: string }>();
    const jobsFilePath = getJobsFilePath();
    const records = readJsonArray<JobPostRecord>(jobsFilePath);
    const jobIndex = findJobIndex(records, jobId);

    const isMissing = jobIndex < 0;
    if (isMissing) {
        return c.json({ error: "Job not found." }, HTTP_STATUS.NOT_FOUND);
    }

    const record = records[jobIndex];
    const subject = payload.subject?.trim() ?? "";
    const body = payload.body?.trim() ?? "";
    const hasContent = subject.length > 0 && body.length > 0;
    if (!hasContent) {
        return c.json({ error: "Subject and body must not be empty." }, HTTP_STATUS.BAD_REQUEST);
    }

    record.subject = subject;
    record.body = body;
    writeJsonArray(jobsFilePath, records);

    const updatedJob = toJobView(record);

    return c.json({ job: updatedJob });
});

app.post(`${SERVER.API_BASE}/jobs/:id/send`, async (c) => {
    const jobId = c.req.param("id");
    const payload = await c.req.json<{ subject?: string; body?: string }>().catch(() => ({ subject: "", body: "" }));
    const jobsFilePath = getJobsFilePath();
    const records = readJsonArray<JobPostRecord>(jobsFilePath);
    const jobIndex = findJobIndex(records, jobId);

    const isMissing = jobIndex < 0;
    if (isMissing) {
        return c.json({ error: "Job not found." }, HTTP_STATUS.NOT_FOUND);
    }

    const record = records[jobIndex];
    const subject = payload.subject?.trim() ?? "";
    const body = payload.body?.trim() ?? "";
    const hasOverrides = subject.length > 0 && body.length > 0;
    if (hasOverrides) {
        record.subject = subject;
        record.body = body;
        writeJsonArray(jobsFilePath, records);
    }

    const hasValidRecipient = isValidEmail(record.email);
    if (!hasValidRecipient) {
        return c.json({ error: "This job has no valid recruiter email." }, HTTP_STATUS.BAD_REQUEST);
    }

    await sendSingleEmail(jobsFilePath, record);

    return c.json({ sent: true });
});

app.get(`${SERVER.API_BASE}/processed`, (c) => {
    const records = readJsonArray<ProcessedRecord>(DATA_PATHS.PROCESSED_FILE);
    const newestFirst = records.slice().reverse();

    return c.json({ processed: newestFirst });
});

app.get(`${SERVER.API_BASE}/runs/current`, (c) => {
    const runState = getRunState();

    return c.json(runState);
});

app.post(`${SERVER.API_BASE}/runs/find-jobs`, (c) => {
    if (isRunActive()) {
        return c.json({ error: "A run is already in progress." }, HTTP_STATUS.CONFLICT);
    }

    const hasBrowserProfile = existsSync(DATA_PATHS.BROWSER_PROFILE_DIR);
    if (!hasBrowserProfile) {
        return c.json(
            { error: "No LinkedIn session found. Click Save LinkedIn Session first." },
            HTTP_STATUS.CONFLICT,
        );
    }

    startRun(RUN_TYPES.FIND_JOBS, runFindJobs);

    return c.json(getRunState());
});

app.post(`${SERVER.API_BASE}/runs/session`, (c) => {
    if (isRunActive()) {
        return c.json({ error: "A run is already in progress." }, HTTP_STATUS.CONFLICT);
    }

    startRun(RUN_TYPES.SESSION, runSession);

    return c.json(getRunState());
});

app.get(`${SERVER.API_BASE}/template`, (c) => {
    const template = readProfileText(DATA_PATHS.EMAIL_TEMPLATE_FILE);
    const placeholders = Object.values(EMAIL_TEMPLATE_PLACEHOLDERS);

    return c.json({ template, placeholders });
});

app.put(`${SERVER.API_BASE}/template`, async (c) => {
    const payload = await c.req.json<{ template?: string }>();
    const template = payload.template?.trim() ?? "";

    const isEmpty = template.length === 0;
    if (isEmpty) {
        return c.json({ error: "The template must not be empty." }, HTTP_STATUS.BAD_REQUEST);
    }

    const placeholders = Object.values(EMAIL_TEMPLATE_PLACEHOLDERS);
    const missingPlaceholders = placeholders.filter((placeholder) => !template.includes(placeholder));
    const hasMissing = missingPlaceholders.length > 0;
    if (hasMissing) {
        return c.json(
            { error: `The template must keep these placeholders: ${missingPlaceholders.join(", ")}` },
            HTTP_STATUS.BAD_REQUEST,
        );
    }

    writeFileSync(DATA_PATHS.EMAIL_TEMPLATE_FILE, `${template}\n`);

    return c.json({ template });
});

app.get(`${SERVER.API_BASE}/profile`, (c) => {
    const profile = readProfileText(DATA_PATHS.PROFILE_FILE);
    const signature = readProfileText(DATA_PATHS.SIGNATURE_FILE);

    return c.json({ profile, signature });
});

app.put(`${SERVER.API_BASE}/profile`, async (c) => {
    const payload = await c.req.json<{ profile?: string; signature?: string }>();
    const profile = payload.profile?.trim() ?? "";
    const signature = payload.signature?.trim() ?? "";

    const isProfileEmpty = profile.length === 0;
    if (isProfileEmpty) {
        return c.json({ error: "The profile must not be empty." }, HTTP_STATUS.BAD_REQUEST);
    }

    writeFileSync(DATA_PATHS.PROFILE_FILE, `${profile}\n`);
    writeFileSync(DATA_PATHS.SIGNATURE_FILE, `${signature}\n`);

    return c.json({ profile, signature });
});

app.get(`${SERVER.API_BASE}/resume`, (c) => {
    const resumeExists = existsSync(DATA_PATHS.RESUME_FILE);
    if (!resumeExists) {
        return c.json({ exists: false, sizeBytes: 0, updatedAt: "" });
    }

    const stats = statSync(DATA_PATHS.RESUME_FILE);

    return c.json({ exists: true, sizeBytes: stats.size, updatedAt: stats.mtime.toISOString() });
});

app.get(`${SERVER.API_BASE}/resume/file`, (c) => {
    const resumeExists = existsSync(DATA_PATHS.RESUME_FILE);
    if (!resumeExists) {
        return c.json({ error: "No resume uploaded yet." }, HTTP_STATUS.NOT_FOUND);
    }

    const fileBuffer = readFileSync(DATA_PATHS.RESUME_FILE);
    const fileBytes = new Uint8Array(fileBuffer);

    return c.body(fileBytes, 200, {
        "Content-Type": RESUME_UPLOAD.CONTENT_TYPE,
        "Content-Disposition": `inline; filename="${RESUME_ATTACHMENT_NAME}"`,
    });
});

app.post(`${SERVER.API_BASE}/resume`, async (c) => {
    const body = await c.req.parseBody();
    const upload = body[RESUME_UPLOAD.FIELD_NAME];

    const isFile = upload instanceof File;
    if (!isFile) {
        return c.json({ error: "Attach the resume as a file field named 'file'." }, HTTP_STATUS.BAD_REQUEST);
    }

    const isPdf = upload.type === RESUME_UPLOAD.CONTENT_TYPE || upload.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
        return c.json({ error: "The resume must be a PDF file." }, HTTP_STATUS.BAD_REQUEST);
    }

    const isTooLarge = upload.size > RESUME_UPLOAD.MAX_BYTES;
    if (isTooLarge) {
        return c.json({ error: "The resume must be 10 MB or smaller." }, HTTP_STATUS.BAD_REQUEST);
    }

    const fileBuffer = Buffer.from(await upload.arrayBuffer());
    writeFileSync(DATA_PATHS.RESUME_FILE, fileBuffer);

    const stats = statSync(DATA_PATHS.RESUME_FILE);

    return c.json({ exists: true, sizeBytes: stats.size, updatedAt: stats.mtime.toISOString() });
});

app.get(`${SERVER.API_BASE}/limits`, async (c) => {
    const apiKey = requireEnv(ENV_KEYS.OPENROUTER_API_KEY);
    const response = await fetch(OPENROUTER.KEY_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    const isFailed = !response.ok;
    if (isFailed) {
        return c.json({ error: `OpenRouter answered with status ${response.status}.` }, HTTP_STATUS.SERVER_ERROR);
    }

    const keyInfo = await response.json();

    return c.json(keyInfo);
});

app.all(`${SERVER.API_BASE}/*`, (c) => {
    return c.json({ error: "Unknown API route." }, HTTP_STATUS.NOT_FOUND);
});

const clientDistRoot = path.relative(process.cwd(), SERVER.CLIENT_DIST_DIR).split(path.sep).join("/");
const clientIndexPath = `${clientDistRoot}/${SERVER.CLIENT_INDEX_FILE}`;

app.use("*", serveStatic({ root: clientDistRoot }));
app.get("*", serveStatic({ path: clientIndexPath }));

const port = Number(readOptionalEnv(SERVER.PORT_ENV_KEY)) || SERVER.DEFAULT_PORT;

await runStartupChecks(PIPELINE_STAGES.AUDIT);

serve({ fetch: app.fetch, port, hostname: SERVER.HOSTNAME }, (info) => {
    log(`[${STEP_NAMES.PIPELINE}] JobPilot server running at http://localhost:${info.port}`);
});
