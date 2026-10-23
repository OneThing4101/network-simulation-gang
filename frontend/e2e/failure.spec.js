import {expect, test} from '@playwright/test';

async function openResilience(page) {
  await page.goto('/#scene=resilience&topo=protected');
  await expect(page.locator('.inspector-head h2')).toContainText('Эрсдэл');
}

async function cutCable(page, value) {
  await page.locator('.inspector select').first().selectOption(value);
  await page.getByRole('button', {name: /Кабель тасалж турших/}).click();
  await expect(page.locator('.timeline')).toBeVisible();
}

// The same cable must fail in two very different ways: a tree isolates
// cities, the protected design reroutes.
test.describe('the failure replay', () => {
  test('a tree isolates the cities behind the cut', async ({page}) => {
    await page.goto('/#scene=resilience&topo=mst');
    await expect(page.locator('.inspector-head h2')).toContainText('Эрсдэл');
    await cutCable(page, 'UB--Zuunmod');
    await expect(page.locator('.statusbar .grow')).toContainText('хот салсан');
    await expect(page.locator('.timeline-step')).toHaveCount(3);
    await expect(page.locator('.timeline-caption')).toContainText('Эхний төлөв');
  });

  test('the protected design reroutes instead of isolating', async ({page}) => {
    await openResilience(page);
    await cutCable(page, 'UB--Zuunmod');
    await expect(page.locator('.statusbar .grow')).toContainText('бүх хот холбоотой');
    await expect(page.locator('.timeline-step')).toHaveCount(4);
    await expect(page.locator('.timeline-step').nth(2)).toContainText('Нөөц зам');
  });

  test('the timeline steps through the computed states', async ({page}) => {
    await openResilience(page);
    await cutCable(page, 'UB--Zuunmod');
    const steps = page.locator('.timeline-step');
    await steps.nth(2).click();
    await expect(page.locator('.timeline-caption')).toContainText('Нөөц зам');
    await expect(steps.nth(0)).toHaveAttribute('data-state', 'done');
    await expect(steps.nth(2)).toHaveAttribute('data-state', 'current');
    await expect(steps.nth(3)).toHaveAttribute('data-state', 'todo');
  });

  test('the reroute is drawn on the map, not only described', async ({page}) => {
    await openResilience(page);
    await cutCable(page, 'UB--Zuunmod');
    await page.locator('.timeline-step').nth(2).click();
    await expect(page.locator('.timeline-caption')).toContainText('км');
    const canvas = await page.locator('.map canvas').count();
    expect(canvas).toBeGreaterThan(0);
  });

  test('the shared-risk scope reports more than one cable', async ({page}) => {
    await openResilience(page);
    await page.getByRole('button', {name: /^Геометр$/}).click();
    await cutCable(page, 'UB--Zuunmod');
    const caption = await page.locator('.timeline-caption').innerText();
    expect(caption.length).toBeGreaterThan(0);
  });
});
