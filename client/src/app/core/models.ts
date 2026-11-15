export interface JobRecord {
  id: string;
  authorName: string;
  email: string;
  companyName: string;
  postContent: string;
  postUrl: string;
  isMatch?: boolean;
  subject?: string;
  body?: string;
}

export interface ProcessedRecord {
  authorName: string;
  email: string;
  companyName: string;
  postContent: string;
  postUrl: string;
  subject?: string;
  body?: string;
  processedDate: string;
}

export type RunType = 'find-jobs' | 'draft-all' | 'draft-job' | 'session';
export type RunStatus = 'idle' | 'running' | 'completed' | 'failed';

export type SearchOperator = 'AND' | 'OR';

export interface SearchQueryGroup {
  operator: SearchOperator;
  terms: string[];
}

export interface SearchQueryConfig {
  groupOperator: SearchOperator;
  groups: SearchQueryGroup[];
}

export interface SearchQueryView extends SearchQueryConfig {
  query: string;
}

export interface SearchQueryResponse {
  searchQuery: SearchQueryView;
  operators: SearchOperator[];
}

export interface RunState {
  type: RunType | null;
  status: RunStatus;
  stage: string;
  logs: string[];
  error: string;
  startedAt: string;
  finishedAt: string;
}

export interface ResumeMeta {
  exists: boolean;
  sizeBytes: number;
  updatedAt: string;
}

export interface TemplateResponse {
  template: string;
  placeholders: string[];
}

export interface ProfileResponse {
  profile: string;
  signature: string;
}

export interface FreeModelLimits {
  limit: number | null;
  used: number | null;
  remaining: number | null;
}

export interface LimitsResponse {
  data?: {
    label?: string;
    usage?: number;
    free_model_daily_requests?: FreeModelLimits;
  };
}
