import { Page, Locator, expect } from "@playwright/test";

/** Page Object for /admin/* pages */
export class AdminPage {
  readonly sidebar: Locator;
  readonly pageHeading: Locator;
  readonly saveBtn: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;
  readonly tableRows: Locator;

  constructor(private readonly page: Page) {
    this.sidebar = page.locator('[data-testid="admin-sidebar"], nav[aria-label="Admin"]');
    this.pageHeading = page.getByRole("heading").first();
    this.saveBtn = page.getByRole("button", { name: /guardar|save|crear|create/i });
    this.successToast = page.getByRole("status").or(page.locator('[data-testid="toast-success"]'));
    this.errorToast = page.locator('[data-testid="toast-error"]').or(page.getByRole("alert"));
    this.tableRows = page.locator("table tbody tr");
  }

  async gotoDashboard() { await this.page.goto("/admin"); }
  async gotoClasses() { await this.page.goto("/admin/classes"); }
  async gotoGenerateClasses() { await this.page.goto("/admin/classes/generate"); }
  async gotoMemberships() { await this.page.goto("/admin/memberships"); }
  async gotoMembershipsExpiring() { await this.page.goto("/admin/memberships/expiring"); }
  async gotoPendingMemberships() { await this.page.goto("/admin/memberships/pending"); }
  async gotoAssignMembership() { await this.page.goto("/admin/memberships/assign"); }
  async gotoPOS() { await this.page.goto("/admin/pos"); }
  async gotoDiscountCodes() { await this.page.goto("/admin/discount-codes"); }
  async gotoPaymentsReports() { await this.page.goto("/admin/payments/reports"); }
  async gotoOrdersVerification() { await this.page.goto("/admin/orders"); }
  async gotoLoyaltyConfig() { await this.page.goto("/admin/loyalty/config"); }
  async gotoLoyaltyAdjust() { await this.page.goto("/admin/loyalty/adjust"); }
  async gotoWhatsAppSettings() { await this.page.goto("/admin/settings/whatsapp"); }
  async gotoNotificationSettings() { await this.page.goto("/admin/settings/notifications"); }
  async gotoWorkoutTemplates() { await this.page.goto("/admin/workouts/templates"); }
  async gotoReportsRevenue() { await this.page.goto("/admin/reports/revenue"); }
  async gotoImportClients() { await this.page.goto("/admin/clients/import"); }
  async gotoMigrateClient() { await this.page.goto("/admin/migrations"); }

  async assertPageLoaded(headingText?: RegExp | string) {
    await this.page.waitForLoadState("networkidle");
    if (headingText) {
      await expect(this.pageHeading).toContainText(headingText);
    } else {
      await expect(this.pageHeading).toBeVisible();
    }
  }

  async assertSaved() {
    await expect(this.successToast.or(this.page.getByText(/guardado|saved|creado|created|éxito/i))).toBeVisible({ timeout: 10_000 });
  }

  async assertTableHasRows(minRows = 1) {
    await expect(this.tableRows.nth(minRows - 1)).toBeVisible();
  }

  async fillField(label: RegExp | string, value: string) {
    await this.page.getByLabel(label).fill(value);
  }

  async selectOption(label: RegExp | string, value: string) {
    await this.page.getByLabel(label).selectOption(value);
  }

  async clickSave() {
    await this.saveBtn.click();
  }
}
