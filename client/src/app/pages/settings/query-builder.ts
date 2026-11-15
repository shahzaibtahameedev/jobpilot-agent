import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import type { SearchOperator, SearchQueryConfig, SearchQueryGroup } from '../../core/models';
import { compileSearchQuery } from '../../core/search-query';
import { ToastService } from '../../core/toast.service';

const QUERY_LIMITS = {
  MAX_GROUPS: 8,
  MAX_TERMS_PER_GROUP: 12,
  MAX_TERM_CHARS: 80,
} as const;

const OPERATORS: SearchOperator[] = ['AND', 'OR'];

@Component({
  selector: 'app-query-builder',
  imports: [],
  templateUrl: './query-builder.html',
})
export class QueryBuilder implements OnInit {
  protected readonly api = inject(ApiService);
  protected readonly toastService = inject(ToastService);

  protected readonly operators = OPERATORS;
  protected readonly maxTermChars = QUERY_LIMITS.MAX_TERM_CHARS;

  protected readonly groupOperator = signal<SearchOperator>('AND');
  protected readonly groups = signal<SearchQueryGroup[]>([]);
  protected readonly termDrafts = signal<string[]>([]);
  protected readonly savedQuery = signal('');
  protected readonly isSaving = signal(false);
  protected readonly isLoading = signal(true);

  protected readonly preview = computed(() => {
    const config: SearchQueryConfig = { groupOperator: this.groupOperator(), groups: this.groups() };
    const query = compileSearchQuery(config);

    return query;
  });

  protected readonly isDirty = computed(() => {
    const hasChanged = this.preview() !== this.savedQuery();

    return hasChanged;
  });

  protected readonly canAddGroup = computed(() => {
    const hasRoom = this.groups().length < QUERY_LIMITS.MAX_GROUPS;

    return hasRoom;
  });

  ngOnInit(): void {
    this.load();
  }

  protected onSetGroupOperator(operator: SearchOperator): void {
    this.groupOperator.set(operator);
  }

  protected onSetTermOperator(groupIndex: number, operator: SearchOperator): void {
    const current = this.groups()[groupIndex];
    const group: SearchQueryGroup = { operator, terms: current.terms };

    this.replaceGroup(groupIndex, group);
  }

  protected onTermDraftInput(groupIndex: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const updatedDrafts = this.termDrafts().map((draft, index) => {
      const isTarget = index === groupIndex;

      return isTarget ? input.value : draft;
    });

    this.termDrafts.set(updatedDrafts);
  }

  protected onAddTerm(groupIndex: number): void {
    const draft = this.termDrafts()[groupIndex] ?? '';
    const term = draft.trim();

    const isBlank = term.length === 0;
    if (isBlank) return;

    const isTooLong = term.length > QUERY_LIMITS.MAX_TERM_CHARS;
    if (isTooLong) {
      this.toastService.error(`Keep each term under ${QUERY_LIMITS.MAX_TERM_CHARS} characters.`);
      return;
    }

    const hasQuote = term.includes('"');
    if (hasQuote) {
      this.toastService.error('Leave the quotes out. JobPilot wraps every term in quotes for you.');
      return;
    }

    const current = this.groups()[groupIndex];
    const isDuplicate = current.terms.some((existing) => existing.toLowerCase() === term.toLowerCase());
    if (isDuplicate) {
      this.toastService.error(`"${term}" is already in this group.`);
      return;
    }

    const isFull = current.terms.length >= QUERY_LIMITS.MAX_TERMS_PER_GROUP;
    if (isFull) {
      this.toastService.error(`A group holds at most ${QUERY_LIMITS.MAX_TERMS_PER_GROUP} terms.`);
      return;
    }

    const updatedTerms = current.terms.concat(term);
    const group: SearchQueryGroup = { operator: current.operator, terms: updatedTerms };
    this.replaceGroup(groupIndex, group);
    this.clearTermDraft(groupIndex);
  }

  protected onRemoveTerm(groupIndex: number, termIndex: number): void {
    const current = this.groups()[groupIndex];
    const updatedTerms = current.terms.filter((term, index) => index !== termIndex);

    const isEmptied = updatedTerms.length === 0;
    if (isEmptied) {
      this.toastService.error('A group needs at least one term. Remove the whole group instead.');
      return;
    }

    const group: SearchQueryGroup = { operator: current.operator, terms: updatedTerms };
    this.replaceGroup(groupIndex, group);
  }

  protected onAddGroup(): void {
    const isFull = !this.canAddGroup();
    if (isFull) {
      this.toastService.error(`A query holds at most ${QUERY_LIMITS.MAX_GROUPS} groups.`);
      return;
    }

    const group: SearchQueryGroup = { operator: 'OR', terms: [] };
    const updatedGroups = this.groups().concat(group);
    const updatedDrafts = this.termDrafts().concat('');

    this.groups.set(updatedGroups);
    this.termDrafts.set(updatedDrafts);
  }

  protected onRemoveGroup(groupIndex: number): void {
    const isLastGroup = this.groups().length === 1;
    if (isLastGroup) {
      this.toastService.error('A query needs at least one group.');
      return;
    }

    const updatedGroups = this.groups().filter((group, index) => index !== groupIndex);
    const updatedDrafts = this.termDrafts().filter((draft, index) => index !== groupIndex);

    this.groups.set(updatedGroups);
    this.termDrafts.set(updatedDrafts);
  }

  protected async onSave(): Promise<void> {
    const emptyGroupIndex = this.groups().findIndex((group) => group.terms.length === 0);
    const hasEmptyGroup = emptyGroupIndex >= 0;
    if (hasEmptyGroup) {
      this.toastService.error(`Group ${emptyGroupIndex + 1} has no terms yet.`);
      return;
    }

    this.isSaving.set(true);

    try {
      const config: SearchQueryConfig = { groupOperator: this.groupOperator(), groups: this.groups() };
      const searchQuery = await this.api.saveSearchQuery(config);
      this.applyConfig(searchQuery.groupOperator, searchQuery.groups, searchQuery.query);
      this.toastService.success('Search query saved. The next Find Jobs run will use it.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected async onReset(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.isLoading.set(true);

    try {
      const response = await this.api.getSearchQuery();
      const searchQuery = response.searchQuery;
      this.applyConfig(searchQuery.groupOperator, searchQuery.groups, searchQuery.query);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    } finally {
      this.isLoading.set(false);
    }
  }

  private applyConfig(groupOperator: SearchOperator, groups: SearchQueryGroup[], query: string): void {
    const copiedGroups = groups.map((group) => {
      const copy: SearchQueryGroup = { operator: group.operator, terms: group.terms.slice() };

      return copy;
    });
    const drafts = copiedGroups.map(() => '');

    this.groupOperator.set(groupOperator);
    this.groups.set(copiedGroups);
    this.termDrafts.set(drafts);
    this.savedQuery.set(query);
  }

  private replaceGroup(groupIndex: number, group: SearchQueryGroup): void {
    const updatedGroups = this.groups().map((current, index) => {
      const isTarget = index === groupIndex;

      return isTarget ? group : current;
    });

    this.groups.set(updatedGroups);
  }

  private clearTermDraft(groupIndex: number): void {
    const updatedDrafts = this.termDrafts().map((draft, index) => {
      const isTarget = index === groupIndex;

      return isTarget ? '' : draft;
    });

    this.termDrafts.set(updatedDrafts);
  }
}
