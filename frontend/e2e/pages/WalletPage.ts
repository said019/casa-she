import { Page, Locator, expect } from "@playwright/test";

/** Page Object for /client/wallet and /client/wallet-history */
export class WalletPage {
  readonly balance: Locator;
  readonly historyTable: Locator;
  readonly rewardsSection: Locator;

  constructor(private readonly page: Page) {
    this.balance = page.locator('[data-testid="wallet-balance"]').or(
      page.getByText(/saldo|balance/i).first()
    );
    this.historyTable = page.locator('[data-testid="wallet-history"], table');
    this.rewardsSection = page.locator('[data-testid="wallet-rewards"]');
  }

  async goto() {
    await this.page.goto("/client/wallet");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoHistory() {
    await this.page.goto("/client/wallet-history");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoRewards() {
    await this.page.goto("/client/wallet-rewards");
    await this.page.waitForLoadState("networkidle");
  }

  async getBalanceAmount(): Promise<string> {
    return (await this.balance.textContent()) ?? "0";
  }

  async assertBalanceVisible() {
    await expect(this.balance).toBeVisible();
  }

  async assertHistoryHasRows() {
    await expect(this.historyTable.locator("tr, [data-testid='history-row']").first()).toBeVisible();
  }

  /** Parses numeric MXN value from balance text e.g. "$150.00" → 150 */
  async getBalanceNumeric(): Promise<number> {
    const text = await this.getBalanceAmount();
    const num = parseFloat(text.replace(/[^0-9.]/g, ""));
    return isNaN(num) ? 0 : num;
  }
}
