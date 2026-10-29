import { test, expect, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The visual reference is the unchanged static UI at the feature branch's parent commit. */
const reference = process.env.VISUAL_REFERENCE_URL || 'http://127.0.0.1:4174';
const candidate = process.env.VISUAL_CANDIDATE_URL || 'http://127.0.0.1:4173';
const output = 'test-results/visual-diffs';

type Scene = 'login' | 'dashboard' | 'studio' | 'reports';

async function openScene(page: Page, base: string, scene: Scene) {
  // Same viewport and reference fixture data for both versions; suppress remote
  // club badge requests and motion so nondeterministic network timing cannot
  // create false changes in the screenshots.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => route.abort());
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#loginemail').waitFor();
  if (scene !== 'login') {
    await page.evaluate(() => {
      window.fillDemo?.('admin@demo.seebot.ai');
      window.login?.({ preventDefault() {} } as Event);
    });
    await page.locator('.ops-nav').waitFor();
    if (scene === 'studio') {
      await page.evaluate(() => window.openTask?.('task_demo1'));
      await page.locator('.studio-grid').waitFor();
    }
    if (scene === 'reports') {
      await page.evaluate(() => window.navigate?.('reports'));
      await page.locator('.insights-dashboard').waitFor();
    }
  }
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}' });
  await page.evaluate(async () => { await document.fonts.ready; });
}

const scenes: { label: string; scene: Scene; viewport: { width: number; height: number }; selector: string; maxPixelDifference: number }[] = [
  { label: 'login-desktop', scene: 'login', viewport: { width: 1440, height: 900 }, selector: '.login-central', maxPixelDifference: .24 },
  { label: 'dashboard-desktop', scene: 'dashboard', viewport: { width: 1440, height: 900 }, selector: '.dashboard-banner', maxPixelDifference: .24 },
  { label: 'annotation-studio-desktop', scene: 'studio', viewport: { width: 1440, height: 900 }, selector: '.studio-grid', maxPixelDifference: .26 },
  { label: 'analytics-desktop', scene: 'reports', viewport: { width: 1440, height: 900 }, selector: '.insights-dashboard', maxPixelDifference: .26 },
  { label: 'login-mobile', scene: 'login', viewport: { width: 390, height: 844 }, selector: '.login-central', maxPixelDifference: .27 },
  { label: 'annotation-studio-mobile', scene: 'studio', viewport: { width: 390, height: 844 }, selector: '.studio-grid', maxPixelDifference: .30 },
];

for (const scene of scenes) {
  test(`preserves ${scene.label} composition and design`, async ({ browser }) => {
    const before = await browser.newPage({ viewport: scene.viewport, deviceScaleFactor: 1 });
    const after = await browser.newPage({ viewport: scene.viewport, deviceScaleFactor: 1 });
    try {
      await openScene(before, reference, scene.scene);
      await openScene(after, candidate, scene.scene);
      const beforeBox = await before.locator(scene.selector).boundingBox();
      const afterBox = await after.locator(scene.selector).boundingBox();
      expect(beforeBox, `Reference missing ${scene.selector}`).not.toBeNull();
      expect(afterBox, `Candidate missing ${scene.selector}`).not.toBeNull();
      // Detect missing/repositioned major UI regions independently of pixel color.
      expect(Math.abs(beforeBox!.x - afterBox!.x), 'Main content horizontal offset').toBeLessThanOrEqual(22);
      expect(Math.abs(beforeBox!.y - afterBox!.y), 'Main content vertical offset').toBeLessThanOrEqual(28);
      const original = PNG.sync.read(await before.screenshot({ animations: 'disabled' }));
      const migrated = PNG.sync.read(await after.screenshot({ animations: 'disabled' }));
      expect(original.width).toBe(migrated.width);
      expect(original.height).toBe(migrated.height);
      const diff = new PNG({ width: original.width, height: original.height });
      const changed = pixelmatch(original.data, migrated.data, diff.data, original.width, original.height, { threshold: .15, includeAA: false });
      const ratio = changed / (original.width * original.height);
      mkdirSync(output, { recursive: true });
      writeFileSync(join(output, `${scene.label}-reference.png`), PNG.sync.write(original));
      writeFileSync(join(output, `${scene.label}-react.png`), PNG.sync.write(migrated));
      writeFileSync(join(output, `${scene.label}-diff.png`), PNG.sync.write(diff));
      test.info().annotations.push({ type: 'pixel-diff', description: `${(ratio * 100).toFixed(2)}% (limit ${(scene.maxPixelDifference * 100).toFixed(0)}%)` });
      expect(ratio, `Visual difference too high; inspect ${output}/${scene.label}-diff.png`).toBeLessThanOrEqual(scene.maxPixelDifference);
    } finally {
      await before.close(); await after.close();
    }
  });
}

declare global {
  interface Window {
    fillDemo?: (email: string) => void;
    login?: (event: Event) => void;
  }
}
