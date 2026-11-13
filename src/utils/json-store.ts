import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_PATHS, FILE_ENCODING, JSON_INDENT, LEGACY_RAW_DIR, LEGACY_RAW_FILE, TEXT_CLEANUP_PATTERNS } from "../constants.ts";
import type { JobPostRecord } from "../interfaces.ts";

export function getJobsFilePath(): string {
    return DATA_PATHS.JOBS_FILE;
}

export function readTextFile(filePath: string): string {
    const content = readFileSync(filePath, FILE_ENCODING).replace(TEXT_CLEANUP_PATTERNS.BYTE_ORDER_MARK, "").trim();

    return content;
}

export function readJsonArray<T>(filePath: string): T[] {
    const fileExists = existsSync(filePath);
    if (!fileExists) return [];

    const content = readTextFile(filePath);
    const isEmpty = content.length === 0;
    if (isEmpty) return [];

    const parsed: unknown = JSON.parse(content);
    const isArray = Array.isArray(parsed);
    if (!isArray) {
        throw new Error(`${filePath} must contain a JSON array.`);
    }

    return parsed as T[];
}

export function writeJsonArray<T>(filePath: string, records: T[]): void {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(records, null, JSON_INDENT)}\n`, FILE_ENCODING);
}

export function appendRecords<T>(filePath: string, records: T[]): void {
    const existingRecords = readJsonArray<T>(filePath);
    const mergedRecords = existingRecords.concat(records);

    writeJsonArray(filePath, mergedRecords);
}

export function ensureJsonArrayFile(filePath: string): void {
    const fileExists = existsSync(filePath);
    if (!fileExists) writeJsonArray(filePath, []);
}

// One-time migration: merges every legacy data/raw/linkedin-<date>.json into data/jobs.json and removes the raw folder.
export function migrateLegacyRawFiles(): number {
    const legacyDirExists = existsSync(LEGACY_RAW_DIR);
    if (!legacyDirExists) return 0;

    const fileNames = readdirSync(LEGACY_RAW_DIR);
    const migratedRecords: JobPostRecord[] = [];
    const migratedFilePaths: string[] = [];

    for (const fileName of fileNames) {
        const isLegacyFile = fileName.startsWith(LEGACY_RAW_FILE.PREFIX) && fileName.endsWith(LEGACY_RAW_FILE.EXTENSION);
        if (!isLegacyFile) continue;

        const legacyFilePath = path.join(LEGACY_RAW_DIR, fileName);
        const legacyRecords = readJsonArray<JobPostRecord>(legacyFilePath);
        for (const record of legacyRecords) {
            migratedRecords.push(record);
        }
        migratedFilePaths.push(legacyFilePath);
    }

    const hasMigratedRecords = migratedRecords.length > 0;
    if (hasMigratedRecords) appendRecords(DATA_PATHS.JOBS_FILE, migratedRecords);

    for (const migratedFilePath of migratedFilePaths) {
        unlinkSync(migratedFilePath);
    }

    const remainingEntries = readdirSync(LEGACY_RAW_DIR);
    const isDirEmpty = remainingEntries.length === 0;
    if (isDirEmpty) rmdirSync(LEGACY_RAW_DIR);

    return migratedRecords.length;
}
