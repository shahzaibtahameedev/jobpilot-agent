import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import type { ProcessedRecord, SkippedRecord } from '../../core/models';
import { ToastService } from '../../core/toast.service';

type ResultsView = 'sent' | 'skipped';

const NO_REASON_TEXT = 'No reason recorded';

@Component({
  selector: 'app-results-page',
  imports: [],
  templateUrl: './results-page.html',
})
export class ResultsPage implements OnInit {
  protected readonly api = inject(ApiService);
  protected readonly toastService = inject(ToastService);

  protected readonly view = signal<ResultsView>('sent');
  protected readonly sentRecords = signal<ProcessedRecord[]>([]);
  protected readonly skippedRecords = signal<SkippedRecord[]>([]);
  protected readonly searchText = signal('');
  protected readonly expandedKey = signal('');

  protected readonly filteredSent = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const isEmptyQuery = query.length === 0;
    if (isEmptyQuery) return this.sentRecords();

    const matches = this.sentRecords().filter((record) => {
      const haystack = `${record.companyName} ${record.authorName} ${record.email} ${record.subject ?? ''}`.toLowerCase();

      return haystack.includes(query);
    });

    return matches;
  });

  protected readonly filteredSkipped = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const isEmptyQuery = query.length === 0;
    if (isEmptyQuery) return this.skippedRecords();

    const matches = this.skippedRecords().filter((record) => {
      const haystack = `${record.companyName} ${record.authorName} ${record.email} ${record.skipReason ?? ''}`.toLowerCase();

      return haystack.includes(query);
    });

    return matches;
  });

  protected readonly searchPlaceholder = computed(() => {
    const isSent = this.view() === 'sent';
    const placeholder = isSent ? 'Search company, email, subject...' : 'Search company, email, reason...';

    return placeholder;
  });

  ngOnInit(): void {
    this.loadRecords();
  }

  protected sentKey(record: ProcessedRecord): string {
    const key = `${record.email}|${record.processedDate}|${record.subject ?? ''}`;

    return key;
  }

  protected skippedKey(record: SkippedRecord): string {
    const key = `${record.email}|${record.skippedDate}|${record.skipReason ?? ''}`;

    return key;
  }

  protected skipReasonText(record: SkippedRecord): string {
    const reason = record.skipReason?.trim() ?? '';
    const hasReason = reason.length > 0;

    return hasReason ? reason : NO_REASON_TEXT;
  }

  protected onSelectView(view: ResultsView): void {
    this.view.set(view);
    this.expandedKey.set('');
  }

  protected onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchText.set(input.value);
  }

  protected onToggleExpand(key: string): void {
    const isSame = this.expandedKey() === key;
    this.expandedKey.set(isSame ? '' : key);
  }

  private async loadRecords(): Promise<void> {
    try {
      const sentRecords = await this.api.getProcessed();
      this.sentRecords.set(sentRecords);

      const skippedRecords = await this.api.getSkipped();
      this.skippedRecords.set(skippedRecords);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    }
  }
}
