/**
 * Auth & Public Studio Tests
 * Covers: Login, Register, ForgotPassword, ResetPassword, InstructorMagicLogin,
 *         Public pages (StudioHome, StudioPricing, StudioSchedule, StudioInstructors)
 */
import { test, expect } from "@playwright/test";
import { AuthPage } from "../pages/AuthPage";
import { testUsers, unique } from "../fixtures/test-data";
import AxeBuilder from "@axe-core/playwright";

// ─────────────────────────────────────────────────────────────
// 3.1 Public Studio Pages
// ─────────────────────────────────────────────────────────────
test.describe("Studio – Páginas Públicas", () => {
  const publicRoutes = [
    { name: "Inicio", path: "/" },
    { name: "Precios", path: "/studio/pricing" },
    { name: "Horarios", path: "/studio/schedule" },
    { name: "Instructores", path: "/studio/instructors" },
    { name: "Contacto", path: "/studio/contact" },
  ];

  for (const route of publicRoutes) {
    test(`carga correctamente: ${route.name} (${route.path})`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      // Should not show a 404 / error page
      await expect(page.getByRole("main").or(page.locator("body"))).toBeVisible();
      await expect(page.getByText(/404|not found|error/i)).not.toBeVisible();
    });

    test(`${route.name} no tiene violaciones de accesibilidad críticas`, async ({ page }) => {
      await page.goto(route.path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      // Log violations without failing (warn-level for now)
      if (results.violations.length) {
        console.warn(`[a11y] ${route.path} → ${results.violations.length} violation(s)`);
      }
      const critical = results.violations.filter((v) => v.impact === "critical");
      expect(critical).toHaveLength(0);
    });
  }

  test("StudioSchedule es responsivo en móvil", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/studio/schedule");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("main").or(page.locator("body"))).toBeVisible();
    // Horizontal scroll should not appear on viewport
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
  });
});

// ─────────────────────────────────────────────────────────────
// 3.1 Auth – Login
// ─────────────────────────────────────────────────────────────
test.describe("Auth – Inicio de Sesión", () => {
  test("happy path: login exitoso con credenciales válidas", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();
    await authPage.login(
      process.env.CLIENT_EMAIL ?? "cliente@balanceroom.mx",
      process.env.CLIENT_PASSWORD ?? "ClientTest123!"
    );
    await authPage.assertRedirectedToDashboard();
  });

  test("edge case: contraseña incorrecta muestra error", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();
    await authPage.login("cliente@balanceroom.mx", "wrongpassword");
    await authPage.assertError(/contraseña|password|credenciales|invalid/i);
    await expect(page).toHaveURL(/login/);
  });

  test("edge case: correo no registrado muestra error", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();
    await authPage.login(`noexiste-${Date.now()}@fake.com`, "anyPassword1!");
    await authPage.assertError(/no encontrado|not found|invalid|credenciales/i);
  });

  test("edge case: campos vacíos muestran validación", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();
    await authPage.submitBtn.click();
    // Should show HTML5 required or app-level validation
    const isInvalid = await authPage.emailInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    );
    expect(isInvalid).toBe(true);
  });

  test("sesión persiste al recargar la página", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();
    await authPage.login(
      process.env.CLIENT_EMAIL ?? "cliente@balanceroom.mx",
      process.env.CLIENT_PASSWORD ?? "ClientTest123!"
    );
    await authPage.assertRedirectedToDashboard();
    const urlAfterLogin = page.url();
    await page.reload();
    // Should stay logged in (not redirected back to /login)
    await expect(page).not.toHaveURL(/login/);
    expect(page.url()).toBe(urlAfterLogin);
  });
});

// ─────────────────────────────────────────────────────────────
// 3.1 Auth – Registro
// ─────────────────────────────────────────────────────────────
test.describe("Auth – Registro de Cuenta Nueva", () => {
  test("happy path: registro de usuario nuevo", async ({ page }) => {
    const authPage = new AuthPage(page);
    const user = testUsers.newClient();
    await authPage.gotoRegister();
    await authPage.register(user.name, user.email, user.password, user.phone);
    // Should redirect away from /register on success
    await page.waitForURL((url) => !url.pathname.includes("/register"), {
      timeout: 15_000,
    });
    await expect(page).not.toHaveURL(/register/);
  });

  test("edge case: correo ya registrado muestra error", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoRegister();
    // Use a known existing email
    await authPage.register(
      "Existente",
      process.env.CLIENT_EMAIL ?? "cliente@balanceroom.mx",
      "cualquierClave1!"
    );
    await authPage.assertError(/ya registrado|already|existe|taken/i);
  });

  test("edge case: contraseña débil (< 8 caracteres) es rechazada", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoRegister();
    await authPage.register("Test", unique("test") + "@mailinator.com", "abc");
    // Either browser validation or server-side error
    const hasError =
      (await page.getByText(/contraseña|password|weak|débil|corta/i).isVisible()) ||
      (await authPage.emailInput.evaluate(
        (el: HTMLInputElement) => !el.validity.valid
      ));
    expect(hasError).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 3.1 Auth – Recuperación de Contraseña
// ─────────────────────────────────────────────────────────────
test.describe("Auth – Recuperación de Contraseña", () => {
  test("happy path: solicitar reset con correo válido muestra confirmación", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoForgotPassword();
    await authPage.requestPasswordReset(
      process.env.CLIENT_EMAIL ?? "cliente@balanceroom.mx"
    );
    await expect(
      page.getByText(/correo enviado|email sent|revisa tu correo|check your email/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("edge case: correo no registrado no revela info sensible", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoForgotPassword();
    await authPage.requestPasswordReset(`noexiste-${Date.now()}@fake.com`);
    // The message should be generic (not reveal whether email exists)
    await expect(
      page.getByText(/correo enviado|email sent|revisa tu correo/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────
// 3.1 Auth – Instructor Magic Login
// ─────────────────────────────────────────────────────────────
test.describe("Auth – Instructor Magic Login", () => {
  test("token inválido muestra error", async ({ page }) => {
    await page.goto("/instructor/magic-login?token=tokenfalso123abc");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText(/token inválido|invalid token|expirado|expired|no válido/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("ruta magic login existe y responde", async ({ page }) => {
    const response = await page.goto("/instructor/magic-login");
    // Should be a valid HTTP response (not 500)
    expect(response?.status()).toBeLessThan(500);
  });
});
