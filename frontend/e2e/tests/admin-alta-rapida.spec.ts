/**
 * Calendario de recepción – Alumna nueva con acceso por WhatsApp (Entrega 5).
 * Flujo COMPLETO contra el backend local desechable (e2e-local.sh), sin mocks:
 * alta rápida desde el panel de clase → link de acceso → abrir /acceso/:token en otro
 * navegador → crear contraseña → entra a su inicio. El link no se puede reusar.
 */
import { test, expect } from "../fixtures/auth";
import { Browser } from "@playwright/test";

const API = process.env.VITE_API_URL ?? "http://localhost:3001/api";
const dia = (sumar: number) => {
  const d = new Date(Date.now() + sumar * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
};

test.describe("Calendario de recepción – alumna nueva", () => {
  test("alta rápida desde el panel → link → crea contraseña → entra", async ({ adminPage: page, browser }: { adminPage: import("@playwright/test").Page; browser: Browser }) => {
    test.setTimeout(120_000);
    const sufijo = Date.now();
    const token = await page.evaluate(() => localStorage.getItem("casashe_token"));
    const auth = { Authorization: `Bearer ${token}` };

    // Una clase de la bolsa "Clases" (multi) hoy, a una hora que no choque con la agenda real.
    const tipos = (await (await page.request.get(`${API}/class-types`, { headers: auth })).json()) as any[];
    const tipo = tipos.find((t) => t.category === "multi" && t.is_active !== false);
    expect(tipo, "la base necesita un tipo de clase multi").toBeTruthy();
    const instructores = (await (await page.request.get(`${API}/instructors`, { headers: auth })).json()) as any[];
    // El calendario fija el filtro a la sede "Casa Shé…": la clase de prueba va ahí.
    const sedes = (await (await page.request.get(`${API}/facilities`, { headers: auth })).json()) as any[];
    const sede = sedes.find((f) => /^casa sh/i.test(f.name));
    expect(sede, "la base necesita la sede Casa Shé").toBeTruthy();
    const fecha = dia(0); // hoy: siempre dentro de la semana que abre el calendario
    const creada = await page.request.post(`${API}/classes`, {
      headers: auth,
      data: { classTypeId: tipo.id, instructorId: instructores[0].id, facilityId: sede.id, date: fecha, startTime: "14:45", endTime: "15:45", maxCapacity: 6 },
    });
    expect(creada.status(), await creada.text()).toBe(201);

    const nombre = `Zoe Prueba${sufijo}`;
    const correo = `zoe${sufijo}@alta-e2e.test`;

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/admin/calendar?date=${fecha}`);
    await page.getByRole("button", { name: new RegExp(`^${tipo.name}.*14:45`) }).click();
    const panel = page.getByRole("dialog");
    await panel.getByRole("combobox", { name: /Buscar alumna/ }).fill(nombre);
    await panel.getByRole("button", { name: /Registrar alumna nueva/ }).click();

    const alta = page.getByTestId("dialogo-alumna-nueva");
    await expect(alta.getByLabel("Nombre completo", { exact: true })).toHaveValue(nombre); // precargado con lo buscado
    // Sin correo no se puede registrar.
    await alta.getByLabel("WhatsApp", { exact: true }).fill("55 1234 9876");
    await alta.getByRole("radio", { name: /Cortesía/ }).click();
    await expect(alta.getByRole("button", { name: "Registrar, cobrar e inscribir" })).toBeDisabled();
    await alta.getByLabel("Correo", { exact: true }).fill(correo);
    await expect(alta.getByRole("button", { name: "Registrar, cobrar e inscribir" })).toBeEnabled();
    await expect(alta.getByRole("checkbox", { name: /acceso por WhatsApp/ })).toBeChecked();
    await alta.getByRole("button", { name: "Registrar, cobrar e inscribir" }).click();

    // Pantalla de listo: resumen, vista del mensaje, WhatsApp y copiar link.
    const listo = page.getByTestId("alumna-registrada");
    await expect(listo.getByRole("heading", { name: /Zoe quedó inscrita/ })).toBeVisible();
    const mensaje = (await listo.getByTestId("vista-mensaje").innerText()).replace(/\s+/g, " ");
    expect(mensaje).toMatch(/^Hola Zoe, te escribimos de Casa Shé\. Ya tienes tu lugar en .* a las 14:45\. Crea tu contraseña aquí/);
    expect(mensaje).toContain("El link vence en 7 días.");
    const wa = await listo.getByRole("link", { name: "Abrir WhatsApp" }).getAttribute("href");
    expect(wa).toMatch(/^https:\/\/wa\.me\/525512349876\?text=/);
    await expect(listo.getByRole("button", { name: "Copiar link" })).toBeVisible();
    const url = mensaje.match(/https?:\/\/\S+\/acceso\/[A-Za-z0-9_-]+/)?.[0];
    expect(url, "el mensaje trae el link de acceso").toBeTruthy();

    // Duplicado: la misma alumna otra vez ofrece su ficha en vez de crear otra.
    await listo.getByRole("button", { name: "Volver a la clase" }).click();
    await expect(panel.getByLabel("Reservado").getByText(nombre)).toBeVisible(); // quedó en la lista de inscritas

    // La alumna abre el link en SU navegador (sin sesión de recepción).
    const ctx = await browser.newContext({ baseURL: "http://localhost:4173", locale: "es-MX" });
    const suya = await ctx.newPage();
    await suya.goto(new URL(url!).pathname);
    await expect(suya.getByRole("heading", { name: /Hola Zoe, crea tu contraseña/ })).toBeVisible();
    await suya.getByLabel("Contraseña", { exact: true }).fill("Zoe-Clave-2035");
    await suya.getByLabel("Confirma tu contraseña").fill("Otra-Clave-2035");
    await suya.getByRole("button", { name: "Crear contraseña y entrar" }).click();
    await expect(suya.getByText("Las contraseñas no coinciden")).toBeVisible();
    await suya.getByLabel("Confirma tu contraseña").fill("Zoe-Clave-2035");
    await suya.getByRole("button", { name: "Crear contraseña y entrar" }).click();
    await suya.waitForURL(/\/app/, { timeout: 15_000 });

    // El link ya se usó: no sirve otra vez.
    const otra = await ctx.newPage();
    await otra.goto(new URL(url!).pathname);
    await expect(otra.getByText("Este link ya no sirve. Pide uno nuevo en recepción.")).toBeVisible();
    await ctx.close();

    // Recepción vuelve a registrar los mismos datos: 409 y oferta de su ficha.
    await panel.getByRole("combobox", { name: /Buscar alumna/ }).fill(nombre);
    await panel.getByRole("button", { name: /Registrar alumna nueva/ }).click();
    await alta.getByLabel("WhatsApp", { exact: true }).fill("5599887711");
    await alta.getByLabel("Correo", { exact: true }).fill(correo.toUpperCase());
    await alta.getByRole("radio", { name: /Cortesía/ }).click();
    await alta.getByRole("button", { name: "Registrar, cobrar e inscribir" }).click();
    await expect(alta.getByRole("alert")).toContainText("ya está registrada con ese correo");
    await expect(alta.getByRole("button", { name: "Abrir su ficha" })).toBeVisible();
  });
});
