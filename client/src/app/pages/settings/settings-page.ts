import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import type { ResumeMeta } from '../../core/models';
import { ToastService } from '../../core/toast.service';

type SettingsTab = 'profile' | 'template' | 'resume';

const BYTES_PER_KILOBYTE = 1024;

@Component({
  selector: 'app-settings-page',
  imports: [],
  templateUrl: './settings-page.html',
})
export class SettingsPage implements OnInit {
  protected readonly api = inject(ApiService);
  protected readonly toastService = inject(ToastService);

  protected readonly activeTab = signal<SettingsTab>('profile');

  protected readonly profileText = signal('');
  protected readonly signatureText = signal('');
  protected readonly isProfileSaving = signal(false);

  protected readonly templateText = signal('');
  protected readonly placeholders = signal<string[]>([]);
  protected readonly isTemplateSaving = signal(false);

  protected readonly resumeMeta = signal<ResumeMeta | null>(null);
  protected readonly isResumeUploading = signal(false);

  ngOnInit(): void {
    this.loadAll();
  }

  protected onSelectTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
  }

  protected onProfileInput(event: Event): void {
    const area = event.target as HTMLTextAreaElement;
    this.profileText.set(area.value);
  }

  protected onSignatureInput(event: Event): void {
    const area = event.target as HTMLTextAreaElement;
    this.signatureText.set(area.value);
  }

  protected onTemplateInput(event: Event): void {
    const area = event.target as HTMLTextAreaElement;
    this.templateText.set(area.value);
  }

  protected async onSaveProfile(): Promise<void> {
    this.isProfileSaving.set(true);

    try {
      await this.api.saveProfile(this.profileText(), this.signatureText());
      this.toastService.success('Profile saved.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    } finally {
      this.isProfileSaving.set(false);
    }
  }

  protected async onSaveTemplate(): Promise<void> {
    this.isTemplateSaving.set(true);

    try {
      await this.api.saveTemplate(this.templateText());
      this.toastService.success('Template saved.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    } finally {
      this.isTemplateSaving.set(false);
    }
  }

  protected async onResumeSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    if (file === null) return;

    this.isResumeUploading.set(true);

    try {
      const meta = await this.api.uploadResume(file);
      this.resumeMeta.set(meta);
      this.toastService.success('Resume updated.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    } finally {
      this.isResumeUploading.set(false);
      input.value = '';
    }
  }

  protected formatSize(sizeBytes: number): string {
    const kilobytes = sizeBytes / BYTES_PER_KILOBYTE;
    const isMegabytes = kilobytes >= BYTES_PER_KILOBYTE;

    if (isMegabytes) {
      const megabytes = kilobytes / BYTES_PER_KILOBYTE;

      return `${megabytes.toFixed(1)} MB`;
    }

    return `${Math.round(kilobytes)} KB`;
  }

  protected formatDate(isoDate: string): string {
    const isEmpty = isoDate.length === 0;
    if (isEmpty) return '';

    const formatted = new Date(isoDate).toLocaleString();

    return formatted;
  }

  private async loadAll(): Promise<void> {
    try {
      const profileResponse = await this.api.getProfile();
      this.profileText.set(profileResponse.profile);
      this.signatureText.set(profileResponse.signature);

      const templateResponse = await this.api.getTemplate();
      this.templateText.set(templateResponse.template);
      this.placeholders.set(templateResponse.placeholders);

      const resumeMeta = await this.api.getResumeMeta();
      this.resumeMeta.set(resumeMeta);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.toastService.error(reason);
    }
  }
}
