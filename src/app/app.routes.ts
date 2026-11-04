import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';
import { authGuard } from './core/auth.guard';
import { homeGuard } from './core/home.guard';

/** La franja superior muestra la sección y una flecha para volver a la selección. */
const adminSection = (title: string, icon: string) => ({ title, icon, backTo: '/admin' });

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
        canActivate: [homeGuard],
        data: { title: 'Selecciona una localización', icon: 'home' },
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'localizaciones/:id',
        data: { title: 'Localización', icon: 'place' },
        loadComponent: () =>
          import('./features/location/location.page').then((m) => m.LocationPage),
      },
      {
        path: 'stock',
        data: { title: 'Stock global', icon: 'inventory_2' },
        loadComponent: () =>
          import('./features/stock/stock-overview.page').then((m) => m.StockOverviewPage),
      },
      {
        path: 'historial',
        data: { title: 'Historial', icon: 'history' },
        loadComponent: () => import('./features/history/history.page').then((m) => m.HistoryPage),
      },
      {
        path: 'perfil',
        data: { title: 'Perfil', icon: 'person' },
        loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        data: { title: 'Administración', icon: 'admin_panel_settings' },
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/admin/admin-sections.page').then((m) => m.AdminSectionsPage),
          },
          {
            path: 'usuarios',
            data: adminSection('Usuarios', 'group'),
            loadComponent: () => import('./features/admin/users.page').then((m) => m.UsersPage),
          },
          {
            path: 'localizaciones',
            data: adminSection('Localizaciones', 'warehouse'),
            loadComponent: () =>
              import('./features/admin/locations.page').then((m) => m.LocationsPage),
          },
          {
            path: 'articulos',
            data: adminSection('Artículos', 'inventory'),
            loadComponent: () => import('./features/admin/items.page').then((m) => m.ItemsPage),
          },
          {
            path: 'tipos',
            data: adminSection('Tipos', 'category'),
            loadComponent: () =>
              import('./features/admin/item-types.page').then((m) => m.ItemTypesPage),
          },
          {
            path: 'avisos',
            data: adminSection('Avisos', 'notifications'),
            loadComponent: () =>
              import('./features/admin/alert-rules.page').then((m) => m.AlertRulesPage),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
