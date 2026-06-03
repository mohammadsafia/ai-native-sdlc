export const delay = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
