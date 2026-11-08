import { AUDIT_VERDICTS, DATA_PATHS, STEP_NAMES } from "../constants.ts";
import type { AuditSummary, AuditVerdict, JobPostRecord, MissingRecord, ProcessedRecord } from "../interfaces.ts";
import { getTodayDate } from "../utils/date-utils.ts";
import { isDuplicate, isSamePost, isValidEmail } from "../utils/email-utils.ts";
import { readJsonArray, writeJsonArray } from "../utils/json-store.ts";
import { log } from "../utils/logger.ts";

export function auditRecords(rawFilePath: string): AuditSummary {
    const rawRecords = readJsonArray<JobPostRecord>(rawFilePath);
    const processedRecords = readJsonArray<ProcessedRecord>(DATA_PATHS.PROCESSED_FILE);
    const missingRecords = readJsonArray<MissingRecord>(DATA_PATHS.MISSING_FILE);
    const keptRecords: JobPostRecord[] = [];
    const summary: AuditSummary = { kept: 0, duplicates: 0, missingEmail: 0 };
    const today = getTodayDate();

    for (const record of rawRecords) {
        const verdict = getAuditVerdict(record, [...processedRecords, ...keptRecords]);

        switch (verdict) {
            case AUDIT_VERDICTS.DUPLICATE:
                summary.duplicates++;
                break;
            case AUDIT_VERDICTS.MISSING_EMAIL: {
                summary.missingEmail++;
                const isAlreadyFlagged = missingRecords.some((missing) => isSamePost(missing, record));
                if (!isAlreadyFlagged) missingRecords.push({ ...record, flaggedDate: today });
                break;
            }
            case AUDIT_VERDICTS.KEEP:
                keptRecords.push(record);
                break;
        }
    }

    summary.kept = keptRecords.length;
    writeJsonArray(rawFilePath, keptRecords);
    writeJsonArray(DATA_PATHS.MISSING_FILE, missingRecords);
    log(`[${STEP_NAMES.AUDIT}] kept ${summary.kept}, removed ${summary.duplicates} duplicates, moved ${summary.missingEmail} without email to missing.json`);

    return summary;
}

function getAuditVerdict(record: JobPostRecord, knownRecords: JobPostRecord[]): AuditVerdict {
    const isAlreadyKnown = isDuplicate(record, knownRecords);
    const isMissingEmail = !isValidEmail(record.email);

    switch (true) {
        case isAlreadyKnown:
            return AUDIT_VERDICTS.DUPLICATE;
        case isMissingEmail:
            return AUDIT_VERDICTS.MISSING_EMAIL;
        default:
            return AUDIT_VERDICTS.KEEP;
    }
}
