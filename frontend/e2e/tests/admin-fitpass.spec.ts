/**
 * Fitpass (admin): ajustes con credenciales y mapeo, cupo por canal en el panel de la
 * clase y alta de asistentes en recepción. La API de Fitpass se simula con page.route;
 * el inicio de sesión sí va al backend local (ver scripts/e2e-local.sh).
 */
import { test, expect } from "../fixtures/auth";
import { FECHA_PRUEBA, ID, SEMANA_PRUEBA, mockSemanaCalendario } from "../fixtures/calendario";

const TIPO_PILATES = "00000000-0000-4000-8000-00000000a002";
const TIPO_BARRE = "00000000-0000-4000-8000-00000000a001";

test.describe("Admin – Fitpass", () => {
  test("ajustes: conecta, mapea automáticamente y guarda una disciplina", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    let conectado = false;
    const credenciales: unknown[] = [];
    const puts: Array<{ ruta: string; cuerpo: unknown }> = [];
    let tipos = [
      { id: TIPO_BARRE, name: "Barre", is_active: true, fitpass_lesson_id: null, fitpass_quota: 0 },
      { id: TIPO_PILATES, name: "Pilates Mat", is_active: true, fitpass_lesson_id: null, fitpass_quota: 0 },
    ];

    await page.route(/\/api\/partners\/fitpass\/credentials\/status$/, (route) =>
      route.fulfill({
        json: { configured: conectado, is_enabled: conectado, email_masked: conectado ? "ca***@casashe.mx" : null, gym_id: conectado ? 9813 : null, verified_at: conectado ? "2026-11-04T14:00:00Z" : null },
      }),
    );
    await page.route(/\/api\/partners\/fitpass\/credentials$/, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      credenciales.push(route.request().postDataJSON());
      conectado = true;
      await route.fulfill({ json: { ok: true, lessons: 2 } });
    });
    await page.route(/\/api\/partners\/fitpass\/lessons$/, (route) =>
      route.fulfill({ json: { lessons: [{ id: 11, name: "Barre Fit" }, { id: 12, name: "Pilates Mat" }] } }),
    );
    await page.route(/\/api\/partners\/fitpass\/sync-status$/, (route) =>
      route.fulfill({ json: { last_run_at: new Date(Date.now() - 5 * 60_000).toISOString(), success: true, details: null } }),
    );
    await page.route(/\/api\/class-types/, (route) => route.fulfill({ json: tipos }));
    await page.route(/\/api\/partners\/fitpass\/lessons\/auto-map$/, async (route) => {
      tipos = tipos.map((t) => (t.id === TIPO_PILATES ? { ...t, fitpass_lesson_id: 12 } : t));
      await route.fulfill({
        json: {
          applied: 1,
          assignments: [{ classTypeId: TIPO_PILATES, classTypeName: "Pilates Mat", lessonId: 12, lessonName: "Pilates Mat" }],
          skipped: [{ classTypeId: TIPO_BARRE, classTypeName: "Barre", reason: "sin coincidencia" }],
        },
      });
    });
    await page.route(/\/api\/partners\/fitpass\/class-types\/[^/]+\/lesson$/, async (route) => {
      puts.push({ ruta: new URL(route.request().url()).pathname, cuerpo: route.request().postDataJSON() });
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto("/admin/settings/fitpass");
    await expect(page.getByRole("heading").getByRole("img", { name: "Fitpass" })).toBeVisible();
    await expect(page.getByLabel("ID del gimnasio")).toHaveValue("9813");

    await page.getByLabel("Correo del portal").fill("casa@casashe.mx");
    await page.getByLabel("Contraseña").fill("secreta123");
    await page.getByRole("button", { name: "Conectar" }).click();
    await expect.poll(() => credenciales).toEqual([{ email: "casa@casashe.mx", password: "secreta123", gym_id: 9813 }]);
    await expect(page.getByText("ca***@casashe.mx")).toBeVisible();
    await expect(page.getByTestId("estado-sync")).toContainText("Última sincronización");
    await expect(page.getByTestId("estado-sync")).toContainText("correcta");

    await page.getByRole("button", { name: "Mapear automáticamente" }).click();
    const resultado = page.getByTestId("resultado-automapa");
    await expect(resultado).toContainText("1 mapeadas · 1 sin coincidencia");
    await expect(resultado).toContainText("Barre: sin coincidencia");

    // Barre: elegir lección a mano, poner 3 lugares y guardar solo esa fila.
    const fila = page.getByTestId(`mapeo-${TIPO_BARRE}`);
    await fila.getByRole("combobox").click();
    await page.getByRole("option", { name: "Barre Fit" }).click();
    await fila.getByRole("spinbutton").fill("3");
    await fila.getByRole("button", { name: "Guardar Barre" }).click();
    await expect.poll(() => puts).toEqual([
      { ruta: `/api/partners/fitpass/class-types/${TIPO_BARRE}/lesson`, cuerpo: { fitpass_lesson_id: 11, fitpass_quota: 3 } },
    ]);
  });

  test("panel de la clase: cupo de Fitpass manda { fitpass: n }", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = SEMANA_PRUEBA.map((c) =>
      c.id === ID.barre
        ? { ...c, channels: [...c.channels, { channel: "fitpass", max: 2, booked: 0 }] }
        : c,
    );
    await mockSemanaCalendario(page, clases);
    const cupos: unknown[] = [];
    await page.route(/\/api\/classes\/[^/?]+\/channels$/, async (route) => {
      cupos.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByRole("region", { name: "Lugares para TotalPass" })).toBeVisible();
    const cupo = panel.getByRole("region", { name: "Lugares para Fitpass" });
    await expect(cupo.getByTestId("cupo-fitpass")).toHaveText("2");
    await cupo.getByRole("button", { name: "Un lugar más" }).click();
    await expect.poll(() => cupos).toEqual([{ fitpass: 3 }]);
  });

  test("recepción: registra una asistente de Fitpass en una clase del día", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = SEMANA_PRUEBA.map((c) =>
      c.id === ID.barre ? { ...c, channels: [...c.channels, { channel: "fitpass", max: 2, booked: 0 }] } : c,
    );
    await mockSemanaCalendario(page, clases);
    const altas: unknown[] = [];
    await page.route(/\/api\/partners\/fitpass\/attendees(\?.*)?$/, async (route) => {
      if (route.request().method() === "POST") {
        altas.push(route.request().postDataJSON());
        return route.fulfill({ json: { booking_id: "b1" } });
      }
      await route.fulfill({ json: [] });
    });

    await page.goto("/admin/bookings/fitpass");
    await page.getByLabel("Fecha").fill("2026-11-02");
    await expect(page.getByText("Fitpass 0/2")).toBeVisible();
    await page.getByRole("button", { name: /Registrar asistente en Barre/ }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Nombre de la socia").fill("María González");
    await dialogo.getByLabel(/Nº de socia/).fill("FP-123");
    await dialogo.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect.poll(() => altas).toEqual([{ classId: ID.barre, displayName: "María González", fitpassMemberRef: "FP-123" }]);
  });
});
