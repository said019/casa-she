import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Safari regression: typing a standalone minus must not be coerced to zero.
export default defineConfig({
    ...base,
    testMatch: '**/calendar-client-memberships.spec.ts',
    grep: /quitar clases|ajustar saldo conserva/,
    projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'], serviceWorkers: 'block' } }],
});
