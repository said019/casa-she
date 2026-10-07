/**
 * Admin Module – Clases y Calendario
 * Covers: GenerateClasses, WorkoutTemplates, admin class management
 */
import { test, expect } from "../fixtures/auth";
import type { Locator } from "@playwright/test";
import { AdminPage } from "../pages/AdminPage";
import { AHORA_PRUEBA, FECHA_PRUEBA, ID, SEMANA_PRUEBA, clasePrueba, mockLote, mockSemanaCalendario } from "../fixtures/calendario";

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

  test("editar manda solo lo que cambió", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    const puts: Array<{ ruta: string; cuerpo: unknown }> = [];
    await page.route(/\/api\/classes\/[^/?]+(\/channels)?$/, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      puts.push({ ruta: new URL(route.request().url()).pathname, cuerpo: route.request().postDataJSON() });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const editar = page.getByRole("dialog", { name: "Editar Clase" });
    const guardar = () => editar.getByRole("button", { name: "Guardar Cambios" }).click();

    // 1) Guardar sin tocar nada: no se manda nada y el panel sigue abierto.
    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    await page.getByRole("button", { name: "Editar clase" }).click();
    await guardar();
    await expect(page.getByText("Sin cambios", { exact: true })).toBeVisible();
    await expect(editar).toBeHidden();
    expect(puts).toEqual([]);

    // 2) Solo subir la capacidad: solo maxCapacity. Al guardar se cierra el panel.
    //    (Bajarla con cupo de TotalPass también reenvía ese cupo para que el servidor lo revalide; así era antes.)
    await page.getByRole("button", { name: "Editar clase" }).click();
    await editar.getByRole("spinbutton", { name: "Capacidad" }).fill("8");
    await guardar();
    await expect.poll(() => puts).toEqual([{ ruta: `/api/classes/${ID.barre}`, cuerpo: { maxCapacity: 8 } }]);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 3) Solo el cupo de TotalPass: la clase no se toca, solo /channels.
    puts.length = 0;
    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    await page.getByRole("button", { name: "Editar clase" }).click();
    await editar.getByRole("spinbutton", { name: "Lugares para TotalPass" }).fill("1");
    await guardar();
    await expect.poll(() => puts).toEqual([{ ruta: `/api/classes/${ID.barre}/channels`, cuerpo: { totalpass: 1 } }]);
  });

  test("editar compara contra la clase como estaba al abrir el diálogo", async ({ adminPage: page }) => {
    // Si la clase cambia en otro lado con el diálogo abierto (la lista se recarga al volver a la
    // ventana), guardar sin tocar nada no debe mandar los valores viejos y deshacer ese cambio.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.clock.install({ time: AHORA_PRUEBA });
    const clases = SEMANA_PRUEBA.map((c) => ({ ...c, channels: c.channels.map((k) => ({ ...k })) }));
    await mockSemanaCalendario(page, clases);
    const puts: Array<{ ruta: string; cuerpo: unknown }> = [];
    await page.route(/\/api\/classes\/[^/?]+(\/channels)?$/, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      puts.push({ ruta: new URL(route.request().url()).pathname, cuerpo: route.request().postDataJSON() });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    const lugares = page.getByTestId("lugares-panel");
    await expect(lugares).toContainText("3 de 7 · 4 libres");
    await page.getByRole("button", { name: "Editar clase" }).click();
    const editar = page.getByRole("dialog", { name: "Editar Clase" });
    await expect(editar.getByRole("spinbutton", { name: "Capacidad" })).toHaveValue("7");

    // Otra persona sube la capacidad a 9; la lista se recarga al volver a la ventana.
    const barre = clases.find((c) => c.id === ID.barre)!;
    barre.max_capacity = 9;
    await page.clock.fastForward(61_000);
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect(lugares).toContainText("3 de 9 · 6 libres");

    await editar.getByRole("button", { name: "Guardar Cambios" }).click();
    await expect(page.getByText("Sin cambios", { exact: true })).toBeVisible();
    expect(puts).toEqual([]);
  });
});

/** Copia de la semana de prueba que las acciones en bloque pueden cambiar. */
const semanaEditable = () => SEMANA_PRUEBA.map((c) => ({ ...c, channels: c.channels.map((k) => ({ ...k })) }));
/** Coaches fijas para la ventana "Cambiar coach" (ids iguales a los del fixture). */
const COACHES = [
  { id: "00000000-0000-4000-8000-00000000b001", display_name: "Ana", is_active: true },
  { id: "00000000-0000-4000-8000-00000000b002", display_name: "Sofía", is_active: true },
  { id: "00000000-0000-4000-8000-00000000b003", display_name: "Pau", is_active: true },
];

test.describe("Calendario de recepción – varias a la vez", () => {
  test("seleccionar: casillas, atajos de la última clase y día completo", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    const mat = page.getByRole("button", { name: /^Pilates Mat.*08:00/ });
    const sculpt = page.getByRole("button", { name: /^Sculpt.*18:00/ });
    const cancelada = page.getByRole("button", { name: /^Sculpt.*19:00/ });
    await expect(barre).toBeVisible();

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await barre.click();
    await expect(barre).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0); // en modo selección no abre el panel

    const atajos = page.getByRole("group", { name: "Atajos de selección" });
    await expect(atajos.getByRole("button")).toHaveText(["Mismo horario (7:00)", "Las de Ana", "Todas las Barre", "Todo el lunes", "Quitar selección"]);
    await atajos.getByRole("button", { name: "Todo el lunes" }).click();
    await expect(mat).toHaveAttribute("aria-pressed", "true");

    // Encabezado del miércoles: marca la activa y nunca la cancelada; otro clic la quita.
    const miercoles = page.getByTestId("encabezado-2026-11-04");
    await expect(miercoles).toHaveAttribute("aria-label", "Seleccionar todo el miércoles");
    await miercoles.click();
    await expect(sculpt).toHaveAttribute("aria-pressed", "true");
    expect(await cancelada.getAttribute("aria-pressed")).toBeNull();
    await miercoles.click();
    await expect(sculpt).toHaveAttribute("aria-pressed", "false");

    await atajos.getByRole("button", { name: "Quitar selección" }).click();
    await expect(barre).toHaveAttribute("aria-pressed", "false");
    await expect(mat).toHaveAttribute("aria-pressed", "false");

    // Cambiar de semana limpia la selección (nunca se aplica a clases que ya no se ven).
    await barre.click();
    await page.getByRole("button", { name: "Semana siguiente" }).click();
    await page.getByRole("button", { name: "Semana anterior" }).click();
    await expect(barre).toHaveAttribute("aria-pressed", "false");

    // Al terminar, la tarjeta vuelve a abrir el panel y el encabezado a crear clase.
    await page.getByRole("button", { name: "Terminar selección" }).first().click();
    await expect(atajos).toHaveCount(0);
    await barre.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("tarjeta de 50 min: nombre, coach, 7 puntos y cupo a 120 y 140 px de columna", async ({ adminPage: page }) => {
    await mockSemanaCalendario(page);
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    await page.getByRole("button", { name: "Seleccionar varias" }).click(); // con la casilla visible

    for (const [ancho, columnaMaxima] of [[1100, 125], [1366, 150]] as const) {
      await page.setViewportSize({ width: ancho, height: 900 });
      const columna = page.getByTestId("columna-2026-11-02");
      await expect.poll(async () => (await columna.boundingBox())?.width ?? 0).toBeLessThanOrEqual(columnaMaxima);
      for (const nombre of [/^Barre.*07:00/, /^Pilates Mat.*08:00/]) {
        const tarjeta = page.getByRole("button", { name: nombre });
        const caja = (await tarjeta.boundingBox())!;
        const coach = (await tarjeta.locator("[data-coach]").boundingBox())!;
        const nombreClase = (await tarjeta.locator("[data-nombre-clase]").boundingBox())!;
        const hora = (await tarjeta.locator("[data-hora]").boundingBox())!;
        const casilla = (await tarjeta.locator("[data-casilla]").boundingBox())!;
        const puntos = tarjeta.locator("[data-puntos]");
        const ultimo = (await puntos.locator("[data-lugar]").last().boundingBox())!;
        const cupo = (await tarjeta.locator("[data-cupo]").boundingBox())!;
        const dentro = (b: { y: number; height: number }) => b.y >= caja.y && b.y + b.height <= caja.y + caja.height + 0.5;
        await expect(puntos.locator("[data-lugar]")).toHaveCount(7);
        expect(nombreClase.height, `nombre visible a ${ancho}px`).toBeGreaterThanOrEqual(14);
        expect(coach.height, `coach visible a ${ancho}px`).toBeGreaterThanOrEqual(12);
        expect(dentro(coach) && dentro(cupo) && dentro(ultimo), `todo dentro de la tarjeta a ${ancho}px`).toBe(true);
        expect(ultimo.x + ultimo.width, `el 7.º punto no se recorta a ${ancho}px`).toBeLessThanOrEqual((await puntos.boundingBox())!.x + (await puntos.boundingBox())!.width + 0.5);
        expect(ultimo.x + ultimo.width).toBeLessThanOrEqual(cupo.x);
        expect(cupo.x + cupo.width).toBeLessThanOrEqual(caja.x + caja.width);
        expect(casilla.x >= hora.x + hora.width || casilla.y >= hora.y + hora.height, `la casilla no tapa la hora a ${ancho}px`).toBe(true);
      }
      await columna.screenshot({ path: test.info().outputPath(`tarjetas-${ancho}.png`) });
    }
  });

  test("atajo → cancelar → las tarjetas se quedan, canceladas", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    const cuerpos = await mockLote(page, clases);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    const mat = page.getByRole("button", { name: /^Pilates Mat.*08:00/ });

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    const barra = page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" });
    await expect(barra.getByRole("button", { name: "Cancelar clases" })).toBeDisabled();
    await barre.click();
    await page.getByRole("group", { name: "Atajos de selección" }).getByRole("button", { name: "Todo el lunes" }).click();
    await expect(barra.getByTestId("resumen-seleccion")).toContainText("2 clases");
    await expect(barra.getByTestId("resumen-seleccion")).toContainText("10 inscritas · 3 de TotalPass");

    await barra.getByRole("button", { name: "Cancelar clases" }).click();
    const dialogo = page.getByRole("dialog", { name: "Cancelar 2 clases" });
    await expect(dialogo).toContainText("Barre lun 7:00, Pilates Mat lun 8:00");
    await expect(dialogo).toContainText("7 alumnas recuperan su crédito y reciben aviso.");
    await expect(dialogo).toContainText("Se retiran de TotalPass para que nadie más reserve.");
    await dialogo.getByLabel("Motivo que verán las alumnas").fill("Puente");
    await dialogo.getByRole("button", { name: "Cancelar 2 clases" }).click();

    await expect(page.getByText("2 clases canceladas. Siguen en el calendario, marcadas.").first()).toBeVisible();
    await expect(barre).toContainText("Cancelada");
    await expect(mat).toContainText("Cancelada");
    await expect(barra.getByTestId("resumen-seleccion")).toContainText("Ninguna clase");
    expect(cuerpos.map((c) => [c.accion, c.vistaPrevia])).toEqual([["cancelar", true], ["cancelar", false]]);
    expect(cuerpos[1]).toMatchObject({ classIds: [ID.barre, ID.mat], motivo: "Puente" });
  });

  test("bloqueadas: se ven con su motivo y se quitan de la selección", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    await page.route(/\/api\/instructors(\?|$)/, (route) => route.fulfill({ json: COACHES }));
    const cuerpos = await mockLote(page, clases, { bloqueos: { [ID.mat]: "Ya empezó." } });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    const mat = page.getByRole("button", { name: /^Pilates Mat.*08:00/ });

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await barre.click();
    await mat.click();
    await page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" }).getByRole("button", { name: "Cambiar coach" }).click();
    const dialogo = page.getByRole("dialog", { name: "Cambiar coach" });
    await dialogo.getByRole("radio", { name: /Pau/ }).click();
    await expect(dialogo.getByRole("list", { name: "Clases bloqueadas" })).toContainText("Pilates Mat 02/11 8:00: Ya empezó.");
    await expect(dialogo.getByRole("button", { name: "Cambiar a Pau en 2 clases" })).toBeDisabled();

    await dialogo.getByRole("button", { name: "Quitar la bloqueada de la selección" }).click();
    // La ventana es modal (el calendario queda oculto a lectores): se ve en su lista de clases.
    await expect(dialogo.getByText("Barre · lun 7:00", { exact: true })).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Cambiar a Pau en 1 clase" })).toBeEnabled();
    await expect(dialogo).toContainText("Avisamos del cambio a 2 alumnas por la app.");
    await dialogo.getByRole("button", { name: "Cambiar a Pau en 1 clase" }).click();
    await expect(page.getByText("Listo: 1 clase ahora con Pau. Avisamos a 2 alumnas.").first()).toBeVisible();
    await expect(barre).toContainText("Pau");
    expect(cuerpos.at(-1)).toMatchObject({ accion: "coach", vistaPrevia: false, classIds: [ID.barre], instructorId: COACHES[2].id });
  });

  test("mover: avisa cuántas socias de TotalPass pierden su lugar", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    const cuerpos = await mockLote(page, clases);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    await page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" }).getByRole("button", { name: "Mover o cambiar clase" }).click();
    const dialogo = page.getByRole("dialog", { name: "Mover o cambiar clase" });
    await expect(dialogo.getByRole("button", { name: "Elige un cambio" })).toBeDisabled();
    await dialogo.getByRole("radio", { name: "+30 min" }).click();
    await expect(dialogo.getByRole("alert")).toContainText("1 socia pierde su lugar");
    // Doble clic: se aplica UNA vez (dos serían +1 h).
    await dialogo.getByRole("button", { name: "Mover 1 clase 30 min más tarde" }).dblclick();
    await expect(page.getByText("Listo: 1 clase actualizada. Avisamos a 2 alumnas.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Barre.*07:30/ })).toBeVisible();
    expect(cuerpos.filter((c) => !c.vistaPrevia)).toEqual([{ classIds: [ID.barre], accion: "mover", minutos: 30, vistaPrevia: false }]);
  });

  test("si algo cambia entre la vista previa y aplicar, no se aplica nada y se ve por qué", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    const cuerpos = await mockLote(page, clases, { bloqueosAlAplicar: { [ID.mat]: "Ya empezó." } });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    await page.getByRole("button", { name: /^Pilates Mat.*08:00/ }).click();
    await page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" }).getByRole("button", { name: "Cancelar clases" }).click();
    const dialogo = page.getByRole("dialog", { name: "Cancelar 2 clases" });
    await dialogo.getByRole("button", { name: "Cancelar 2 clases" }).click();

    await expect(page.getByText("Algunas clases cambiaron mientras tanto. Revisa las bloqueadas.").first()).toBeVisible();
    await expect(dialogo.getByRole("list", { name: "Clases bloqueadas" })).toContainText("Ya empezó.");
    await expect(dialogo.getByRole("button", { name: "Cancelar 2 clases" })).toBeDisabled();
    expect(clases.filter((c) => c.status === "cancelled").map((c) => c.id)).toEqual([ID.sculptCancelada]);
    expect(cuerpos.filter((c) => !c.vistaPrevia)).toHaveLength(1);
  });

  test("deshacer: coach y mover sí, cancelar no; y si ya no se puede, dice por qué", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    await page.route(/\/api\/instructors(\?|$)/, (route) => route.fulfill({ json: COACHES }));
    const bloqueos: Record<string, string> = {};
    const cuerpos = await mockLote(page, clases, { bloqueos });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const barra = page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" });
    const barre = page.getByRole("button", { name: /^Barre/ });
    const deshacer = page.getByRole("button", { name: "Deshacer" });

    // Coach: todas tenían a Ana → "Deshacer" la regresa con una sola llamada.
    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await barre.click();
    await barra.getByRole("button", { name: "Cambiar coach" }).click();
    const coach = page.getByRole("dialog", { name: "Cambiar coach" });
    await expect(coach.getByRole("radio", { name: /Ana/ })).toBeDisabled(); // ya la da Ana
    await coach.getByRole("radio", { name: /Sofía/ }).click();
    await coach.getByRole("button", { name: "Cambiar a Sofía en 1 clase" }).click();
    await expect(barre).toContainText("Sofía");
    await deshacer.click();
    await expect(page.getByText("Cambio deshecho.").first()).toBeVisible();
    await expect(barre).toContainText("Ana");
    expect(cuerpos.at(-1)).toEqual({ classIds: [ID.barre], accion: "coach", instructorId: COACHES[0].id, vistaPrevia: false });

    // Mover: −minutos.
    const mover = page.getByRole("dialog", { name: "Mover o cambiar clase" });
    await barre.click();
    await barra.getByRole("button", { name: "Mover o cambiar clase" }).click();
    await mover.getByRole("radio", { name: "−1 h" }).click();
    await mover.getByRole("button", { name: "Mover 1 clase 1 h antes" }).click();
    await expect(page.getByRole("button", { name: /^Barre.*06:00/ })).toBeVisible();
    await deshacer.click();
    await expect(page.getByRole("button", { name: /^Barre.*07:00/ })).toBeVisible();
    expect(cuerpos.at(-1)).toEqual({ classIds: [ID.barre], accion: "mover", minutos: 60, vistaPrevia: false });

    // Si entre aplicar y deshacer la clase ya empezó: no se deshace y se dice por qué.
    await barre.click();
    await barra.getByRole("button", { name: "Mover o cambiar clase" }).click();
    await mover.getByRole("radio", { name: "+30 min" }).click();
    await mover.getByRole("button", { name: "Mover 1 clase 30 min más tarde" }).click();
    await expect(page.getByRole("button", { name: /^Barre.*07:30/ })).toBeVisible();
    bloqueos[ID.barre] = "Ya empezó.";
    await deshacer.click();
    await expect(page.getByText("No se pudo deshacer").first()).toBeVisible();
    await expect(page.getByText("Ya empezó.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Barre.*07:30/ })).toBeVisible();
    delete bloqueos[ID.barre];

    // Cancelar no se deshace.
    await barre.click();
    await barra.getByRole("button", { name: "Cancelar clases" }).click();
    await page.getByRole("dialog", { name: "Cancelar 1 clase" }).getByRole("button", { name: "Cancelar 1 clase" }).click();
    await expect(page.getByText("1 clase cancelada. Siguen en el calendario, marcadas.").first()).toBeVisible();
    await expect(deshacer).toHaveCount(0);
  });

});
