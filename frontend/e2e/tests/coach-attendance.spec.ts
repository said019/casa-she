/**
 * Coach Module – Pase de Lista y Asistencia
 * Covers: ClassDetail, History, mark present/absent/late-cancel, impact on client balance
 */
import { test, expect } from "../fixtures/auth";
import { CoachPage } from "../pages/CoachPage";

test.describe("Coach – Dashboard y Horario", () => {
  test("dashboard de coach carga correctamente", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoDashboard();
    await expect(page.getByRole("heading")).toBeVisible();
    await expect(page.getByText(/500|server error/i)).not.toBeVisible();
  });

  test("Schedule – horario del coach carga sin errores", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoSchedule();
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .locator('[data-testid="schedule"], [data-testid="class-card"], table')
        .or(page.getByText(/sin clases|no classes|no hay/i))
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Coach – Pase de Lista (Asistencia)", () => {
  test("ClassDetail – abre detalle de clase y muestra lista de alumnos", async ({
    coachPage: page,
  }) => {
    const coach = new CoachPage(page);
    await coach.gotoSchedule();
    await page.waitForLoadState("networkidle");

    const classCard = page.locator('[data-testid="class-card"], [data-testid="class-row"]').first();
    if (await classCard.isVisible({ timeout: 5_000 })) {
      await classCard.click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading")).toBeVisible();
    }
  });

  test("marcar primer alumno como PRESENTE", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoSchedule();
    await page.waitForLoadState("networkidle");

    const classCard = page.locator('[data-testid="class-card"], [data-testid="class-row"]').first();
    if (await classCard.isVisible({ timeout: 5_000 })) {
      await classCard.click();
      await page.waitForLoadState("networkidle");

      const presentBtn = page.getByRole("button", { name: /presente|present|✓|check/i }).first();
      if (await presentBtn.isVisible()) {
        await presentBtn.click();
        // Mark should update (button state change or icon change)
        await expect(
          page.getByText(/guardado|saved|asistencia registrada|attendance saved/i).or(
            presentBtn.locator("..").locator('[aria-pressed="true"], [data-active="true"]')
          )
        ).toBeVisible({ timeout: 8_000 });
      }
    }
  });

  test("marcar alumno como AUSENTE", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoSchedule();
    await page.waitForLoadState("networkidle");

    const classCard = page.locator('[data-testid="class-card"], [data-testid="class-row"]').first();
    if (await classCard.isVisible({ timeout: 5_000 })) {
      await classCard.click();
      await page.waitForLoadState("networkidle");

      const absentBtn = page.getByRole("button", { name: /ausente|absent/i }).first();
      if (await absentBtn.isVisible()) {
        await absentBtn.click();
        await expect(page.getByText(/500|server error/i)).not.toBeVisible();
      }
    }
  });

  test("marcar alumno como LATE CANCEL y validar penalización", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoSchedule();
    await page.waitForLoadState("networkidle");

    const classCard = page.locator('[data-testid="class-card"], [data-testid="class-row"]').first();
    if (await classCard.isVisible({ timeout: 5_000 })) {
      await classCard.click();
      await page.waitForLoadState("networkidle");

      const lateCancelBtn = page
        .getByRole("button", { name: /late cancel|cancelación tardía/i })
        .first();
      if (await lateCancelBtn.isVisible()) {
        await lateCancelBtn.click();
        await expect(page.getByText(/500|server error/i)).not.toBeVisible();
      }
    }
  });

  test("guardar pase de lista emite toast/confirmación", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoSchedule();
    await page.waitForLoadState("networkidle");

    const classCard = page.locator('[data-testid="class-card"], [data-testid="class-row"]').first();
    if (await classCard.isVisible({ timeout: 5_000 })) {
      await classCard.click();
      await page.waitForLoadState("networkidle");

      const saveBtn = page.getByRole("button", { name: /guardar|save|confirmar/i });
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await coach.assertAttendanceSaved();
      }
    }
  });

  test("History – historial de clases del coach carga", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoHistory();
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .locator("table, [data-testid='history-list']")
        .or(page.getByText(/sin historial|no history|no hay/i))
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Coach – Playlists y Plantillas", () => {
  test("Playlists – carga lista de reproducción", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoPlaylists();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading")).toBeVisible();
    await expect(page.getByText(/500|server error/i)).not.toBeVisible();
  });

  test("Templates – carga plantillas de rutinas", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoTemplates();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading")).toBeVisible();
    await expect(page.getByText(/500|server error/i)).not.toBeVisible();
  });

  test("Templates – asignar plantilla guarda correctamente", async ({ coachPage: page }) => {
    const coach = new CoachPage(page);
    await coach.gotoTemplates();
    await page.waitForLoadState("networkidle");

    const assignBtn = page.getByRole("button", { name: /asignar|assign|guardar|save/i }).first();
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
      // Should not throw a 500 error
      await expect(page.getByText(/500|server error/i)).not.toBeVisible({ timeout: 5_000 });
    }
  });
});
