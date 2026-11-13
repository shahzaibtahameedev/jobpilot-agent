import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import type { ProcessedRecord } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-processed-page',
  imports: [],
  templateUrl: './processed-page.html',
})
export class ProcessedPage implements OnInit {
  protected readonly api = inject(ApiService);
  protected readonly toastService = inject(ToastService);

  protected readonly records = signal<ProcessedRecord[]>([]);
  protected readonly searchText = signal('');
  protected readonly expandedKey = signal('');

  protected readonly filteredRecords = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const isEmptyQuery = query.length === 0;
    if (isEmptyQuery) return this.records();

    const matches = this.records().filter((record) => {
      const haystack = `${record.companyName} ${record.authorName} ${record.email} ${record.subject ?? ''}`.toLowerCase();

      return haystack.includes(query);
    });

    return matches;
  });

  ngOnInit(): void {
    this.loadRecords();
  }

  protected recordKey(record: ProcessedRecord): string {
    const key = `${record.email}|${record.processedDate}|${record.subject ?? ''}`;

    return key;
  }

  protected onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchText.set(input.value);
  }

  protected onToggleExpand(record: ProcessedRecord): void {
    const key = this.recordKey(record);
    const isSame = this.expandedKey() === key;
    this.expandedKey.set(isSame ? '' : key);
  }

  private async loadRecords(): Promise<void> {
    try {
      const records = await this.api.getProcessed();
      this.records.set(records);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    }
  }
}
