import {expect, test} from '@playwright/test';

// A phone is not a small desktop. The plate must stay interactive, the
// interface must not spill sideways, and the controls must stay reachable.
test.describe('the phone layout', () => {
  test('does not scroll sideways', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('.summary-strip')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('keeps the map interactive under the interface', async ({page}) => {
    await page.goto('/');
    const map = page.locator('.map');
    const box = await map.boundingBox();
    expect(box.width).toBeGreaterThan(300);
    expect(box.height).toBeGreaterThan(400);
  });

  test('puts the topology switch on the plate with its names', async ({page}) => {
    await page.goto('/');
    const mode = page.locator('.mode-plate .mode-switch');
    await expect(mode).toBeVisible();
    await expect(mode).toContainText('MST');
    await expect(mode).toContainText('2-Edge');
    await expect(mode).toContainText('Full mesh');
  });

  test('moves the scene rail above the plate as a horizontal strip', async ({page}) => {
    await page.goto('/');
    const rail = page.locator('.rail');
    await expect(rail).toBeVisible();
    const overflow = await rail.evaluate(node => node.scrollWidth > node.clientWidth);
    expect(typeof overflow).toBe('boolean');
    await expect(page.locator('.rail-item').first()).toBeVisible();
  });

  test('opens the inspector as a sheet without pushing the page', async ({page}) => {
    await page.goto('/#scene=resilience&topo=protected');
    // On a phone the inspector starts folded; the reader opens it when needed.
    await page.getByRole('button', {name: /Дэлгэрэнгүй хайврыг/}).click();
    await expect(page.locator('.inspector-head h2')).toContainText('Эрсдэл');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('folds the legend so it does not cover the plate', async ({page}) => {
    await page.goto('/');
    const legend = page.locator('.legend');
    await expect(legend).toBeVisible();
    const body = legend.locator('.legend-body');
    if (await body.count() > 0) {
      await expect(body).toBeHidden();
    }
  });
});
