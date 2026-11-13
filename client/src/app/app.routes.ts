import { Routes } from '@angular/router';
import { JobsPage } from './pages/jobs/jobs-page';
import { ProcessedPage } from './pages/processed/processed-page';
import { SettingsPage } from './pages/settings/settings-page';

export const routes: Routes = [
  { path: '', component: JobsPage },
  { path: 'processed', component: ProcessedPage },
  { path: 'settings', component: SettingsPage },
  { path: '**', redirectTo: '' },
];
