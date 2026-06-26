import { test as base, Page, expect } from "@playwright/test";

// ──────────────────────────────────────────────────────────────
// Shared user credential fixtures
// ──────────────────────────────────────────────────────────────

export type UserRole = "admin" | "client" | "coach" | "reception";

export interface UserCredentials {
  email: string;
  password: string;
  role: UserRole;
}

/** Resolves credentials from env vars at test-run time */
export function credentialsFor(role: UserRole): UserCredentials {
  const map: Record<UserRole, UserCredentials> = {
    admin: {
      email: process.env.ADMIN_EMAIL ?? "admin@balanceroom.mx",
      password: process.env.ADMIN_PASSWORD ?? "AdminTest123!",
      role: "admin",
    },
    client: {
      email: process.env.CLIENT_EMAIL ?? "cliente@balanceroom.mx",
      password: process.env.CLIENT_PASSWORD ?? "ClientTest123!",
      role: "client",
    },
    coach: {
      email: process.env.COACH_EMAIL ?? "coach@balanceroom.mx",
      password: process.env.COACH_PASSWORD ?? "CoachTest123!",
      role: "coach",
    },
    reception: {
      email: process.env.RECEPTION_EMAIL ?? "recepcion@balanceroom.mx",
      password: process.env.RECEPTION_PASSWORD ?? "RecepcionTest123!",
      role: "reception",
    },
  };
  return map[role];
}

// ──────────────────────────────────────────────────────────────
// Login helper — reusable across all tests
// ──────────────────────────────────────────────────────────────

export async function loginAs(page: Page, role: UserRole): Promise<void> {
  const { email, password } = credentialsFor(role);
  const loginPath = role === "coach" ? "/coach/login" : "/login";
  await page.goto(loginPath);

  await page.getByLabel(/correo|email/i).fill(email);
  await page.getByLabel(/contraseña|password/i).fill(password);
  await page.getByRole("button", { name: /iniciar|entrar|login|sign in/i }).click();

  // Wait for redirect away from the login page
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

// ──────────────────────────────────────────────────────────────
// Fixture types
// ──────────────────────────────────────────────────────────────

type AuthFixtures = {
  adminPage: Page;
  clientPage: Page;
  coachPage: Page;
  receptionPage: Page;
};

/**
 * Extended test with pre-authenticated page fixtures for each role.
 *
 * Usage:
 *   import { test } from '../fixtures/auth';
 *   test('admin can see dashboard', async ({ adminPage }) => { … });
 */
export const test = base.extend<AuthFixtures>({
  adminPage: async ({ page }, use) => {
    await loginAs(page, "admin");
    await use(page);
  },

  clientPage: async ({ page }, use) => {
    await loginAs(page, "client");
    await use(page);
  },

  coachPage: async ({ page }, use) => {
    await loginAs(page, "coach");
    await use(page);
  },

  receptionPage: async ({ page }, use) => {
    await loginAs(page, "reception");
    await use(page);
  },
});

export { expect };
