export const ApiEndpoints = {
  DOCTORS: {
    INDEX: '/doctors',
    DETAILS: '/doctors/:doctorId/details',
  },
  SDLC: {
    PROJECTS: '/projects',
    PROJECT: '/projects/:key',
    WEEKLY_REPORT: '/projects/:key/weekly-report',
  },
} as const;
