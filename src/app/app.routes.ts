import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'localizaciones/:id',
        loadComponent: () =>
          import('./features/location/location.page').then((m) => m.LocationPage),
      },
      {
        path: 'stock',
        loadComponent: () =>
          import('./features/stock/stock-overview.page').then((m) => m.StockOverviewPage),
      },
      {
        path: 'historial',
        loadComponent: () => import('./features/history/history.page').then((m) => m.HistoryPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
