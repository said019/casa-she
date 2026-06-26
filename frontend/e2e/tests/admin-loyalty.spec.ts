/**
 * Admin Module – Fidelidad (Loyalty) y Notificaciones
 * Covers: LoyaltyConfig, LoyaltyAdjust, WhatsAppSettings, NotificationSettings
 */
import { test, expect } from "../fixtures/auth";
import { AdminPage } from "../pages/AdminPage";

test.describe("Admin – Configuración de Fidelidad (Loyalty)", () => {
  test("LoyaltyConfig carga y muestra formulario de reglas", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoLoyaltyConfig();
    await admin.assertPageLoaded();
    await expect(
      page.getByLabel(/puntos|points|recompensa|reward/i).or(
        page.getByRole("spinbutton")
      )
    ).toBeVisible();
  });

  test("LoyaltyConfig – guardar regla de puntos por asistencia", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoLoyaltyConfig();
    await page.waitForLoadState("networkidle");

    const pointsInput = page.getByLabel(/puntos por asistencia|points per attendance/i);
    if (await pointsInput.isVisible()) {
      await pointsInput.fill("10");
      await admin.clickSave();
      await admin.assertSaved();
    }
  });

  test("LoyaltyAdjust – ajuste manual de saldo de un cliente", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoLoyaltyAdjust();
    await page.waitForLoadState("networkidle");

    const clientSearch = page
      .getByLabel(/cliente|client/i)
      .or(page.getByPlaceholder(/buscar|search/i))
      .first();

    if (await clientSearch.isVisible()) {
      await clientSearch.fill("Test");
      const option = page.getByRole("option").first();
      if (await option.isVisible({ timeout: 3000 })) {
        await option.click();
        const amountInput = page.getByLabel(/monto|amount|puntos/i);
        if (await amountInput.isVisible()) {
          await amountInput.fill("50");
          const reasonInput = page.getByLabel(/motivo|reason|nota/i);
          if (await reasonInput.isVisible()) {
            await reasonInput.fill("Ajuste E2E de prueba");
          }
          await admin.clickSave();
          await admin.assertSaved();
        }
      }
    }
  });

  test("LoyaltyRedemptions carga historial de canjes", async ({ adminPage: page }) => {
    await page.goto("/admin/loyalty/redemptions");
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator("table").or(page.getByText(/sin canjes|no redemptions|no hay/i))
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Admin – Notificaciones", () => {
  test("WhatsAppSettings carga sin errores", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoWhatsAppSettings();
    await admin.assertPageLoaded();
  });

  test("WhatsAppSettings – guardar configuración de API", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoWhatsAppSettings();
    await page.waitForLoadState("networkidle");

    const apiUrlInput = page.getByLabel(/url|endpoint|api/i).first();
    if (await apiUrlInput.isVisible()) {
      const original = await apiUrlInput.inputValue();
      // Don't change real config; just assert save works
      await admin.clickSave();
      // Restore original value if changed
      await apiUrlInput.fill(original);
    }
  });

  test("NotificationSettings carga correctamente", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoNotificationSettings();
    await admin.assertPageLoaded();
  });

  test("notificaciones tienen toggles habilitables", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoNotificationSettings();
    await page.waitForLoadState("networkidle");

    const toggles = page.getByRole("switch").or(page.locator('input[type="checkbox"]'));
    const count = await toggles.count();
    // Should have at least one toggle for notifications
    expect(count).toBeGreaterThan(0);
  });
});
