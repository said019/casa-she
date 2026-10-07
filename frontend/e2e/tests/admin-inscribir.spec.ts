/**
 * Calendario de recepción – Inscribir alumna (Entrega 4).
 * Las lecturas y escrituras de reservas/membresías se interceptan: la regla de inscripción
 * se prueba en el backend (scripts/test-inscripcion.ts); aquí se prueba el flujo del panel.
 */
import { test, expect } from "../fixtures/auth";
import type { Page } from "@playwright/test";
import { FECHA_PRUEBA, ID, mockSemanaCalendario } from "../fixtures/calendario";

const U = (n: string) => `00000000-0000-4000-8000-0000000d${n}`;
const ANA = U("0001"), BEA = U("0002"), CARLA = U("0003");
const RESULTADOS = [
  { userId: ANA, nombre: "Ana Pérez", telefono: "5511111111", email: "ana@test.local", estado: "puede",
    membresia: { id: "m1", plan: "Paquete 8 Clases", restantes: 3, vence: "2026-12-30" } },
  { userId: BEA, nombre: "Beatriz Luna", telefono: "5522222222", email: "bea@test.local", estado: "puede",
    membresia: { id: "m2", plan: "Ilimitado", restantes: null, vence: "2026-12-30" } },
  { userId: CARLA, nombre: "Carla Sol", telefono: "5533333333", email: "carla@test.local", estado: "sin_creditos", mensaje: "Sin créditos de Clases" },
];
const PLANES = [
  { id: "p-clases", name: "Paquete 8 Clases", price: 1200, duration_days: 30, reformer_credits: 0, multi_credits: 8, is_internal: false },
  { id: "p-salsa", name: "Paquete Salsa 4", price: 600, duration_days: 30, reformer_credits: 4, multi_credits: 0, is_internal: false },
  { id: "p-tp", name: "Totalpass", price: 0, duration_days: 30, reformer_credits: null, multi_credits: null, is_internal: true },
];

interface Llamada { metodo: string; url: string; cuerpo: any }

async function prepararPanel(page: Page) {
  const llamadas: Llamada[] = [];
  const inscritas: any[] = [];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockSemanaCalendario(page);
  // Inscritas: responde lo que se haya "inscrito" (registrada después → tiene prioridad).
  await page.route(/\/api\/bookings\/class\//, (route) => route.fulfill({ json: inscritas }));
  await page.route(/\/api\/classes\/[^/]+\/candidatas/, (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    llamadas.push({ metodo: "GET", url: route.request().url(), cuerpo: q });
    return route.fulfill({ json: RESULTADOS });
  });
  await page.route(/\/api\/plans(\?|$)/, (route) => route.fulfill({ json: PLANES }));
  await page.route(/\/api\/memberships\/assign/, async (route) => {
    llamadas.push({ metodo: "POST", url: "assign", cuerpo: route.request().postDataJSON() });
    await route.fulfill({ status: 201, json: { id: "m-nueva" } });
  });
  await page.route(/\/api\/bookings\/admin-book/, async (route) => {
    const cuerpo = route.request().postDataJSON();
    llamadas.push({ metodo: "POST", url: "admin-book", cuerpo });
    const nombre = cuerpo.userId === ANA ? "Ana Pérez" : cuerpo.userId === BEA ? "Beatriz Luna" : "Carla Sol";
    inscritas.push({
      booking_id: "b-1", status: "confirmed", checked_in_at: null, waitlist_position: null, user_id: cuerpo.userId,
      display_name: nombre, email: "x@test.local", photo_url: null, phone: "5500000000", plan_name: "Paquete 8 Clases",
    });
    await route.fulfill({ status: 201, json: { id: "b-1", class_id: cuerpo.classId, user_id: cuerpo.userId } });
  });
  await page.route(/\/api\/bookings\/b-1\/cancel$/, async (route) => {
    llamadas.push({ metodo: "POST", url: "cancel", cuerpo: route.request().postDataJSON() });
    inscritas.length = 0;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
  await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
  return { llamadas, panel: page.getByRole("dialog") };
}

test.describe("Calendario de recepción – inscribir alumna", () => {
  test("busca con espera, muestra créditos y motivo, inscribe con Enter, resalta y deshace", async ({ adminPage: page }) => {
    const { llamadas, panel } = await prepararPanel(page);
    const buscador = panel.getByRole("combobox", { name: /Buscar alumna/ });
    await buscador.fill("a");
    await page.waitForTimeout(500);
    expect(llamadas.filter((l) => l.metodo === "GET")).toHaveLength(0); // menos de 2 caracteres: no consulta

    await buscador.fill("an");
    await buscador.fill("ana");
    await expect(panel.getByTestId(`candidata-${ANA}`)).toContainText("Paquete 8 Clases · le quedan 3");
    await expect(panel.getByTestId(`candidata-${BEA}`)).toContainText("Ilimitado · vence 30 dic");
    await expect(panel.getByTestId(`candidata-${CARLA}`).locator('[data-estado="sin_creditos"]')).toHaveText("Sin créditos de Clases");
    await expect(panel.getByTestId(`candidata-${CARLA}`).getByRole("button", { name: "Inscribir", exact: true })).toHaveCount(0);
    await expect(panel.getByTestId(`candidata-${CARLA}`).getByRole("button", { name: "Vender paquete" })).toBeVisible();
    // La espera de 250 ms junta "an" y "ana" en una sola consulta.
    expect(llamadas.filter((l) => l.metodo === "GET").map((l) => l.cuerpo)).toEqual(["ana"]);

    // Flecha abajo → Beatriz resaltada; Enter la inscribe (no a Ana).
    await buscador.press("ArrowDown");
    await expect(panel.getByTestId(`candidata-${BEA}`)).toHaveAttribute("aria-selected", "true");
    await buscador.press("Enter");
    await expect.poll(() => llamadas.find((l) => l.url === "admin-book")?.cuerpo).toEqual({ classId: ID.barre, userId: BEA, free: false });

    // Aparece resaltada en Inscritas y el aviso trae "Deshacer".
    await expect(panel.locator('[data-resaltada="true"]')).toContainText("Beatriz Luna");
    const aviso = page.getByRole("status").filter({ hasText: "Beatriz Luna quedó inscrita" }).or(page.getByText("Beatriz Luna quedó inscrita"));
    await expect(aviso.first()).toBeVisible();
    // El aviso vive fuera del panel modal (Radix lo marca aria-hidden): se busca por texto.
    await page.getByText("Deshacer", { exact: true }).click();
    await expect.poll(() => llamadas.find((l) => l.url === "cancel")?.cuerpo).toEqual({ refundCredit: true });
    await expect(panel.locator('[data-resaltada="true"]')).toHaveCount(0);
  });

  test("el botón Inscribir y la cortesía mandan free correcto; sin onRegistrarNueva no hay botón de alta", async ({ adminPage: page }) => {
    const { llamadas, panel } = await prepararPanel(page);
    await panel.getByRole("combobox", { name: /Buscar alumna/ }).fill("carla");
    await expect(panel.getByTestId(`candidata-${CARLA}`)).toBeVisible();
    await expect(panel.getByRole("button", { name: /Registrar alumna nueva/ })).toHaveCount(0);
    await panel.getByLabel(/Cortesía: inscribir sin descontar crédito/).check();
    await panel.getByTestId(`candidata-${CARLA}`).getByRole("button", { name: "Inscribir (cortesía)" }).click();
    await expect.poll(() => llamadas.find((l) => l.url === "admin-book")?.cuerpo).toEqual({ classId: ID.barre, userId: CARLA, free: true });
  });

  test("vende un paquete de la bolsa de la clase y luego la inscribe", async ({ adminPage: page }) => {
    const { llamadas, panel } = await prepararPanel(page);
    await panel.getByRole("combobox", { name: /Buscar alumna/ }).fill("carla");
    const fila = panel.getByTestId(`candidata-${CARLA}`);
    await fila.getByRole("button", { name: "Vender paquete" }).click();

    const venta = fila.getByTestId("venta-inline");
    await expect(venta).toContainText("Paquetes de Clases");
    // Solo paquetes de la bolsa Clases: ni el de Salsa ni el interno de TotalPass.
    const opciones = await venta.getByLabel("Paquete").locator("option").allTextContents();
    expect(opciones.join("|")).toContain("Paquete 8 Clases");
    expect(opciones.join("|")).not.toContain("Salsa");
    expect(opciones.join("|")).not.toContain("Totalpass");

    await expect(venta.getByRole("button", { name: "Cobrar e inscribir" })).toBeDisabled();
    await venta.getByLabel("Paquete").selectOption("p-clases");
    await venta.getByLabel("Forma de pago").selectOption("transfer");
    await venta.getByRole("button", { name: "Cobrar e inscribir" }).click();

    await expect.poll(() => llamadas.filter((l) => l.metodo === "POST").map((l) => l.url)).toEqual(["assign", "admin-book"]);
    const assign = llamadas.find((l) => l.url === "assign")!.cuerpo;
    expect(assign).toMatchObject({ userId: CARLA, planId: "p-clases", status: "active", paymentMethod: "transfer" });
    expect(assign.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(llamadas.find((l) => l.url === "admin-book")!.cuerpo).toEqual({ classId: ID.barre, userId: CARLA, free: false });
    await expect(panel.locator('[data-resaltada="true"]')).toContainText("Carla Sol");
  });

  test("si la venta pasa y la inscripción falla, se explica el motivo y la venta se queda", async ({ adminPage: page }) => {
    const { llamadas, panel } = await prepararPanel(page);
    await page.route(/\/api\/bookings\/admin-book/, async (route) => {
      llamadas.push({ metodo: "POST", url: "admin-book", cuerpo: route.request().postDataJSON() });
      await route.fulfill({ status: 400, json: { error: "Clase llena" } });
    });
    await panel.getByRole("combobox", { name: /Buscar alumna/ }).fill("carla");
    const fila = panel.getByTestId(`candidata-${CARLA}`);
    await fila.getByRole("button", { name: "Vender paquete" }).click();
    await fila.getByLabel("Paquete").selectOption("p-clases");
    await fila.getByRole("button", { name: "Cobrar e inscribir" }).click();
    await expect(page.getByText(/Se vendió el paquete a Carla Sol, pero no se inscribió/).first()).toBeVisible();
    await expect(page.getByText("Clase llena").first()).toBeVisible();
    expect(llamadas.filter((l) => l.url === "assign")).toHaveLength(1);
  });
});
