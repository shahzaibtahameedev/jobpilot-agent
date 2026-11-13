import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { RunState } from './models';

const POLL_INTERVAL_MS = 2000;

@Injectable({ providedIn: 'root' })
export class RunService {
  private readonly api = inject(ApiService);

  readonly state = signal<RunState | null>(null);
  readonly isRunning = computed(() => this.state()?.status === 'running');

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  async refresh(): Promise<void> {
    const runState = await this.api.getCurrentRun();
    this.state.set(runState);

    const isActive = runState.status === 'running';
    if (isActive) {
      this.ensurePolling();
    } else {
      this.stopPolling();
    }
  }

  async startFindJobs(): Promise<void> {
    const runState = await this.api.startFindJobs();
    this.state.set(runState);
    this.ensurePolling();
  }

  async startSession(): Promise<void> {
    const runState = await this.api.startSession();
    this.state.set(runState);
    this.ensurePolling();
  }

  private ensurePolling(): void {
    const isPolling = this.pollTimer !== null;
    if (isPolling) return;

    this.pollTimer = setInterval(() => {
      this.refresh().catch(() => this.stopPolling());
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    const timer = this.pollTimer;
    if (timer === null) return;

    clearInterval(timer);
    this.pollTimer = null;
  }
}
