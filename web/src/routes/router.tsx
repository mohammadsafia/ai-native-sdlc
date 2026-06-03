import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { AuthGuard, AuthLayout, DashboardLayout, ErrorBoundary } from '@layouts';

import { FULL_ROUTES_PATH } from './routes';

const HomePage = lazy(() => import('@pages/home/HomePage'));
const ComponentsGalleryPage = lazy(() => import('@pages/components/ComponentsGalleryPage'));
const ComponentDetailPage = lazy(() => import('@pages/components/ComponentDetailPage'));
const PortfolioPage = lazy(() => import('@pages/dashboard/PortfolioPage'));
const ProjectsPage = lazy(() => import('@pages/dashboard/ProjectsPage'));
const ProjectHubPage = lazy(() => import('@pages/dashboard/ProjectHubPage'));
const WeeklyReportPage = lazy(() => import('@pages/dashboard/WeeklyReportPage'));
const TraceabilityPage = lazy(() => import('@pages/dashboard/TraceabilityPage'));
const RisksPage = lazy(() => import('@pages/dashboard/RisksPage'));
const RiskDetailPage = lazy(() => import('@pages/dashboard/RiskDetailPage'));

export const router = createBrowserRouter([
  // Public routes
  {
    path: FULL_ROUTES_PATH.HOME.INDEX,
    errorElement: <ErrorBoundary />,
    children: [
      {
        index: true,
        element: <Suspense><HomePage /></Suspense>,
      },
    ],
  },

  // Auth routes (login, register, etc.) — redirects to dashboard if already authenticated
  {
    path: FULL_ROUTES_PATH.AUTH.INDEX,
    element: <AuthLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        path: FULL_ROUTES_PATH.AUTH.LOGIN,
        element: <div>Login Page</div>,
      },
    ],
  },

  // Dashboard routes — protected by AuthGuard
  {
    element: <AuthGuard />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          {
            path: FULL_ROUTES_PATH.HOME.DASHBOARD,
            element: <div className="p-6">Dashboard</div>,
          },
          {
            path: FULL_ROUTES_PATH.COMPONENTS.INDEX,
            element: <ComponentsGalleryPage />,
          },
          {
            path: FULL_ROUTES_PATH.COMPONENTS.DETAIL,
            element: <ComponentDetailPage />,
          },
          {
            path: FULL_ROUTES_PATH.PORTFOLIO.INDEX,
            element: <Suspense><PortfolioPage /></Suspense>,
          },
          {
            path: FULL_ROUTES_PATH.PROJECTS.INDEX,
            element: <Suspense><ProjectsPage /></Suspense>,
          },
          {
            path: FULL_ROUTES_PATH.PROJECTS.DETAIL,
            element: <Suspense><ProjectHubPage /></Suspense>,
          },
          {
            path: FULL_ROUTES_PATH.REPORTS.INDEX,
            element: <Suspense><WeeklyReportPage /></Suspense>,
          },
          {
            path: FULL_ROUTES_PATH.TRACEABILITY.INDEX,
            element: <Suspense><TraceabilityPage /></Suspense>,
          },
          {
            path: FULL_ROUTES_PATH.RISKS.INDEX,
            element: <Suspense><RisksPage /></Suspense>,
          },
          {
            path: FULL_ROUTES_PATH.RISKS.DETAIL,
            element: <Suspense><RiskDetailPage /></Suspense>,
          },
          {
            path: FULL_ROUTES_PATH.SETTINGS.INDEX,
            element: <div className="p-6">Settings</div>,
          },
        ],
      },
    ],
  },

  // Catch-all 404
  {
    path: '*',
    element: (
      <div className="text-muted-foreground flex h-dvh items-center justify-center text-lg">
        404 — Page not found
      </div>
    ),
  },
]);
