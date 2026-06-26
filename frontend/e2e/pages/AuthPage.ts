import { Page, Locator, expect } from "@playwright/test";

/** Page Object for /login and /register */
export class AuthPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitBtn: Locator;
  readonly errorAlert: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByLabel(/correo|email/i);
    this.passwordInput = page.getByLabel(/contraseña|password/i);
    this.submitBtn = page.getByRole("button", { name: /iniciar|entrar|login|sign in/i });
    this.errorAlert = page.getByRole("alert");
  }

  async gotoLogin() {
    await this.page.goto("/login");
  }

  async gotoRegister() {
    await this.page.goto("/register");
  }

  async gotoForgotPassword() {
    await this.page.goto("/forgot-password");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
  }

  async register(name: string, email: string, password: string, phone?: string) {
    await this.page.getByLabel(/nombre|name/i).fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    if (phone) {
      const phoneLoc = this.page.getByLabel(/teléfono|phone/i);
      if (await phoneLoc.isVisible()) await phoneLoc.fill(phone);
    }
    await this.submitBtn.click();
  }

  async requestPasswordReset(email: string) {
    await this.emailInput.fill(email);
    await this.page.getByRole("button", { name: /enviar|send|reset/i }).click();
  }

  async assertError(message: RegExp | string) {
    await expect(this.errorAlert).toContainText(message);
  }

  async assertRedirectedToDashboard() {
    await expect(this.page).not.toHaveURL(/login|register/);
  }
}
