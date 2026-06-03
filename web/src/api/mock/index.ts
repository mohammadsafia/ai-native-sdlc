import { delay } from './latency';
import { PROJECTS, PORTFOLIO } from './fixtures';

export { PROJECTS, PORTFOLIO };

export const api = {
  listProjects: async () => {
    await delay();
    return PROJECTS.map(({ trace: _trace, report: _report, ...p }) => p);
  },
  getProject: async (id: string) => {
    await delay();
    const p = PROJECTS.find((x) => x.id === id);
    if (!p) throw new Error('not found');
    return p;
  },
  getReport: async (id: string) => {
    await delay(700);
    return PROJECTS.find((x) => x.id === id)!.report;
  },
  getPortfolio: async () => {
    await delay();
    return PORTFOLIO;
  },
  listRisks: async () => {
    await delay();
    return PROJECTS.flatMap((p) => p.risks);
  },
  getRisk: async (id: string) => {
    await delay(300);
    return PROJECTS.flatMap((p) => p.risks).find((r) => r.id === id) ?? null;
  },
  getTraceability: async (id: string) => {
    await delay();
    return PROJECTS.find((x) => x.id === id)!.trace;
  },
};
