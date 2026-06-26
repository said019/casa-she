import { Page, Locator, expect } from "@playwright/test";

/** Page Object for /client/checkout and related purchase flows */
export class CheckoutPage {
  readonly orderSummary: Locator;
  readonly walletToggle: Locator;
  readonly walletAmountInput: Locator;
  readonly discountInput: Locator;
  readonly applyDiscountBtn: Locator;
  readonly discountError: Locator;
  readonly totalAmount: Locator;
  readonly payBtn: Locator;
  readonly successHeading: Locator;

  constructor(private readonly page: Page) {
    this.orderSummary = page.locator('[data-testid="order-summary"]');
    this.walletToggle = page.getByRole("switch", { name: /wallet|monedero/i }).or(
      page.getByLabel(/usar wallet|use wallet/i)
    );
    this.walletAmountInput = page.getByLabel(/monto wallet|wallet amount/i);
    this.discountInput = page.getByPlaceholder(/código|code|discount/i);
    this.applyDiscountBtn = page.getByRole("button", { name: /aplicar|apply/i });
    this.discountError = page.locator('[data-testid="discount-error"]').or(
      page.getByText(/código inválido|invalid code|expirado|expired/i)
    );
    this.totalAmount = page.locator('[data-testid="total"], [data-testid="checkout-total"]');
    this.payBtn = page.getByRole("button", { name: /pagar|pay|procesar|process/i });
    this.successHeading = page.getByRole("heading", { name: /exitoso|success|completado/i });
  }

  async goto() {
    await this.page.goto("/client/checkout");
    await this.page.waitForLoadState("networkidle");
  }

  async applyDiscount(code: string) {
    await this.discountInput.fill(code);
    await this.applyDiscountBtn.click();
  }

  async assertDiscountApplied() {
    await expect(this.page.getByText(/descuento|discount applied/i)).toBeVisible();
  }

  async assertDiscountError() {
    await expect(this.discountError).toBeVisible();
  }

  async assertPaymentSuccess() {
    await expect(this.successHeading).toBeVisible({ timeout: 20_000 });
  }

  async assertTotal(expectedText: string) {
    await expect(this.totalAmount).toContainText(expectedText);
  }
}
