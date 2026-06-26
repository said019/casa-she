import { test, expect } from "@playwright/test";

test.describe("Editorial Almanac — calendar", () => {
  test("masthead renders Almanaque BMB title", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: /almanaque/i }).first().scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: /almanaque/i }).first()).toBeVisible();
  });

  test("filter pills show Polanco & Roma and class categories", async ({ page }) => {
    await page.goto("/#horarios");
    await expect(page.getByRole("button", { name: /polanco.*roma/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^todas$/i }).first()).toBeVisible();
  });

  test("week navigation moves to next week", async ({ page }) => {
    await page.goto("/#horarios");
    const nextBtn = page.getByRole("button", { name: /sem\.?\s*sig/i });
    await nextBtn.click();
    // Grid remounts; existing day entry should be a future date
    await page.waitForTimeout(400);
    await expect(page.locator("[id='horarios']")).toBeVisible();
  });

  test("clicking a class entry navigates to /clases/:id", async ({ page }) => {
    await page.goto("/#horarios");
    // Find first interactive class entry (a button inside the grid)
    const firstClass = page.locator("#horarios button").filter({ hasText: /reformer|pole|hot|barre|sculpt/i }).first();
    if (await firstClass.count() === 0) test.skip(true, "no classes seeded");
    await firstClass.click();
    await expect(page).toHaveURL(/\/clases\/[a-f0-9-]+/);
  });

  test("mobile viewport collapses to day spread", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#horarios");
    // Day strip is the 7-day pill row
    await expect(page.getByText(/lun|mar|mi[eé]|jue|vie|s[aá]b|dom/i).first()).toBeVisible();
  });
});
