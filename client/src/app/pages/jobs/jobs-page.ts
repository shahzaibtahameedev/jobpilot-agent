import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { JobRecord, RunStatus, RunType } from '../../core/models';
import { RunService } from '../../core/run.service';
import { ToastService } from '../../core/toast.service';

const VISIBLE_LOG_LINES = 6;

@Component({
  selector: 'app-jobs-page',
  imports: [RouterLink],
  templateUrl: './jobs-page.html',
})
export class JobsPage implements OnInit {
  protected readonly api = inject(ApiService);
  protected readonly runService = inject(RunService);
  protected readonly toastService = inject(ToastService);

  protected readonly jobs = signal<JobRecord[]>([]);
  protected readonly searchQueryText = signal('');
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

  // Mirrors needsEmailDraft on the server: a post already judged a mismatch is not waiting for a draft.
  protected readonly pendingCount = computed(() => {
    const pendingJobs = this.jobs().filter((job) => {
      const isMismatch = job.isMatch === false;
      const isPending = !isMismatch && !this.hasDraft(job);

      return isPending;
    });

    return pendingJobs.length;
  });

  protected readonly isFindJobsRun = computed(() => this.runService.state()?.type === 'find-jobs');
  protected readonly isDraftAllRun = computed(() => this.runService.state()?.type === 'draft-all');
  protected readonly isDraftJobRun = computed(() => this.runService.state()?.type === 'draft-job');

  protected readonly isDraftingSelected = computed(() => {
    const isBusy = this.runService.isRunning() && this.isDraftJobRun();

    return isBusy;
  });

  private lastRunStatus: RunStatus | null = null;

  constructor() {
    effect(() => {
      const runState = this.runService.state();
      if (runState === null) return;

      const wasRunning = this.lastRunStatus === 'running';
      const isFinished = runState.status === 'completed' || runState.status === 'failed';
      const runType = runState.type;
      const isJobsRun = runType === 'find-jobs' || runType === 'draft-all' || runType === 'draft-job';
      this.lastRunStatus = runState.status;

      if (!wasRunning || !isFinished || !isJobsRun) return;

      const isCompleted = runState.status === 'completed';
      if (isCompleted) {
        this.toastService.success(this.describeFinishedRun(runType));
      } else {
        this.toastService.error(`${this.describeRun(runType)} stopped: ${runState.error}`);
      }

      const isDraftRun = runType === 'draft-all' || runType === 'draft-job';
      this.loadJobs(isDraftRun);
    });
  }

  ngOnInit(): void {
    this.loadJobs(false);
    this.loadSearchQuery();
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

  protected async onDraftAll(): Promise<void> {
    try {
      await this.runService.startDraftAll();
      this.toastService.success(`Drafting ${this.pendingCount()} emails. One model call per job.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    }
  }

  protected async onDraftSelected(): Promise<void> {
    const job = this.selectedJob();
    if (job === null) return;

    try {
      await this.runService.startDraftJob(job.id);
      this.toastService.success(`Drafting the email for ${job.companyName || job.authorName || job.email}.`);
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
      await this.loadJobs(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    } finally {
      this.isSending.set(false);
    }
  }

  protected recentLogs(): string[] {
    const logs = this.runService.state()?.logs ?? [];
    const visibleCount = this.isLogsExpanded() ? logs.length : VISIBLE_LOG_LINES;
    const recent = logs.slice(-visibleCount);

    return recent;
  }

  private describeRun(runType: RunType | null): string {
    switch (runType) {
      case 'find-jobs':
        return 'Find Jobs';
      case 'draft-all':
        return 'Draft all';
      case 'draft-job':
        return 'Drafting';
      default:
        return 'The run';
    }
  }

  private describeFinishedRun(runType: RunType | null): string {
    switch (runType) {
      case 'find-jobs':
        return 'Find Jobs finished. Draft the emails you want to send.';
      case 'draft-all':
        return 'Drafting finished. Review each email before sending.';
      case 'draft-job':
        return 'Draft ready. Review it before sending.';
      default:
        return 'The run finished.';
    }
  }

  private async loadSearchQuery(): Promise<void> {
    try {
      const response = await this.api.getSearchQuery();
      this.searchQueryText.set(response.searchQuery.query);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    }
  }

  private async loadJobs(shouldResyncSelection: boolean): Promise<void> {
    try {
      const jobs = await this.api.getJobs();
      this.jobs.set(jobs);

      const selectedJob = jobs.find((job) => job.id === this.selectedId()) ?? null;
      const isSelectionGone = selectedJob === null;
      if (isSelectionGone) {
        this.selectedId.set('');
        return;
      }

      if (shouldResyncSelection) {
        this.subjectDraft.set(selectedJob.subject ?? '');
        this.bodyDraft.set(selectedJob.body ?? '');
      }
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
