/**
 * POST /api/classes/bulk de punta a punta contra el backend del arnés (copia desechable
 * de la base local): crea una clase de verdad, pide la vista previa, cancela, y
 * comprueba que un segundo intento responde 409 y que la clase sigue ahí, cancelada.
 * Solo con scripts/e2e-local.sh (nunca contra producción).
 */
import { test, expect } from "../fixtures/auth";

const API = "http://localhost:3001/api";

test("POST /api/classes/bulk: vista previa, cancelar, 409 y la clase sigue cancelada", async ({ adminPage: page, request }) => {
  const token = await page.evaluate(() => localStorage.getItem("casashe_token"));
  expect(token, "sesión de la admin de prueba").toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };
  const lote = (data: Record<string, unknown>) => request.post(`${API}/classes/bulk`, { headers, data });

  const tipos = (await (await request.get(`${API}/class-types`, { headers })).json()) as Array<{ id: string; category: string }>;
  const coaches = (await (await request.get(`${API}/instructors`, { headers })).json()) as Array<{ id: string; is_active?: boolean }>;
  const sucursales = (await (await request.get(`${API}/facilities`, { headers })).json()) as Array<{ id: string }>;
  const tipo = tipos.find((t) => t.category === "multi");
  const coach = coaches.find((c) => c.is_active !== false);
  expect(tipo && coach && sucursales[0], "la base local tiene tipos, coaches y sucursal").toBeTruthy();

  // Dentro de 45–74 días a las 05:15 (hora rara: no choca con el horario cargado).
  const fecha = new Date(Date.now() + (45 + Math.floor(Math.random() * 30)) * 86_400_000).toISOString().slice(0, 10);
  const creada = await request.post(`${API}/classes`, {
    headers,
    data: { classTypeId: tipo!.id, instructorId: coach!.id, facilityId: sucursales[0].id, date: fecha, startTime: "05:15", endTime: "06:05", maxCapacity: 7 },
  });
  expect(creada.status(), await creada.text()).toBe(201);
  const id = (await creada.json()).id as string;

  expect((await lote({ classIds: [id], accion: "mover", minutos: 10, vistaPrevia: true })).status(), "minutos múltiplo de 15").toBe(400);

  const previa = await lote({ classIds: [id], accion: "cancelar", vistaPrevia: true });
  expect(previa.status()).toBe(200);
  expect(await previa.json()).toMatchObject({ aplicado: false, resumen: { ok: 1, bloqueadas: 0 } });
  expect((await (await request.get(`${API}/classes/${id}`)).json()).status, "la vista previa no escribe").toBe("scheduled");

  const aplicada = await lote({ classIds: [id], accion: "cancelar", motivo: "Prueba e2e", vistaPrevia: false });
  expect(aplicada.status()).toBe(200);
  expect(await aplicada.json()).toMatchObject({ aplicado: true, resumen: { ok: 1 } });

  const otraVez = await lote({ classIds: [id], accion: "cancelar", vistaPrevia: false });
  expect(otraVez.status(), "aplicar con una bloqueada → 409").toBe(409);
  expect((await otraVez.json()).clases[0]).toMatchObject({ classId: id, estado: "bloqueada", motivo: "Ya está cancelada." });

  const despues = await request.get(`${API}/classes/${id}`);
  expect(despues.status(), "cancelada, nunca borrada").toBe(200);
  expect((await despues.json()).status).toBe("cancelled");

  expect((await request.post(`${API}/classes/bulk-delete`, { headers, data: { startDate: fecha, endDate: fecha } })).status(), "bulk-delete ya no existe").toBe(404);
});
