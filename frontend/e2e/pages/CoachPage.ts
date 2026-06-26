import { Page, Locator, expect } from "@playwright/test";

/** Page Object for /coach/* pages */
export class CoachPage {
  readonly classCard: Locator;
  readonly attendanceList: Locator;
  readonly presentBtn: Locator;
  readonly absentBtn: Locator;
  readonly lateCancelBtn: Locator;
  readonly saveAttendanceBtn: Locator;
  readonly substituteBtn: Locator;
  readonly successMsg: Locator;

  constructor(private readonly page: Page) {
    this.classCard = page.locator('[data-testid="class-card"]').first();
    this.attendanceList = page.locator('[data-testid="attendance-list"], [data-testid="student-list"]');
    this.presentBtn = page.getByRole("button", { name: /presente|present|asistió/i }).first();
    this.absentBtn = page.getByRole("button", { name: /ausente|absent/i }).first();
    this.lateCancelBtn = page.getByRole("button", { name: /late cancel|cancelación tardía/i }).first();
    this.saveAttendanceBtn = page.getByRole("button", { name: /guardar|save|confirmar/i });
    this.substituteBtn = page.getByRole("button", { name: /sustitución|substitute|solicitar/i });
    this.successMsg = page.getByRole("status").or(page.getByText(/guardado|saved|enviado|sent/i));
  }

  async gotoDashboard() { await this.page.goto("/coach"); }
  async gotoSchedule() { await this.page.goto("/coach/schedule"); }
  async gotoHistory() { await this.page.goto("/coach/history"); }
  async gotoSubstitutions() { await this.page.goto("/coach/substitutions"); }
  async gotoPlaylists() { await this.page.goto("/coach/playlists"); }
  async gotoTemplates() { await this.page.goto("/coach/templates"); }

  async openFirstClass() {
    await this.classCard.click();
    await this.page.waitForLoadState("networkidle");
  }

  async markFirstStudentPresent() {
    await this.presentBtn.click();
  }

  async markFirstStudentAbsent() {
    await this.absentBtn.click();
  }

  async markFirstStudentLateCancel() {
    await this.lateCancelBtn.click();
  }

  async saveAttendance() {
    await this.saveAttendanceBtn.click();
  }

  async requestSubstitution() {
    await this.substituteBtn.click();
  }

  async assertAttendanceSaved() {
    await expect(this.successMsg).toBeVisible({ timeout: 10_000 });
  }

  async assertSubstitutionRequested() {
    await expect(this.page.getByText(/solicitud enviada|substitution requested|pendiente/i)).toBeVisible({ timeout: 10_000 });
  }
}
