import '@locales/i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/react';

import { queryClient } from '@api/config';
import { ROUTER } from '@routes';
import { ThemeProvider } from '@contexts';
import { ActiveProjectProvider } from '@contexts';

import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ActiveProjectProvider>
          <NuqsAdapter>
            <RouterProvider router={ROUTER} future={{ v7_startTransition: true }} />
          </NuqsAdapter>
        </ActiveProjectProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
