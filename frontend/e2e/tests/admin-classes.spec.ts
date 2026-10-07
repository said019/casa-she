/**
 * Admin Module – Clases y Calendario
 * Covers: GenerateClasses, WorkoutTemplates, admin class management
 */
import { test, expect } from "../fixtures/auth";
import type { Locator } from "@playwright/test";
import { AdminPage } from "../pages/AdminPage";
import { AHORA_PRUEBA, FECHA_PRUEBA, ID, clasePrueba, mockSemanaCalendario } from "../fixtures/calendario";

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

/** Borde superior en px; NaN si todavía no se ve (expect.poll vuelve a intentar). */
const arriba = async (l: Locator) => (await l.boundingBox())?.y ?? Number.NaN;

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

  test("móvil: la lista del día usa la tarjeta con los lugares", async ({ adminPage: page }) => {
    await page.clock.setFixedTime(AHORA_PRUEBA);
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSemanaCalendario(page);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    // Hoy es miércoles: la lista arranca en ese día.
    await expect(page.getByRole("button", { name: /^Sculpt.*18:00/ })).toContainText("Sin coach asignada");
    await page.locator('[data-dia="2026-11-02"]').click();
    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    await expect(barre.locator('[data-lugar="alumna"]')).toHaveCount(2);
    await expect(barre.locator('[data-lugar="totalpass"]')).toHaveCount(1);
    await expect(barre.locator('[data-lugar="libre"]')).toHaveCount(4);
    await expect(barre).toContainText("3/7");
    await expect(barre).not.toContainText("TP");
  });

  test("semana por horas: compacta las horas vacías, posiciona por hora y pinta los lugares por canal", async ({ adminPage: page }) => {
    await page.clock.setFixedTime(AHORA_PRUEBA);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    const tarjeta = (nombre: RegExp) => page.getByRole("button", { name: nombre });
    const barre = tarjeta(/^Barre.*07:00/);
    const mat = tarjeta(/^Pilates Mat.*08:00/);
    const salsa = tarjeta(/^Salsa.*10:00/);
    const sculpt = tarjeta(/^Sculpt.*18:00/);
    const cancelada = tarjeta(/^Sculpt.*19:00/);
    await expect(barre).toBeVisible();

    // De 11 a 18 no hay clases en toda la semana: se ve como una franja de 32 px.
    await expect(page.getByTestId("franja-compactada")).toHaveText("11 – 18");
    // expect.poll: al cargar, la página vuelve a pedir las clases cuando fija la sucursal
    // y la rejilla se redibuja; se mide cuando ya está quieta.
    await expect.poll(async () => Math.abs((await arriba(mat)) - (await arriba(barre)) - 76)).toBeLessThanOrEqual(1);
    // Salsa 10:00 (sábado) y Sculpt 18:00 (miércoles): 1 h (76 px) + franja (32 px).
    await expect.poll(async () => Math.abs((await arriba(sculpt)) - (await arriba(salsa)) - 108)).toBeLessThanOrEqual(1);

    await expect(barre.locator('[data-lugar="alumna"]')).toHaveCount(2);
    await expect(barre.locator('[data-lugar="totalpass"]')).toHaveCount(1);
    await expect(barre.locator('[data-lugar="libre"]')).toHaveCount(4);
    await expect(barre).toContainText("3/7");
    await expect(barre).not.toContainText("TP");
    await expect(mat).toContainText("Lleno");
    await expect(sculpt).toContainText("Sin coach asignada");
    await expect(cancelada).toContainText("Cancelada");
    await expect(cancelada.locator("[data-nombre-clase]")).toHaveClass(/line-through/);
    await expect(salsa).toHaveAttribute("data-oscura", "true");

    await expect(page.getByTestId("encabezado-2026-11-02")).toContainText("2 clases · 4 libres");
    await expect(page.getByTestId("encabezado-2026-11-03")).toContainText("Sin clases");
    await expect(page.getByTestId("encabezado-2026-11-04")).toContainText("Hoy");
    await expect(page.getByTestId("encabezado-2026-11-04")).toContainText("1 clase · 6 libres");
    await expect(page.getByTestId("resumen-semana")).toHaveText("4 clases · 11 lugares libres · 3 socias");
    await expect(page.getByRole("list", { name: "Leyenda de lugares" }).getByRole("img", { name: "TotalPass" })).toBeVisible();

    // "Ahora" = miércoles 08:25 en CDMX → 85 min después de las 7:00 = 108 px.
    const columna = page.getByTestId("columna-2026-11-04");
    const linea = columna.getByTestId("linea-ahora");
    await expect.poll(async () => Math.abs((await arriba(linea)) - (await arriba(columna)) - 108)).toBeLessThanOrEqual(2);

    await expect(page.getByRole("button", { name: /Limpiar semana/ })).toHaveCount(0);
  });

  test("dos clases a la misma hora se ven lado a lado", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page, [
      clasePrueba({ id: ID.sculptCancelada, date: "2026-11-04", start_time: "19:00", end_time: "19:50", class_type_name: "Sculpt", status: "cancelled" }),
      clasePrueba({ id: ID.sculpt, date: "2026-11-04", start_time: "19:00", end_time: "19:50", class_type_name: "Flex", class_type_color: "#3F5C59" }),
    ]);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    const sculpt = page.getByRole("button", { name: /^Sculpt.*19:00/ });
    const flex = page.getByRole("button", { name: /^Flex.*19:00/ });
    await expect.poll(async () => {
      const a = await sculpt.boundingBox();
      const b = await flex.boundingBox();
      if (!a || !b) return "sin dibujar";
      const [izquierda, derecha] = [a, b].sort((p, q) => p.x - q.x);
      const ladoALado = Math.abs(a.y - b.y) <= 1 && izquierda.x + izquierda.width <= derecha.x + 1 && izquierda.width > 40;
      return ladoALado ? "lado a lado" : `encimadas: ${JSON.stringify([a, b])}`;
    }).toBe("lado a lado");
  });

  test("panel: lugares grandes, acciones, inscribir arriba y cupo por canal conectado", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    const cupos: unknown[] = [];
    await page.route(/\/api\/classes\/[^/?]+\/channels$/, async (route) => {
      cupos.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    const panel = page.getByRole("dialog");
    const lugares = panel.getByTestId("lugares-panel");
    await expect(lugares.locator('[data-lugar="alumna"]')).toHaveCount(2);
    await expect(lugares.locator('[data-lugar="totalpass"]')).toHaveCount(1);
    await expect(lugares).toContainText("3 de 7 · 4 libres");
    for (const boton of ["Editar clase", "Cambiar coach", "Cancelar clase"]) {
      await expect(panel.getByRole("button", { name: boton })).toBeVisible();
    }

    const inscribir = panel.getByRole("heading", { name: "Inscribir alumna" });
    const cupo = panel.getByRole("region", { name: "Lugares para TotalPass" });
    await expect.poll(async () => (await arriba(inscribir)) < (await arriba(cupo))).toBe(true);
    await expect(cupo.getByTestId("cupo-totalpass")).toHaveText("2");
    await cupo.getByRole("button", { name: "Un lugar menos" }).click();
    await expect.poll(() => cupos).toEqual([{ totalpass: 1 }]);

    await panel.getByRole("button", { name: "Cambiar coach" }).click();
    const coach = page.getByRole("heading", { name: "Cambiar coach" });
    await expect(coach).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(coach).toBeHidden();
    // Con un aviso en pantalla, Escape cierra el aviso y no el panel: se cierra con su botón.
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Pilates Mat: 2 socias ya inscritas con cupo 2 → no se puede bajar.
    await page.getByRole("button", { name: /^Pilates Mat.*08:00/ }).click();
    await expect(
      page.getByRole("dialog").getByRole("region", { name: "Lugares para TotalPass" }).getByRole("button", { name: "Un lugar menos" }),
    ).toBeDisabled();
  });
});
