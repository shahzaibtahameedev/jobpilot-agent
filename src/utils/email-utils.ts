import {
    EMAIL_PATTERN,
    EMAIL_TEMPLATE_FALLBACKS,
    EMAIL_TEMPLATE_PLACEHOLDERS,
    EXACT_EMAIL_PATTERN,
    RECORD_FINGERPRINT_CHARS,
    TEXT_CLEANUP_PATTERNS,
} from "../constants.ts";
import type { EmailTemplateValues, JobPostRecord } from "../interfaces.ts";

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function normalizeUrl(url: string): string {
    const [urlWithoutQuery = ""] = url.trim().split("?");

    return urlWithoutQuery.replace(TEXT_CLEANUP_PATTERNS.TRAILING_SLASHES, "").toLowerCase();
}

export function isValidEmail(email: string): boolean {
    return EXACT_EMAIL_PATTERN.test(email.trim());
}

export function extractEmailFromText(text: string): string {
    const match = text.match(EMAIL_PATTERN);

    return match ? normalizeEmail(match[0]) : "";
}

export function getRecordKey(record: JobPostRecord): string {
    const url = normalizeUrl(record.postUrl);
    const hasUrl = url.length > 0;
    if (hasUrl) return url;

    const fingerprint = `${record.authorName}|${record.postContent.slice(0, RECORD_FINGERPRINT_CHARS)}`;
    return fingerprint.replace(TEXT_CLEANUP_PATTERNS.ALL_WHITESPACE, " ").trim().toLowerCase();
}

export function isSamePost(first: JobPostRecord, second: JobPostRecord): boolean {
    return getRecordKey(first) === getRecordKey(second);
}

export function isDuplicate(record: JobPostRecord, existingRecords: readonly JobPostRecord[]): boolean {
    const email = normalizeEmail(record.email);

    return existingRecords.some((existing) => {
        const isSameEmail = email.length > 0 && normalizeEmail(existing.email) === email;

        return isSameEmail || isSamePost(record, existing);
    });
}

export function sanitizeText(text: string): string {
    return text
        .replace(TEXT_CLEANUP_PATTERNS.LINE_START_DASH, "")
        .replace(TEXT_CLEANUP_PATTERNS.SPACED_DASH, ", ")
        .replace(TEXT_CLEANUP_PATTERNS.ANY_DASH, " ")
        .replace(TEXT_CLEANUP_PATTERNS.REPEATED_SPACES, " ")
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .trim();
}

export function renderEmailTemplate(template: string, values: EmailTemplateValues): string {
    const positionName = cleanTemplateValue(values.positionName) || EMAIL_TEMPLATE_FALLBACKS.POSITION_NAME;
    const companyName = cleanTemplateValue(values.companyName) || EMAIL_TEMPLATE_FALLBACKS.COMPANY_NAME;
    const recruiterName = cleanTemplateValue(values.recruiterName) || EMAIL_TEMPLATE_FALLBACKS.RECRUITER_NAME;

    return template
        .replaceAll(EMAIL_TEMPLATE_PLACEHOLDERS.POSITION_NAME, positionName)
        .replaceAll(EMAIL_TEMPLATE_PLACEHOLDERS.COMPANY_NAME, companyName)
        .replaceAll(EMAIL_TEMPLATE_PLACEHOLDERS.RECRUITER_NAME, recruiterName)
        .trim();
}

function cleanTemplateValue(value: string): string {
    let cleanUpValue = value.replace(TEXT_CLEANUP_PATTERNS.ALL_WHITESPACE, " ").trim();

    if(cleanUpValue?.toLowerCase() == 'n/a'){
        return '';
    }

    return cleanUpValue;
}
