import type { McpStdioServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { runAgent } from "../agent-sdk.ts";
import {
    AGENT_LIMITS,
    AGENT_NAMES,
    BLOCKED_PLAYWRIGHT_TOOLS,
    MCP_SERVERS,
    MCP_TOOL_NAMES,
    MCP_TOOL_PREFIXES,
    PLAYWRIGHT_MCP,
    PLAYWRIGHT_MCP_ARGS,
    SCRAPER_OUTPUT_SCHEMA,
} from "../constants.ts";
import type { ScraperResult } from "../interfaces.ts";
import { buildScraperTaskPrompt, SCRAPER_SYSTEM_PROMPT } from "../prompts.ts";
import { jobToolsServer } from "../tools/save-post-tool.ts";
import { log } from "../utils/logger.ts";

export async function runScraperAgent(searchQuery: string): Promise<ScraperResult | null> {
    log(`[${AGENT_NAMES.SCRAPER}] searching LinkedIn posts for: ${searchQuery}`);

    const result = await runAgent<ScraperResult>({
        name: AGENT_NAMES.SCRAPER,
        systemPrompt: SCRAPER_SYSTEM_PROMPT,
        prompt: buildScraperTaskPrompt(searchQuery),
        mcpServers: {
            [MCP_SERVERS.PLAYWRIGHT]: buildPlaywrightServer(),
            [MCP_SERVERS.JOB_TOOLS]: jobToolsServer,
        },
        allowedTools: {
            names: [MCP_TOOL_NAMES.SAVE_POST],
            prefixes: [MCP_TOOL_PREFIXES.PLAYWRIGHT],
        },
        blockedTools: BLOCKED_PLAYWRIGHT_TOOLS,
        outputSchema: SCRAPER_OUTPUT_SCHEMA,
        maxTurns: AGENT_LIMITS.SCRAPER_MAX_TURNS,
        autoCompactWindow: AGENT_LIMITS.SCRAPER_COMPACT_WINDOW_TOKENS,
    });

    const isFailed = result === null;
    if (isFailed) {
        log(`[${AGENT_NAMES.SCRAPER}] stopped early. Posts saved so far are kept.`);
        return null;
    }

    log(`[${AGENT_NAMES.SCRAPER}] scanned ${result.postsScanned}, saved ${result.postsSaved}, reached end: ${result.reachedEnd}`);
    return result;
}

function buildPlaywrightServer(): McpStdioServerConfig {
    return {
        type: "stdio",
        command: process.execPath,
        args: [...PLAYWRIGHT_MCP_ARGS],
        timeout: PLAYWRIGHT_MCP.TIMEOUT_MS,
        alwaysLoad: true,
    };
}
