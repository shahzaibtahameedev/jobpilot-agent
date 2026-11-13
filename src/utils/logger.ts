import { appendFileSync, mkdirSync } from "node:fs";
import { format } from "node:util";
import { LOG_PATHS } from "../constants.ts";

mkdirSync(LOG_PATHS.DIR, { recursive: true });

type LogListener = (message: string) => void;

let logListener: LogListener | null = null;

export function setLogListener(listener: LogListener | null): void {
    logListener = listener;
}

export function log(...parts: unknown[]): void {
    const message = format(...parts);
    console.log(message);
    appendFileSync(LOG_PATHS.AGENT_LOG, `[${new Date().toISOString()}] ${message}\n`);
    logListener?.(message);
}

export function logJsonl(record: Record<string, unknown>): void {
    appendFileSync(LOG_PATHS.TOOL_CALLS, `${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
}

export function truncate(value: unknown, maxChars: number): string {
    const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
    const isTooLong = text.length > maxChars;

    return isTooLong ? `${text.slice(0, maxChars)}... [${text.length - maxChars} more chars]` : text;
}
