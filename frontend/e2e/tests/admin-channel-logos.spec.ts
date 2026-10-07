/**
 * Logos de canales: el nombre de TotalPass en etiquetas y títulos se ve como su logo oficial.
 */
import { test, expect } from "../fixtures/auth";

test.describe("Logos de canales", () => {
  test("la página de TotalPass usa el logo como título", async ({ adminPage: page }) => {
    await page.goto("/admin/settings/totalpass");
    await expect(page.getByRole("heading", { level: 1 }).getByRole("img", { name: "TotalPass" })).toBeVisible();
  });

  test("el menú lleva a TotalPass con el logo en su versión para fondo oscuro", async ({ adminPage: page }) => {
    await page.goto("/admin/settings/totalpass");
    const logo = page.locator('a[href="/admin/settings/totalpass"] img[alt="TotalPass"]').first();
    await expect(logo).toBeAttached();
    await expect(logo).toHaveAttribute("src", "/brands/totalpass-oscuro.svg");
  });
});
