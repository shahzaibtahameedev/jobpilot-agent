import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { CanUseTool, HookCallback, Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
    CONTENT_TYPES,
    EMPTY_ALLOWED_TOOLS,
    ENV_KEYS,
    HOOK_EVENTS,
    LOG_EVENTS,
    LOG_LIMITS,
    MESSAGE_TYPES,
    OPENROUTER,
    OUTPUT_FORMAT_TYPE,
    PERMISSION_BEHAVIORS,
    PROJECT_ROOT,
    RATE_LIMIT,
    RESULT_SUBTYPES,
    SDK_ENV_KEYS,
    SDK_PERMISSION_MODE,
    STRUCTURED_OUTPUT_TOOL,
    SYSTEM_SUBTYPES,
} from "./constants.ts";
import type { AgentRunConfig, AllowedTools } from "./interfaces.ts";
import { readOptionalEnv, requireEnv } from "./utils/env-utils.ts";
import { log, logJsonl, truncate } from "./utils/logger.ts";

export class RateLimitError extends Error {
    constructor(agentName: string) {
        super(`[${agentName}] hit the model provider's rate limit (HTTP ${RATE_LIMIT.HTTP_STATUS}).`);
        this.name = "RateLimitError";
    }
}

export function getModel(): string {
    return readOptionalEnv(ENV_KEYS.MODEL) || OPENROUTER.DEFAULT_MODEL;
}

function buildSdkEnv(): Record<string, string | undefined> {
    const model = getModel();
    const env = {
        [SDK_ENV_KEYS.BASE_URL]: OPENROUTER.BASE_URL,
        [SDK_ENV_KEYS.AUTH_TOKEN]: requireEnv(ENV_KEYS.OPENROUTER_API_KEY),
        [SDK_ENV_KEYS.API_KEY]: "",
        [SDK_ENV_KEYS.MODEL]: model,
        [SDK_ENV_KEYS.OPUS_MODEL]: model,
        [SDK_ENV_KEYS.SONNET_MODEL]: model,
        [SDK_ENV_KEYS.HAIKU_MODEL]: model,
        [SDK_ENV_KEYS.SUBAGENT_MODEL]: model,
        [SDK_ENV_KEYS.DISABLE_NONESSENTIAL_TRAFFIC]: "1",
    };

    return env;
}

export function createToolGate(allowedTools: AllowedTools): CanUseTool {
    return async (toolName, input) => {
        const isStructuredOutput = toolName === STRUCTURED_OUTPUT_TOOL;
        const isAllowedName = allowedTools.names.includes(toolName);
        const isAllowedPrefix = allowedTools.prefixes.some((prefix) => toolName.startsWith(prefix));
        const isAllowed = isStructuredOutput || isAllowedName || isAllowedPrefix;

        if (isAllowed) {
            return { behavior: PERMISSION_BEHAVIORS.ALLOW, updatedInput: input };
        }

        logJsonl({ event: LOG_EVENTS.TOOL_DENIED, tool: toolName, input });
        return { behavior: PERMISSION_BEHAVIORS.DENY, message: `${toolName} is not allowed for this agent.` };
    };
}

const logToolCall: HookCallback = async (input) => {
    switch (input.hook_event_name) {
        case HOOK_EVENTS.POST_TOOL_USE:
            logJsonl({
                event: LOG_EVENTS.TOOL_RESULT,
                tool: input.tool_name,
                input: truncate(input.tool_input, LOG_LIMITS.TOOL_PAYLOAD_CHARS),
                result: truncate(input.tool_response, LOG_LIMITS.TOOL_PAYLOAD_CHARS),
            });
            break;
        case HOOK_EVENTS.POST_TOOL_USE_FAILURE:
            logJsonl({
                event: LOG_EVENTS.TOOL_ERROR,
                tool: input.tool_name,
                input: truncate(input.tool_input, LOG_LIMITS.TOOL_PAYLOAD_CHARS),
                error: input.error,
            });
            break;
    }

    return {};
};

function logAgentResponse(agentName: string, message: SDKMessage): void {
    switch (message.type) {
        case MESSAGE_TYPES.ASSISTANT:
            for (const block of message.message.content) {
                switch (block.type) {
                    case CONTENT_TYPES.TEXT: {
                        const hasText = block.text.trim().length > 0;
                        if (hasText) log(`[${agentName}] says: ${truncate(block.text, LOG_LIMITS.CONSOLE_TEXT_CHARS)}`);
                        break;
                    }
                    case CONTENT_TYPES.TOOL_USE:
                        log(`[${agentName}] tool: ${block.name} ${truncate(block.input, LOG_LIMITS.CONSOLE_TEXT_CHARS)}`);
                        break;
                }
            }
            break;
        case MESSAGE_TYPES.RESULT:
            log(`[${agentName}] finished: ${message.subtype} after ${message.num_turns} turns`);
            break;
    }
}

function isRateLimited(message: SDKMessage): boolean {
    switch (message.type) {
        case MESSAGE_TYPES.SYSTEM: {
            const isRetry = message.subtype === SYSTEM_SUBTYPES.API_RETRY;
            if (!isRetry) return false;

            return message.error_status === RATE_LIMIT.HTTP_STATUS || message.error === RATE_LIMIT.SDK_ERROR;
        }
        case MESSAGE_TYPES.ASSISTANT:
            return message.error === RATE_LIMIT.SDK_ERROR;
        default:
            return false;
    }
}

function buildOptions(config: AgentRunConfig, abortController: AbortController): Options {
    const hasCompactWindow = config.autoCompactWindow !== undefined;

    return {
        abortController,
        model: getModel(),
        systemPrompt: config.systemPrompt,
        tools: [],
        disallowedTools: [...(config.blockedTools ?? [])],
        mcpServers: config.mcpServers ?? {},
        permissionMode: SDK_PERMISSION_MODE,
        canUseTool: createToolGate(config.allowedTools ?? EMPTY_ALLOWED_TOOLS),
        hooks: {
            PostToolUse: [{ hooks: [logToolCall] }],
            PostToolUseFailure: [{ hooks: [logToolCall] }],
        },
        maxTurns: config.maxTurns,
        outputFormat: { type: OUTPUT_FORMAT_TYPE, schema: config.outputSchema },
        settingSources: [],
        settings: hasCompactWindow ? { autoCompactWindow: config.autoCompactWindow } : undefined,
        persistSession: false,
        cwd: PROJECT_ROOT,
        env: buildSdkEnv(),
    };
}

export async function runAgent<T>(config: AgentRunConfig): Promise<T | null> {
    log(`[${config.name}] starting with model ${getModel()}`);
    const abortController = new AbortController();

    for await (const message of query({ prompt: config.prompt, options: buildOptions(config, abortController) })) {
        logAgentResponse(config.name, message);

        if (isRateLimited(message)) {
            abortController.abort();
            throw new RateLimitError(config.name);
        }

        const isResult = message.type === MESSAGE_TYPES.RESULT;
        if (!isResult) continue;

        const isSuccess = message.subtype === RESULT_SUBTYPES.SUCCESS;
        if (!isSuccess) {
            log(`[${config.name}] stopped without an answer: ${message.subtype} ${JSON.stringify(message.errors)}`);
            return null;
        }

        const hasStructuredOutput = message.structured_output !== undefined && message.structured_output !== null;
        if (!hasStructuredOutput) {
            log(`[${config.name}] returned no structured output: ${truncate(message.result, LOG_LIMITS.CONSOLE_TEXT_CHARS)}`);
            return null;
        }

        return message.structured_output as T;
    }

    log(`[${config.name}] produced no result.`);
    return null;
}
