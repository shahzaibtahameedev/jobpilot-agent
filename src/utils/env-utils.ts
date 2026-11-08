import { ENV_PLACEHOLDER_MARKER } from "../constants.ts";

export function readOptionalEnv(name: string): string {
    return process.env[name]?.trim() ?? "";
}

export function requireEnv(name: string): string {
    const value = readOptionalEnv(name);
    const isMissing = value.length === 0 || value.includes(ENV_PLACEHOLDER_MARKER);

    if (isMissing) {
        throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    }

    return value;
}
