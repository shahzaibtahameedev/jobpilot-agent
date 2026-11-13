import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import type { JobRecord, RunStatus } from '../../core/models';
import { RunService } from '../../core/run.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-jobs-page',
  imports: [],
  templateUrl: './jobs-page.html',
})
export class JobsPage implements OnInit {
  protected readonly api = inject(ApiService);
  protected readonly runService = inject(RunService);
  protected readonly toastService = inject(ToastService);

  protected readonly jobs = signal<JobRecord[]>([]);
  protected readonly selectedId = signal('');
  protected readonly subjectDraft = signal('');
  protected readonly bodyDraft = signal('');
  protected readonly isSending = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly isPostExpanded = signal(false);
  protected readonly isLogsExpanded = signal(false);

  protected readonly selectedJob = computed(() => {
    const job = this.jobs().find((candidate) => candidate.id === this.selectedId()) ?? null;

    return job;
  });

  protected readonly isFindJobsRun = computed(() => this.runService.state()?.type === 'find-jobs');

  private lastRunStatus: RunStatus | null = null;

  constructor() {
    effect(() => {
      const runState = this.runService.state();
      if (runState === null) return;

      const wasRunning = this.lastRunStatus === 'running';
      const isFinished = runState.status === 'completed' || runState.status === 'failed';
      const isFindJobs = runState.type === 'find-jobs';
      this.lastRunStatus = runState.status;

      if (!wasRunning || !isFinished || !isFindJobs) return;

      if (runState.status === 'completed') {
        this.toastService.success('Find Jobs finished. The refined list is ready below.');
      } else {
        this.toastService.error(`Find Jobs stopped: ${runState.error}`);
      }

      this.loadJobs();
    });
  }

  ngOnInit(): void {
    this.loadJobs();
  }

  protected hasDraft(job: JobRecord): boolean {
    const isDrafted = Boolean(job.subject && job.body);

    return isDrafted;
  }

  protected async onFindJobs(): Promise<void> {
    try {
      await this.runService.startFindJobs();
      this.toastService.success('Find Jobs started. Scraping can take a few minutes.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    }
  }

  protected onSelectJob(job: JobRecord): void {
    this.selectedId.set(job.id);
    this.subjectDraft.set(job.subject ?? '');
    this.bodyDraft.set(job.body ?? '');
    this.isPostExpanded.set(false);
  }

  protected onSubjectInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.subjectDraft.set(input.value);
  }

  protected onBodyInput(event: Event): void {
    const area = event.target as HTMLTextAreaElement;
    this.bodyDraft.set(area.value);
  }

  protected async onSaveDraft(): Promise<void> {
    const job = this.selectedJob();
    if (job === null) return;

    this.isSaving.set(true);

    try {
      const updatedJob = await this.api.updateJob(job.id, this.subjectDraft(), this.bodyDraft());
      this.replaceJob(updatedJob);
      this.toastService.success('Draft saved.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected async onSend(): Promise<void> {
    const job = this.selectedJob();
    if (job === null) return;

    this.isSending.set(true);

    try {
      await this.api.sendJob(job.id, this.subjectDraft(), this.bodyDraft());
      this.toastService.success(`Email sent to ${job.email}.`);
      this.selectedId.set('');
      await this.loadJobs();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    } finally {
      this.isSending.set(false);
    }
  }

  protected recentLogs(): string[] {
    const logs = this.runService.state()?.logs ?? [];
    const visibleCount = this.isLogsExpanded() ? logs.length : 6;
    const recent = logs.slice(-visibleCount);

    return recent;
  }

  private async loadJobs(): Promise<void> {
    try {
      const jobs = await this.api.getJobs();
      this.jobs.set(jobs);

      const selectedStillExists = jobs.some((job) => job.id === this.selectedId());
      if (!selectedStillExists) this.selectedId.set('');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    }
  }

  private replaceJob(updatedJob: JobRecord): void {
    const updatedJobs = this.jobs().map((job) => {
      const isSame = job.id === updatedJob.id;

      return isSame ? updatedJob : job;
    });

    this.jobs.set(updatedJobs);
  }
}
