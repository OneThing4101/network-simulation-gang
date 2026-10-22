import {expect, test} from '@playwright/test';

// The studio must open on a real, computed model and let the reader move
// between the three topologies the assignment asks for.
test.describe('the atlas', () => {
  test('opens with the protected topology computed', async ({page}) => {
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.locator('.summary-strip')).toBeVisible();
    await expect(page.locator('.summary-strip .metric').first()).toContainText('27');
    await expect(page.locator('.summary-strip')).toContainText('9,088');
    await expect(page.locator('.summary-strip')).toContainText('28.3');
    await expect(page.locator('.map')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('switches between the three topologies and shows the right numbers', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('.summary-strip')).toContainText('9,088');

    await page.getByRole('radio', {name: /MST/}).click();
    await expect(page.locator('.summary-strip')).toContainText('5,889');
    await expect(page.locator('.summary-strip')).toContainText('21');

    await page.getByRole('radio', {name: /Full mesh/}).click();
    await expect(page.locator('.summary-strip')).toContainText('214,427');
    await expect(page.locator('.summary-strip')).toContainText('231');
  });

  test('keeps the topology in the address so a view can be shared', async ({page}) => {
    await page.goto('/');
    await page.getByRole('radio', {name: /MST/}).click();
    await expect(page).toHaveURL(/topo=mst/);
    await page.getByRole('radio', {name: /Full mesh/}).click();
    await expect(page).toHaveURL(/topo=full/);
  });

  test('opens a deep link on the scene it names', async ({page}) => {
    await page.goto('/#scene=evolution&topo=protected');
    await expect(page.locator('.rail-item[aria-current="true"]')).toContainText('Хувьсгал');
    await expect(page.locator('.inspector-head h2')).toContainText('Сүлжээний хувьсгал');
  });

  test('selects a cable from the map and reads its facts', async ({page}) => {
    // The tree is the topology that has bridges, so the list is worth reading.
    await page.goto('/#scene=atlas&topo=mst');
    await expect(page.locator('.inspector-head h2')).toContainText('Трассын');
    const select = page.locator('.inspector select');
    const label = await select.locator('option').nth(1).textContent();
    await select.selectOption({label});
    await expect(page.locator('.inspector')).toContainText('Трассын урт');
    await expect(page.locator('.inspector')).toContainText('км');
    await expect(page.locator('.inspector')).toContainText('Өртөг (weighted км)');
  });

  test('serves the export for the chosen topology', async ({request}) => {
    const response = await request.get('/api/export/geojson?topology=protected');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.type).toBe('FeatureCollection');
    const lines = body.features.filter(feature => feature.geometry.type === 'LineString');
    expect(lines.length).toBe(27);
  });
});
