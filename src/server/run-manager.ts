import { RUN_LOG_LIMIT, RUN_STATUSES } from "../constants.ts";
import type { RunState, RunType } from "../interfaces.ts";
import { setLogListener } from "../utils/logger.ts";

const state: RunState = {
    type: null,
    status: RUN_STATUSES.IDLE,
    stage: "",
    logs: [],
    error: "",
    startedAt: "",
    finishedAt: "",
};

export function getRunState(): RunState {
    return state;
}

export function isRunActive(): boolean {
    const isActive = state.status === RUN_STATUSES.RUNNING;

    return isActive;
}

export function setRunStage(stage: string): void {
    state.stage = stage;
}

export function startRun(type: RunType, task: () => Promise<void>): void {
    state.type = type;
    state.status = RUN_STATUSES.RUNNING;
    state.stage = "";
    state.logs = [];
    state.error = "";
    state.startedAt = new Date().toISOString();
    state.finishedAt = "";

    setLogListener(appendRunLog);

    task()
        .then(() => {
            state.status = RUN_STATUSES.COMPLETED;
        })
        .catch((error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            state.status = RUN_STATUSES.FAILED;
            state.error = reason;
        })
        .finally(() => {
            state.finishedAt = new Date().toISOString();
            setLogListener(null);
        });
}

function appendRunLog(message: string): void {
    state.logs.push(message);

    const isOverLimit = state.logs.length > RUN_LOG_LIMIT;
    if (isOverLimit) state.logs.shift();
}
