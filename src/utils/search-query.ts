import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
    DATA_PATHS,
    DEFAULT_SEARCH_QUERY_CONFIG,
    FILE_ENCODING,
    JSON_INDENT,
    SEARCH_OPERATORS,
    SEARCH_QUERY_LIMITS,
} from "../constants.ts";
import type { SearchOperator, SearchQueryConfig, SearchQueryGroup, SearchQueryView } from "../interfaces.ts";
import { readTextFile } from "./json-store.ts";

const VALID_OPERATORS: readonly string[] = Object.values(SEARCH_OPERATORS);

export function compileSearchQuery(config: SearchQueryConfig): string {
    const groupTexts: string[] = [];

    for (const group of config.groups) {
        const quotedTerms = group.terms.map((term) => `"${term}"`);
        const isSingleTerm = quotedTerms.length === 1;
        const joined = quotedTerms.join(` ${group.operator} `);
        const groupText = isSingleTerm ? joined : `(${joined})`;

        groupTexts.push(groupText);
    }

    const query = groupTexts.join(` ${config.groupOperator} `);

    return query;
}

export function normalizeSearchQueryConfig(raw: unknown): SearchQueryConfig {
    const isObject = typeof raw === "object" && raw !== null;
    if (!isObject) {
        throw new Error("The search query must be an object with a groupOperator and a groups list.");
    }

    const candidate = raw as Partial<SearchQueryConfig>;
    const groupOperator = readOperator(candidate.groupOperator, "groupOperator");
    const rawGroups = candidate.groups;

    const hasGroups = Array.isArray(rawGroups) && rawGroups.length > 0;
    if (!hasGroups) {
        throw new Error("Add at least one group to the search query.");
    }

    const isOverGroupLimit = rawGroups.length > SEARCH_QUERY_LIMITS.MAX_GROUPS;
    if (isOverGroupLimit) {
        throw new Error(`A search query can hold at most ${SEARCH_QUERY_LIMITS.MAX_GROUPS} groups.`);
    }

    const groups: SearchQueryGroup[] = [];
    for (const rawGroup of rawGroups) {
        const group = normalizeGroup(rawGroup);
        groups.push(group);
    }

    const config: SearchQueryConfig = { groupOperator, groups };

    return config;
}

export function readSearchQueryConfig(): SearchQueryConfig {
    const fileExists = existsSync(DATA_PATHS.SEARCH_QUERY_FILE);
    if (!fileExists) return DEFAULT_SEARCH_QUERY_CONFIG;

    const content = readTextFile(DATA_PATHS.SEARCH_QUERY_FILE);
    const isEmpty = content.length === 0;
    if (isEmpty) return DEFAULT_SEARCH_QUERY_CONFIG;

    const parsed: unknown = JSON.parse(content);
    const config = normalizeSearchQueryConfig(parsed);

    return config;
}

export function writeSearchQueryConfig(config: SearchQueryConfig): void {
    mkdirSync(path.dirname(DATA_PATHS.SEARCH_QUERY_FILE), { recursive: true });
    writeFileSync(DATA_PATHS.SEARCH_QUERY_FILE, `${JSON.stringify(config, null, JSON_INDENT)}\n`, FILE_ENCODING);
}

export function ensureSearchQueryFile(): void {
    const fileExists = existsSync(DATA_PATHS.SEARCH_QUERY_FILE);
    if (fileExists) return;

    writeSearchQueryConfig(DEFAULT_SEARCH_QUERY_CONFIG);
}

export function getSearchQueryView(): SearchQueryView {
    const config = readSearchQueryConfig();
    const query = compileSearchQuery(config);
    const view: SearchQueryView = { groupOperator: config.groupOperator, groups: config.groups, query };

    return view;
}

export function getSearchQueryText(): string {
    const config = readSearchQueryConfig();
    const query = compileSearchQuery(config);

    return query;
}

function normalizeGroup(raw: unknown): SearchQueryGroup {
    const isObject = typeof raw === "object" && raw !== null;
    if (!isObject) {
        throw new Error("Every group must be an object with an operator and a terms list.");
    }

    const candidate = raw as Partial<SearchQueryGroup>;
    const operator = readOperator(candidate.operator, "operator");
    const rawTerms = candidate.terms;

    const isTermList = Array.isArray(rawTerms);
    if (!isTermList) {
        throw new Error("Every group must carry a terms list.");
    }

    const terms: string[] = [];
    for (const rawTerm of rawTerms) {
        const isText = typeof rawTerm === "string";
        if (!isText) {
            throw new Error("Every search term must be text.");
        }

        const term = rawTerm.trim();
        const isBlank = term.length === 0;
        if (isBlank) continue;

        const isTooLong = term.length > SEARCH_QUERY_LIMITS.MAX_TERM_CHARS;
        if (isTooLong) {
            throw new Error(`Search terms must be ${SEARCH_QUERY_LIMITS.MAX_TERM_CHARS} characters or shorter.`);
        }

        const hasQuote = term.includes('"');
        if (hasQuote) {
            throw new Error('Search terms cannot contain double quotes. JobPilot adds the quotes for you.');
        }

        terms.push(term);
    }

    const isEmptyGroup = terms.length === 0;
    if (isEmptyGroup) {
        throw new Error("Every group needs at least one term.");
    }

    const isOverTermLimit = terms.length > SEARCH_QUERY_LIMITS.MAX_TERMS_PER_GROUP;
    if (isOverTermLimit) {
        throw new Error(`A group can hold at most ${SEARCH_QUERY_LIMITS.MAX_TERMS_PER_GROUP} terms.`);
    }

    const group: SearchQueryGroup = { operator, terms };

    return group;
}

function readOperator(value: unknown, fieldName: string): SearchOperator {
    const isValid = typeof value === "string" && VALID_OPERATORS.includes(value);
    if (!isValid) {
        throw new Error(`${fieldName} must be either ${SEARCH_OPERATORS.AND} or ${SEARCH_OPERATORS.OR}.`);
    }

    return value as SearchOperator;
}
