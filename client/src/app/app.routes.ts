import { Routes } from '@angular/router';
import { JobsPage } from './pages/jobs/jobs-page';
import { ResultsPage } from './pages/results/results-page';
import { SettingsPage } from './pages/settings/settings-page';

export const routes: Routes = [
  { path: '', component: JobsPage },
  { path: 'results', component: ResultsPage },
  { path: 'processed', redirectTo: 'results' },
  { path: 'settings', component: SettingsPage },
  { path: '**', redirectTo: '' },
];
