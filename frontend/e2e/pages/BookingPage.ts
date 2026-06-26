import { Page, Locator, expect } from "@playwright/test";

/** Page Object for client booking flow: /client/book-classes */
export class BookingPage {
  readonly classList: Locator;
  readonly waitlistBtn: Locator;
  readonly bookBtn: Locator;
  readonly confirmDialog: Locator;
  readonly confirmBtn: Locator;
  readonly successToast: Locator;
  readonly cancelBtn: Locator;

  constructor(private readonly page: Page) {
    this.classList = page.locator('[data-testid="class-list"], [data-testid="schedule-grid"]');
    this.waitlistBtn = page.getByRole("button", { name: /lista de espera|waitlist/i });
    this.bookBtn = page.getByRole("button", { name: /reservar|book|inscribirse/i }).first();
    this.confirmDialog = page.getByRole("dialog");
    this.confirmBtn = this.confirmDialog.getByRole("button", { name: /confirmar|confirm|reservar/i });
    this.successToast = page.getByRole("status").or(page.locator('[data-testid="toast-success"]'));
    this.cancelBtn = page.getByRole("button", { name: /cancelar|cancel/i });
  }

  async goto() {
    await this.page.goto("/client/book-classes");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoMyBookings() {
    await this.page.goto("/client/my-bookings");
    await this.page.waitForLoadState("networkidle");
  }

  async bookFirstAvailableClass() {
    await this.bookBtn.click();
    if (await this.confirmDialog.isVisible()) {
      await this.confirmBtn.click();
    }
  }

  async joinWaitlist() {
    await this.waitlistBtn.click();
    if (await this.confirmDialog.isVisible()) {
      await this.confirmBtn.click();
    }
  }

  async cancelBooking(nth = 0) {
    const cancelButtons = this.page.getByRole("button", { name: /cancelar reserva|cancel booking/i });
    await cancelButtons.nth(nth).click();
    if (await this.confirmDialog.isVisible()) {
      await this.confirmBtn.click();
    }
  }

  async assertBookingConfirmed() {
    await expect(this.successToast.or(this.page.getByText(/confirmad|booked|reservad/i))).toBeVisible({ timeout: 10_000 });
  }

  async assertWaitlistJoined() {
    await expect(this.page.getByText(/lista de espera|waitlist/i)).toBeVisible({ timeout: 10_000 });
  }

  async assertNoCreditsError() {
    await expect(this.page.getByText(/crédito|saldo|insufficient|no tienes/i)).toBeVisible({ timeout: 8_000 });
  }
}
