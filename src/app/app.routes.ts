import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'acceso',
    loadComponent: () => import('./features/access/access.page').then((m) => m.AccessPage),
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
      {
        path: 'perfil',
        loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'usuarios' },
          {
            path: 'usuarios',
            loadComponent: () => import('./features/admin/users.page').then((m) => m.UsersPage),
          },
          {
            path: 'localizaciones',
            loadComponent: () =>
              import('./features/admin/locations.page').then((m) => m.LocationsPage),
          },
          {
            path: 'articulos',
            loadComponent: () => import('./features/admin/items.page').then((m) => m.ItemsPage),
          },
          {
            path: 'tipos',
            loadComponent: () =>
              import('./features/admin/item-types.page').then((m) => m.ItemTypesPage),
          },
          {
            path: 'avisos',
            loadComponent: () =>
              import('./features/admin/alert-rules.page').then((m) => m.AlertRulesPage),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
