import { Injectable } from '@angular/core';
import type {
  JobRecord,
  LimitsResponse,
  ProcessedRecord,
  ProfileResponse,
  ResumeMeta,
  RunState,
  TemplateResponse,
} from './models';

const API_BASE = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

interface ErrorPayload {
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  async getJobs(): Promise<JobRecord[]> {
    const payload = await this.request<{ jobs: JobRecord[] }>(`${API_BASE}/jobs`);

    return payload.jobs;
  }

  async updateJob(jobId: string, subject: string, body: string): Promise<JobRecord> {
    const payload = await this.request<{ job: JobRecord }>(`${API_BASE}/jobs/${jobId}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ subject, body }),
    });

    return payload.job;
  }

  async sendJob(jobId: string, subject: string, body: string): Promise<void> {
    await this.request<{ sent: boolean }>(`${API_BASE}/jobs/${jobId}/send`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ subject, body }),
    });
  }

  async getProcessed(): Promise<ProcessedRecord[]> {
    const payload = await this.request<{ processed: ProcessedRecord[] }>(`${API_BASE}/processed`);

    return payload.processed;
  }

  async getCurrentRun(): Promise<RunState> {
    const runState = await this.request<RunState>(`${API_BASE}/runs/current`);

    return runState;
  }

  async startFindJobs(): Promise<RunState> {
    const runState = await this.request<RunState>(`${API_BASE}/runs/find-jobs`, { method: 'POST' });

    return runState;
  }

  async startSession(): Promise<RunState> {
    const runState = await this.request<RunState>(`${API_BASE}/runs/session`, { method: 'POST' });

    return runState;
  }

  async getTemplate(): Promise<TemplateResponse> {
    const payload = await this.request<TemplateResponse>(`${API_BASE}/template`);

    return payload;
  }

  async saveTemplate(template: string): Promise<void> {
    await this.request<{ template: string }>(`${API_BASE}/template`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ template }),
    });
  }

  async getProfile(): Promise<ProfileResponse> {
    const payload = await this.request<ProfileResponse>(`${API_BASE}/profile`);

    return payload;
  }

  async saveProfile(profile: string, signature: string): Promise<void> {
    await this.request<ProfileResponse>(`${API_BASE}/profile`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ profile, signature }),
    });
  }

  async getResumeMeta(): Promise<ResumeMeta> {
    const payload = await this.request<ResumeMeta>(`${API_BASE}/resume`);

    return payload;
  }

  async uploadResume(file: File): Promise<ResumeMeta> {
    const formData = new FormData();
    formData.append('file', file);

    const payload = await this.request<ResumeMeta>(`${API_BASE}/resume`, {
      method: 'POST',
      body: formData,
    });

    return payload;
  }

  async getLimits(): Promise<LimitsResponse> {
    const payload = await this.request<LimitsResponse>(`${API_BASE}/limits`);

    return payload;
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const errorPayload = payload as ErrorPayload | null;
      const message = errorPayload?.error ?? `Request failed with status ${response.status}.`;
      throw new Error(message);
    }

    return payload as T;
  }
}
