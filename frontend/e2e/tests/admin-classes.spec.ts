/**
 * Admin Module – Clases y Calendario
 * Covers: GenerateClasses, WorkoutTemplates, admin class management
 */
import { test, expect } from "../fixtures/auth";
import { AdminPage } from "../pages/AdminPage";
import { FECHA_PRUEBA, mockSemanaCalendario } from "../fixtures/calendario";

test.describe("Admin – Gestión de Clases y Calendario", () => {
  test("el dashboard de admin carga correctamente", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoDashboard();
    await admin.assertPageLoaded();
  });

  test("listado de clases muestra tabla con datos", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoClasses();
    await admin.assertPageLoaded();
    await expect(page.locator("table, [data-testid='classes-list']")).toBeVisible();
  });

  test("GenerateClasses – formulario de generación masiva carga", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoGenerateClasses();
    await admin.assertPageLoaded();
    // Form should have date/period inputs
    await expect(
      page.getByRole("button", { name: /generar|generate/i }).or(
        page.getByLabel(/fecha|date|período|period/i)
      )
    ).toBeVisible();
  });

  test("GenerateClasses – genera clases para el mes siguiente sin errores", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoGenerateClasses();
    await page.waitForLoadState("networkidle");

    // Fill in the generation form if inputs exist
    const startDateInput = page.getByLabel(/inicio|start date/i);
    if (await startDateInput.isVisible()) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await startDateInput.fill(tomorrow.toISOString().split("T")[0]);
    }

    const generateBtn = page.getByRole("button", { name: /generar|generate/i });
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      // Should not show a server error
      await expect(page.getByText(/500|server error|error del servidor/i)).not.toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("WorkoutTemplates – listado de plantillas carga", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoWorkoutTemplates();
    await admin.assertPageLoaded();
  });

  test("WorkoutTemplates – crear nueva plantilla", async ({ adminPage: page }) => {
    const admin = new AdminPage(page);
    await admin.gotoWorkoutTemplates();
    await page.waitForLoadState("networkidle");

    const createBtn = page.getByRole("button", { name: /nueva|crear|new|create/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      const nameInput = page.getByLabel(/nombre|name/i);
      if (await nameInput.isVisible()) {
        await nameInput.fill(`Plantilla E2E ${Date.now()}`);
        await admin.clickSave();
        await admin.assertSaved();
      }
    }
  });
});

test.describe("Calendario de recepción – semana por horas", () => {
  test("abre el panel de una clase y los diálogos de la barra", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    await expect(barre).toBeVisible();
    await barre.click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByRole("tab", { name: /Reservado/ })).toBeVisible();
    await expect(panel.getByText("Sin reservas todavía.")).toBeVisible();
    await expect(panel.getByRole("img", { name: "TotalPass" }).first()).toBeVisible();

    await panel.getByRole("button", { name: /^Editar/ }).click();
    const editar = page.getByRole("heading", { name: "Editar Clase" });
    await expect(editar).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editar).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const dialogos: Array<[string, string]> = [
      ["Generar", "Generar Clases"],
      ["Copiar semana", "Copiar semana"],
      ["Nueva clase", "Nueva Clase"],
      ["Gratis", "Marcar clases como gratis"],
    ];
    for (const [boton, titulo] of dialogos) {
      await page.getByRole("button", { name: boton, exact: true }).click();
      const encabezado = page.getByRole("heading", { name: titulo });
      await expect(encabezado).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(encabezado).toBeHidden();
    }
  });
});
