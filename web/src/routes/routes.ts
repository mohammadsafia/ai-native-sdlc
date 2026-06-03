import type { ElementType } from 'react';

import { LayoutDashboard, Component, Settings, Briefcase, FolderKanban, GitBranch, TriangleAlert, FileText } from 'lucide-react';

export type AppMenu = {
  id: string;
  path: string;
  name?: string;
  permission?: string;
  permissions?: string[];
  roles?: string[];
  icon: ElementType;
  submenu?: AppMenu[];
};

export const FULL_ROUTES_PATH = {
  HOME: {
    INDEX: '/',
    DASHBOARD: '/dashboard',
  },
  AUTH: {
    INDEX: '/auth',
    LOGIN: '/auth/login',
  },
  COMPONENTS: {
    INDEX: '/components',
    DETAIL: '/components/:id',
  },
  SETTINGS: {
    INDEX: '/settings',
  },
  PORTFOLIO: {
    INDEX: '/dashboard/portfolio',
  },
  PROJECTS: {
    INDEX: '/dashboard/projects',
    DETAIL: '/dashboard/projects/:id',
  },
  REPORTS: {
    INDEX: '/dashboard/reports',
  },
  TRACEABILITY: {
    INDEX: '/dashboard/traceability',
  },
  RISKS: {
    INDEX: '/dashboard/risks',
    DETAIL: '/dashboard/risks/:id',
  },
  ROOT: {
    INDEX: '..',
  },
} as const;

export const APP_MENU: AppMenu[] = [
  {
    id: 'dashboard',
    path: FULL_ROUTES_PATH.HOME.DASHBOARD,
    name: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'portfolio',
    path: FULL_ROUTES_PATH.PORTFOLIO.INDEX,
    name: 'Portfolio',
    icon: Briefcase,
  },
  {
    id: 'projects',
    path: FULL_ROUTES_PATH.PROJECTS.INDEX,
    name: 'Projects',
    icon: FolderKanban,
  },
  {
    id: 'traceability',
    path: FULL_ROUTES_PATH.TRACEABILITY.INDEX,
    name: 'Traceability',
    icon: GitBranch,
  },
  {
    id: 'risks',
    path: FULL_ROUTES_PATH.RISKS.INDEX,
    name: 'Risks',
    icon: TriangleAlert,
  },
  {
    id: 'reports',
    path: FULL_ROUTES_PATH.REPORTS.INDEX,
    name: 'Reports',
    icon: FileText,
  },
  {
    id: 'components',
    path: FULL_ROUTES_PATH.COMPONENTS.INDEX,
    name: 'Components',
    icon: Component,
  },
  {
    id: 'settings',
    path: FULL_ROUTES_PATH.SETTINGS.INDEX,
    name: 'Settings',
    icon: Settings,
  },
];
