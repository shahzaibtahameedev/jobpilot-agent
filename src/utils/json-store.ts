import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_PATHS, FILE_ENCODING, JSON_INDENT, RAW_FILE, TEXT_CLEANUP_PATTERNS } from "../constants.ts";
import { getTodayDate } from "./date-utils.ts";

export function getRawFilePath(date: string = getTodayDate()): string {
    return path.join(DATA_PATHS.RAW_DIR, `${RAW_FILE.PREFIX}${date}${RAW_FILE.EXTENSION}`);
}

export function readTextFile(filePath: string): string {
    return readFileSync(filePath, FILE_ENCODING).replace(TEXT_CLEANUP_PATTERNS.BYTE_ORDER_MARK, "").trim();
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
    writeJsonArray(filePath, [...readJsonArray<T>(filePath), ...records]);
}

export function ensureJsonArrayFile(filePath: string): void {
    const fileExists = existsSync(filePath);
    if (!fileExists) writeJsonArray(filePath, []);
}
