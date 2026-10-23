import {expect, test} from '@playwright/test';

// The headline claim of the studio: logical redundancy is not geographic
// independence. The numbers behind it must be computed, not narrated.
test.describe('the geographic common risk', () => {
  test('shows how many protecting chords run alongside the edge they protect', async ({page}) => {
    await page.goto('/#scene=resilience&topo=protected');
    await expect(page.locator('.inspector-head h2')).toContainText('Эрсдэл');
    const finding = page.locator('.callout-fail').first();
    await expect(finding).toBeVisible();
    await expect(finding).toContainText('нэмэлт холбоос');
    await expect(finding).toContainText('км');
  });

  test('the corridor groups are computed by the engine', async ({request}) => {
    const response = await request.get('/api/network/corridors?topology=protected');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.groups.length).toBeGreaterThan(0);
    expect(body.coverage.length).toBeGreaterThan(0);
    const shared = body.coverage.filter(item => item.parallel_km >= 1);
    expect(shared.length).toBeGreaterThan(0);
    const worst = shared.sort((a, b) => b.parallel_km - a.parallel_km)[0];
    expect(worst.parallel_km).toBeGreaterThan(0);
    expect(worst.parallel_km).toBeLessThanOrEqual(worst.overlap_km + 1e-6);
  });

  test('the shared-risk result follows the topology, not the one before it', async ({page}) => {
    await page.goto('/#scene=resilience&topo=protected');
    await expect(page.locator('.inspector')).toContainText('2 бүлэг');
    await page.getByRole('radio', {name: /MST/}).click();
    await expect(page.locator('.inspector')).toContainText('3 бүлэг');
  });

  test('the budget frontier is solved, not drawn', async ({request}) => {
    const response = await request.post('/api/network/optimize', {data: {budgets_wkm: [1000, 4000]}});
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.frontier).toHaveLength(2);
    const [small, large] = body.frontier;
    expect(small.covered).toBeLessThanOrEqual(large.covered);
    expect(large.status).toBe('optimal');
  });
});
