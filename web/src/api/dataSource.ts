/**
 * Single source of truth for the mock/live toggle.
 *
 * VITE_USE_MOCK=true  (default) — all SDLC hooks use generated mock data.
 * VITE_USE_MOCK=false            — useProjects / useProject / useWeeklyReport
 *                                  call the live NestJS backend on :3001.
 *
 * Hooks outside the current slice (useRisks, useTraceability, usePortfolio)
 * stay on mock regardless of this flag.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
