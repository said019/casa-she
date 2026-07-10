/**
 * Task 8 — Web QR del cliente en /app/wallet
 * Verifica que el cliente autenticado ve su QR de recepción (canvas).
 */
import { test, expect } from "../fixtures/auth";

test.describe("Wallet — QR de recepción del cliente", () => {
  test("cliente ve su QR en /app/wallet", async ({ clientPage: page }) => {
    await page.goto("/app/wallet");
    await expect(
      page.getByRole("heading", { name: /mi qr|c[oó]digo qr/i })
    ).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
  });
});