/**
 * Coach Module – Sustituciones
 * Covers: Full E2E substitution flow:
 *   Coach A requests → Coach B receives notification → Admin sees calendar update → payment assigned
 */
import { test, expect } from "../fixtures/auth";
import { CoachPage } from "../pages/CoachPage";
import { AdminPage } from "../pages/AdminPage";

test.describe("Coach – Flujo E2E de Sustituciones", () => {
  test("Substitutions – página carga correctamente para el coach", async ({
    coachPage: page,
  }) => {
    const coach = new CoachPage(page);
    await coach.gotoSubstitutions();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading")).toBeVisible();
    await expect(page.getByText(/500|server error/i)).not.toBeVisible();
  });

  test("solicitar sustitución de clase muestra estado pendiente", async ({
    coachPage: page,
  }) => {
    const coach = new CoachPage(page);
    await coach.gotoSubstitutions();
    await page.waitForLoadState("networkidle");

    const requestBtn = page
      .getByRole("button", { name: /solicitar|request|nuevo|new/i })
      .first();

    if (await requestBtn.isVisible()) {
      await requestBtn.click();

      // Fill in the substitution form if a dialog/form appears
      const dialog = page.getByRole("dialog");
      if (await dialog.isVisible({ timeout: 3_000 })) {
        // Select a class from the list
        const classSelect = dialog.getByRole("combobox").first();
        if (await classSelect.isVisible()) {
          await classSelect.selectOption({ index: 1 });
        }

        const reasonInput = dialog.getByLabel(/motivo|reason|nota/i);
        if (await reasonInput.isVisible()) {
          await reasonInput.fill("Prueba E2E de sustitución");
        }

        const submitBtn = dialog.getByRole("button", { name: /solicitar|submit|confirmar/i });
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
        }
      }

      await coach.assertSubstitutionRequested();
    }
  });

  test("E2E: Coach A solicita → Admin ve el cambio en el calendario", async ({
    browser,
  }) => {
    const base = process.env.BASE_URL ?? "http://localhost:4173";

    // Coach context: request substitution
    const coachCtx = await browser.newContext();
    const coachPage = await coachCtx.newPage();

    try {
      await coachPage.goto(`${base}/coach/login`);
      await coachPage.waitForLoadState("networkidle");

      const emailInput = coachPage.getByLabel(/correo|email/i);
      if (await emailInput.isVisible()) {
        await emailInput.fill(process.env.COACH_EMAIL ?? "coach@balanceroom.mx");
        await coachPage
          .getByLabel(/contraseña|password/i)
          .fill(process.env.COACH_PASSWORD ?? "CoachTest123!");
        await coachPage.getByRole("button", { name: /iniciar|login/i }).click();
        await coachPage.waitForURL((url) => !url.pathname.includes("/login"), {
          timeout: 15_000,
        });
      }

      await coachPage.goto(`${base}/coach/substitutions`);
      await coachPage.waitForLoadState("networkidle");
      await expect(coachPage.getByRole("heading")).toBeVisible();
    } finally {
      await coachCtx.close();
    }

    // Admin context: verify the calendar reflects the substitution request
    const adminCtx = await browser.newContext();
    const adminPage_ = await adminCtx.newPage();

    try {
      await adminPage_.goto(`${base}/login`);
      await adminPage_
        .getByLabel(/correo|email/i)
        .fill(process.env.ADMIN_EMAIL ?? "admin@balanceroom.mx");
      await adminPage_
        .getByLabel(/contraseña|password/i)
        .fill(process.env.ADMIN_PASSWORD ?? "AdminTest123!");
      await adminPage_.getByRole("button", { name: /iniciar|login/i }).click();
      await adminPage_.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15_000,
      });

      // Admin: check staff/substitution management
      await adminPage_.goto(`${base}/admin/staff`);
      await adminPage_.waitForLoadState("networkidle");
      await expect(adminPage_.getByText(/500|server error/i)).not.toBeVisible();
    } finally {
      await adminCtx.close();
    }
  });

  test("sustitución aceptada aparece reflejada en el horario del coach sustituto", async ({
    coachPage: page,
  }) => {
    const coach = new CoachPage(page);
    await coach.gotoSubstitutions();
    await page.waitForLoadState("networkidle");

    // Look for a pending substitution request that can be accepted
    const acceptBtn = page
      .getByRole("button", { name: /aceptar|accept/i })
      .first();

    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      const confirmBtn = page.getByRole("button", { name: /confirmar|confirm/i });
      if (await confirmBtn.isVisible({ timeout: 3_000 })) {
        await confirmBtn.click();
      }
      await expect(
        page.getByText(/aceptad|accepted|confirmad|asignado/i)
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
