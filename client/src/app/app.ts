import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './core/api.service';
import type { FreeModelLimits } from './core/models';
import { RunService } from './core/run.service';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly api = inject(ApiService);
  protected readonly runService = inject(RunService);
  protected readonly toastService = inject(ToastService);

  protected readonly limits = signal<FreeModelLimits | null>(null);
  protected readonly limitsLabel = signal('');
  protected readonly isLimitsOpen = signal(false);
  protected readonly isLimitsLoading = signal(false);

  ngOnInit(): void {
    this.runService.refresh().catch(() => undefined);
  }

  protected isSessionRunning(): boolean {
    const runState = this.runService.state();
    const isSession = runState?.type === 'session' && runState.status === 'running';

    return isSession;
  }

  protected async onSaveSession(): Promise<void> {
    try {
      await this.runService.startSession();
      this.toastService.success('Chrome is opening. Finish the LinkedIn login in that window.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    }
  }

  protected async onToggleLimits(): Promise<void> {
    const isOpen = this.isLimitsOpen();
    if (isOpen) {
      this.isLimitsOpen.set(false);
      return;
    }

    this.isLimitsOpen.set(true);
    this.isLimitsLoading.set(true);

    try {
      const response = await this.api.getLimits();
      const freeLimits = response.data?.free_model_daily_requests ?? null;
      this.limits.set(freeLimits);
      this.limitsLabel.set(response.data?.label ?? '');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
      this.isLimitsOpen.set(false);
    } finally {
      this.isLimitsLoading.set(false);
    }
  }
}
