import { Page, Locator, expect } from "@playwright/test";

/** Page Object for /client/video-library and /client/video-player/:id */
export class VideoPage {
  readonly videoGrid: Locator;
  readonly videoPlayer: Locator;
  readonly accessDeniedMessage: Locator;
  readonly lockIcon: Locator;

  constructor(private readonly page: Page) {
    this.videoGrid = page.locator('[data-testid="video-grid"], [data-testid="video-library"]');
    this.videoPlayer = page.locator('video, [data-testid="video-player"]');
    this.accessDeniedMessage = page.getByText(/acceso restringido|membresía requerida|upgrade|no tienes acceso/i);
    this.lockIcon = page.locator('[data-testid="lock-icon"], [aria-label*="locked"]');
  }

  async gotoLibrary() {
    await this.page.goto("/client/video-library");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoPlayer(videoId: string) {
    await this.page.goto(`/client/video-player/${videoId}`);
    await this.page.waitForLoadState("networkidle");
  }

  async clickFirstVideo() {
    const firstVideo = this.videoGrid.locator("a, [data-testid='video-card']").first();
    await firstVideo.click();
  }

  async assertVideoPlays() {
    await expect(this.videoPlayer).toBeVisible({ timeout: 10_000 });
  }

  async assertAccessDenied() {
    await expect(this.accessDeniedMessage.or(this.lockIcon)).toBeVisible({ timeout: 8_000 });
  }

  async assertLibraryLoaded() {
    await expect(this.videoGrid).toBeVisible();
  }
}
