import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const TOAST_LIFETIME_MS = 4500;

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  private nextId = 1;

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('error', text);
  }

  dismiss(id: number): void {
    const remaining = this.toasts().filter((toast) => toast.id !== id);
    this.toasts.set(remaining);
  }

  private push(kind: ToastKind, text: string): void {
    const toast: Toast = { id: this.nextId, kind, text };
    this.nextId++;

    const updated = this.toasts().concat(toast);
    this.toasts.set(updated);

    setTimeout(() => this.dismiss(toast.id), TOAST_LIFETIME_MS);
  }
}
