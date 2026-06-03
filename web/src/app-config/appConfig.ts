export const APP_CONFIGURATIONS = {
  TOKEN_KEY: 'token',
  VITE_APP_API_URL: import.meta.env.VITE_APP_API_URL ?? 'http://localhost:3001/api',
} as const;

