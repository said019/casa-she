import { test, expect } from "@playwright/test";

test.describe("Editorial Almanac — landing", () => {
  test("masthead headline visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /se toma.*el cuerpo.*en serio/i })).toBeVisible();
  });

  test("nine chapters present in expected order", async ({ page }) => {
    await page.goto("/");
    // Check each section landmark exists
    await expect(page.locator("#horarios")).toBeVisible();
    await expect(page.locator("#modalidades")).toBeVisible();
    await expect(page.locator("#equipo")).toBeVisible();
    await expect(page.locator("#planes")).toBeVisible();
  });

  test("roster shows group photo and at least 6 portraits", async ({ page }) => {
    await page.goto("/#equipo");
    await expect(page.getByAltText("El equipo BMB Studio")).toBeVisible();
    const portraits = page.locator("#equipo img:not([alt='El equipo BMB Studio'])");
    expect(await portraits.count()).toBeGreaterThanOrEqual(6);
  });

  test("pricing shows three plans with prices", async ({ page }) => {
    await page.goto("/#planes");
    await expect(page.getByText(/\$1,890|\$2,190|\$2,490/).first()).toBeVisible();
  });
});
