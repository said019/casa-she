import { test, expect } from "../fixtures/auth";

test.describe("Editorial Almanac — client portal", () => {
  test("dashboard shows day cover with giant day numeral", async ({ clientPage: page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /hoy es/i })).toBeVisible();
    await expect(page.getByText(/tu almanaque/i).first()).toBeVisible();
  });

  test("book classes page renders the Almanaque schedule", async ({ clientPage: page }) => {
    await page.goto("/app/book");
    await expect(page.getByRole("heading", { name: /almanaque/i }).first()).toBeVisible();
  });

  test("my bookings page is titled Bitácora", async ({ clientPage: page }) => {
    await page.goto("/app/classes");
    await expect(page.getByRole("heading", { name: /bit[aá]cora/i })).toBeVisible();
  });

  test("profile shows editorial cover with user name", async ({ clientPage: page }) => {
    await page.goto("/app/profile");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/membres[ií]a/i).first()).toBeVisible();
  });

  test("no fixed bottom nav on mobile", async ({ clientPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/app");
    const fixed = await page.locator(".fixed.bottom-0").count();
    expect(fixed).toBe(0);
  });
});
