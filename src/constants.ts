import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DATA_ROOT = path.join(PROJECT_ROOT, "data");

// Created on startup. The browser profile is left out on purpose: its absence is what triggers the LinkedIn login.
export const DATA_DIRS = {
    RAW: path.join(DATA_ROOT, "raw"),
    PROCESSED: path.join(DATA_ROOT, "processed"),
    AMBIGUITY: path.join(DATA_ROOT, "ambiguity"),
    RESUME: path.join(DATA_ROOT, "resume"),
    PROFILE: path.join(DATA_ROOT, "profile"),
} as const;

export const DATA_PATHS = {
    RAW_DIR: DATA_DIRS.RAW,
    PROCESSED_FILE: path.join(DATA_DIRS.PROCESSED, "processed-records.json"),
    SKIPPED_FILE: path.join(DATA_DIRS.PROCESSED, "skipped.json"),
    MISSING_FILE: path.join(DATA_DIRS.AMBIGUITY, "missing.json"),
    RESUME_FILE: path.join(DATA_DIRS.RESUME, "resume.pdf"),
    PROFILE_FILE: path.join(DATA_DIRS.PROFILE, "profile.md"),
    SIGNATURE_FILE: path.join(DATA_DIRS.PROFILE, "signature.txt"),
    EMAIL_TEMPLATE_FILE: path.join(DATA_DIRS.PROFILE, "email-template.txt"),
    BROWSER_PROFILE_DIR: path.join(DATA_ROOT, "browser-profile"),
} as const;

export const LOG_PATHS = {
    DIR: path.join(PROJECT_ROOT, "logs"),
    AGENT_LOG: path.join(PROJECT_ROOT, "logs", "agent.log"),
    TOOL_CALLS: path.join(PROJECT_ROOT, "logs", "tool-calls.jsonl"),
    PLAYWRIGHT_OUTPUT: path.join(PROJECT_ROOT, "logs", "playwright"),
} as const;

export const RAW_FILE = {
    PREFIX: "linkedin-",
    EXTENSION: ".json",
} as const;

export const JSON_INDENT = 2;
export const FILE_ENCODING = "utf-8";

export const ENV_KEYS = {
    OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
    MODEL: "MODEL",
    SEARCH_QUERY: "SEARCH_QUERY",
    GMAIL_USER: "GMAIL_USER",
    GMAIL_APP_PASSWORD: "GMAIL_APP_PASSWORD",
    SENDER_NAME: "SENDER_NAME",
    TEST_RECIPIENT: "TEST_RECIPIENT",
    LINKEDIN_LI_AT: "LINKEDIN_LI_AT",
} as const;

export const ENV_PLACEHOLDER_MARKER = "paste-your";

export const OPENROUTER = {
    BASE_URL: "https://openrouter.ai/api",
    DEFAULT_MODEL: "google/gemma-4-31b-it:free",
} as const;

export const DEFAULT_SEARCH_QUERY = `"HR" AND ("Trainee" OR "Fresh Graduate") AND "Karachi"`;

export const POST_KEYWORDS = ["resume", "apply", "cv", "send your", "share your", "email your", "hiring"] as const;

export const SCAN_LIMITS = {
    MAX_POSTS: 30,
    SCROLLS_PER_ROUND: 3,
    SCROLL_WAIT_SECONDS: 3,
    SCROLL_STEP_PX: 1200,
    MIN_SCROLLABLE_PX: 200,
} as const;

export const SNAPSHOT_TARGET = "main";
export const POST_LINK_MARKERS = ["/feed/update/", "/posts/"] as const;
export const RECORD_FINGERPRINT_CHARS = 120;

// Scrolls the window and any inner scroll panel, so it works whatever LinkedIn's markup is.
export const SCROLL_ROUND_FUNCTION =
    `async () => { let moved = false; ` +
    `for (let i = 0; i < ${SCAN_LIMITS.SCROLLS_PER_ROUND}; i++) { ` +
    `for (const el of [document.scrollingElement, ...document.querySelectorAll("*")]) { ` +
    `if (!el || el.scrollHeight - el.clientHeight < ${SCAN_LIMITS.MIN_SCROLLABLE_PX}) continue; ` +
    `const before = el.scrollTop; el.scrollTo({ top: before + ${SCAN_LIMITS.SCROLL_STEP_PX}, behavior: "instant" }); ` +
    `if (el.scrollTop !== before) moved = true; } ` +
    `await new Promise((resolve) => setTimeout(resolve, ${SCAN_LIMITS.SCROLL_WAIT_SECONDS * 1000})); } ` +
    `return { moved }; }`;

export const LINKEDIN_URLS = {
    LOGIN: "https://www.linkedin.com/login",
    FEED: "https://www.linkedin.com/feed/",
    POST_PREFIX: "https://www.linkedin.com/feed/update/",
    CONTENT_SEARCH: "https://www.linkedin.com/search/results/content/",
} as const;

export const LINKEDIN_SEARCH_PARAMS = {
    KEYWORDS: "keywords",
    DATE_POSTED: "datePosted",
    SORT_BY: "sortBy",
    PAST_WEEK: '"past-week"',
    TOP_MATCH: '"relevance"',
} as const;

export const LINKEDIN_SESSION_COOKIE = {
    NAME: "li_at",
    DOMAIN: ".linkedin.com",
    PATH: "/",
    LIFETIME_DAYS: 90,
} as const;

export const URN_PREFIX = "urn:li:";

export const BROWSER_CHANNEL = "chrome";

export const PLAYWRIGHT_MCP = {
    CLI_PATH: path.join(PROJECT_ROOT, "node_modules", "@playwright", "mcp", "cli.js"),
    TIMEOUT_MS: 120000,
    ACTION_TIMEOUT_MS: "15000",
    SNAPSHOT_MODE: "none",
    IMAGE_RESPONSES: "omit",
} as const;

export const PLAYWRIGHT_MCP_ARGS = [
    PLAYWRIGHT_MCP.CLI_PATH,
    "--browser", BROWSER_CHANNEL,
    "--user-data-dir", DATA_PATHS.BROWSER_PROFILE_DIR,
    "--snapshot-mode", PLAYWRIGHT_MCP.SNAPSHOT_MODE,
    "--image-responses", PLAYWRIGHT_MCP.IMAGE_RESPONSES,
    "--timeout-action", PLAYWRIGHT_MCP.ACTION_TIMEOUT_MS,
    "--output-dir", LOG_PATHS.PLAYWRIGHT_OUTPUT,
] as const;

export const MCP_SERVERS = {
    PLAYWRIGHT: "playwright",
    JOB_TOOLS: "job-tools",
} as const;

export const MCP_SERVER_VERSION = "1.0.0";

export const TOOL_NAMES = {
    SAVE_POST: "save_post",
} as const;

export const MCP_TOOL_NAMES = {
    SAVE_POST: `mcp__${MCP_SERVERS.JOB_TOOLS}__${TOOL_NAMES.SAVE_POST}`,
} as const;

export const MCP_TOOL_PREFIXES = {
    PLAYWRIGHT: `mcp__${MCP_SERVERS.PLAYWRIGHT}__`,
} as const;

export const BLOCKED_PLAYWRIGHT_TOOLS = [
    "browser_file_upload",
    "browser_take_screenshot",
    "browser_run_code_unsafe",
    "browser_cookie_clear",
    "browser_cookie_delete",
    "browser_cookie_set",
    "browser_set_storage_state",
    "browser_localstorage_clear",
    "browser_sessionstorage_clear",
    "browser_pdf_save",
    "browser_close",
].map((toolName) => `${MCP_TOOL_PREFIXES.PLAYWRIGHT}${toolName}`);

export const TOOL_DESCRIPTIONS = {
    SAVE_POST:
        "Save one LinkedIn hiring post to today's raw file. It skips internship posts and recruiters " +
        "who were already emailed. Returns the save status and how many posts are saved today.",
} as const;

export const SAVE_POST_INPUT_SCHEMA = {
    authorName: z.string().describe("Full name of the post author"),
    email: z.string().describe("Email address written in the post, or an empty string if there is none"),
    companyName: z.string().describe("Hiring company name from the post or the author headline, or an empty string"),
    postContent: z.string().describe("The full post text as shown in the snapshot"),
    postUrl: z.string().describe("The post's own link from the snapshot (contains /feed/update/ or /posts/), or an empty string"),
};

export const SAVE_POST_STATUSES = {
    SAVED: "saved",
    SKIPPED_INTERNSHIP: "skipped_internship",
    SKIPPED_ALREADY_EMAILED: "skipped_already_emailed",
} as const;

// Whole words only, so "international" or "internal" don't match.
export const INTERNSHIP_PATTERN = /\bintern(?:s|ship|ships)?\b/i;

export const AUDIT_VERDICTS = {
    KEEP: "keep",
    DUPLICATE: "duplicate",
    MISSING_EMAIL: "missing_email",
} as const;

export const SEND_ACTIONS = {
    SEND: "send",
    SKIP_MISMATCH: "skip_mismatch",
    SKIP_NO_DRAFT: "skip_no_draft",
    SKIP_PROCESSED: "skip_processed",
} as const;

export const AGENT_NAMES = {
    SCRAPER: "scraper-agent",
    EMAIL_WRITER: "email-writer-agent",
} as const;

export const AGENT_LIMITS = {
    SCRAPER_MAX_TURNS: 100,
    SCRAPER_COMPACT_WINDOW_TOKENS: 100000,
    WRITER_MAX_TURNS: 4,
} as const;

export const SCRAPER_OUTPUT_SCHEMA = {
    type: "object",
    properties: {
        postsScanned: { type: "integer", minimum: 0, description: "How many distinct posts you read" },
        postsSaved: { type: "integer", minimum: 0, description: "How many save_post calls returned status saved" },
        reachedEnd: { type: "boolean", description: "True if the page stopped loading new posts before the limit" },
    },
    required: ["postsScanned", "postsSaved", "reachedEnd"],
    additionalProperties: false,
} as const;

// isMatch comes first so the model decides fit before filling the other fields.
export const EMAIL_DETAILS_SCHEMA = {
    type: "object",
    properties: {
        isMatch: { type: "boolean", description: "True only if the post offers an HR role that fits the candidate profile" },
        subject: { type: "string", description: "Short, specific subject line with no dashes, or an empty string if isMatch is false" },
        positionName: { type: "string", description: "Role title from the post, or an empty string if unclear" },
        companyName: { type: "string", description: "Hiring company name, or an empty string if unclear" },
        recruiterName: { type: "string", description: "Name of the person who owns the recruiter email, or an empty string" },
    },
    required: ["isMatch", "subject", "positionName", "companyName", "recruiterName"],
    additionalProperties: false,
} as const;

export const EMAIL_TEMPLATE_PLACEHOLDERS = {
    POSITION_NAME: "{{positionName}}",
    COMPANY_NAME: "{{companyName}}",
    RECRUITER_NAME: "{{recruiterName}}",
} as const;

export const EMAIL_TEMPLATE_FALLBACKS = {
    POSITION_NAME: "open HR",
    COMPANY_NAME: "your organization",
    RECRUITER_NAME: "Hiring Manager",
} as const;

export const SDK_PERMISSION_MODE = "default";
export const OUTPUT_FORMAT_TYPE = "json_schema";
export const STRUCTURED_OUTPUT_TOOL = "StructuredOutput";
export const EMPTY_ALLOWED_TOOLS = { names: [], prefixes: [] } as const;

export const SDK_ENV_KEYS = {
    BASE_URL: "ANTHROPIC_BASE_URL",
    AUTH_TOKEN: "ANTHROPIC_AUTH_TOKEN",
    API_KEY: "ANTHROPIC_API_KEY",
    MODEL: "ANTHROPIC_MODEL",
    OPUS_MODEL: "ANTHROPIC_DEFAULT_OPUS_MODEL",
    SONNET_MODEL: "ANTHROPIC_DEFAULT_SONNET_MODEL",
    HAIKU_MODEL: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    SUBAGENT_MODEL: "CLAUDE_CODE_SUBAGENT_MODEL",
    DISABLE_NONESSENTIAL_TRAFFIC: "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
} as const;

export const MESSAGE_TYPES = {
    ASSISTANT: "assistant",
    RESULT: "result",
    SYSTEM: "system",
} as const;

export const SYSTEM_SUBTYPES = {
    API_RETRY: "api_retry",
} as const;

// The SDK retries 429s on its own. We stop at the first one instead of prompting again.
export const RATE_LIMIT = {
    HTTP_STATUS: 429,
    SDK_ERROR: "rate_limit",
} as const;

export const RESULT_SUBTYPES = {
    SUCCESS: "success",
} as const;

export const CONTENT_TYPES = {
    TEXT: "text",
    TOOL_USE: "tool_use",
} as const;

export const HOOK_EVENTS = {
    POST_TOOL_USE: "PostToolUse",
    POST_TOOL_USE_FAILURE: "PostToolUseFailure",
} as const;

export const PERMISSION_BEHAVIORS = {
    ALLOW: "allow",
    DENY: "deny",
} as const;

export const LOG_EVENTS = {
    TOOL_RESULT: "tool_result",
    TOOL_ERROR: "tool_error",
    TOOL_DENIED: "tool_denied",
} as const;

export const LOG_LIMITS = {
    TOOL_PAYLOAD_CHARS: 2000,
    CONSOLE_TEXT_CHARS: 300,
} as const;

export const PIPELINE_STAGES = {
    ALL: "all",
    SCRAPE: "scrape",
    AUDIT: "audit",
    WRITE: "write",
    SEND: "send",
    LOGIN: "login",
} as const;

export const SMTP = {
    HOST: "smtp.gmail.com",
    PORT: 465,
    SECURE: true,
} as const;

export const SEND_DELAY_MS = 10000;
export const RESUME_ATTACHMENT_NAME = "resume.pdf";
export const TEST_SUBJECT_PREFIX = "[TEST to";

export const PROFILE_PLACEHOLDER_MARKER = "[FILL IN";

export const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
export const EXACT_EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export const TEXT_CLEANUP_PATTERNS = {
    LINE_START_DASH: /^[ \t]*[-–—][ \t]+/gm,
    SPACED_DASH: /[ \t]+[-–—][ \t]+/g,
    ANY_DASH: /[-–—]/g,
    REPEATED_SPACES: /[ \t]{2,}/g,
    TRAILING_SLASHES: /\/+$/,
    BYTE_ORDER_MARK: /^\uFEFF/,
    ALL_WHITESPACE: /\s+/g,
} as const;

export const STEP_NAMES = {
    AUDIT: "audit",
    SENDER: "sender",
    PIPELINE: "pipeline",
    LOGIN: "login",
} as const;
