import { expect, test } from '@playwright/test';

test('renders the home page in a browser', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('ogadra.com');
	await expect(page.getByRole('heading', { name: 'OGADRA' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'ogadra.com' })).toHaveAttribute('href', '/');
	await expect(page.getByRole('img', { name: "ogadra's Icon Image." })).toBeVisible();
	await expect(page.getByText('FRONT-END')).toBeVisible();
	await expect(page.getByText('INFRASTRUCTURE')).toBeVisible();
});

test('renders the GitHub panels from the pinned fixture', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText('DATA LINK OFFLINE')).toHaveCount(0);
	await expect(page.locator('#languages').getByText('TypeScript')).toBeVisible();
	await expect(page.locator('#languages').getByText('55%')).toBeVisible();
	await expect(page.locator('#log')).toContainText('PUSH ogadra/portfolio');
	const readouts = page.locator('#subject .stat-value');
	await expect(readouts.nth(0)).toHaveText('42');
	await expect(readouts.nth(1)).toHaveText('7');
	// the counter animates up to the fixture total, so wait for it to land
	await expect(page.locator('#activity [data-count]')).toHaveText('21');
});

test('drops the boot overlay and leaves the HUD visible', async ({ page }) => {
	await page.goto('/');

	await expect(page.locator('#boot')).toHaveCount(0);
	await expect(page.locator('.command-bar')).toBeVisible();
	await expect(page.locator('.ticker')).toBeVisible();
});

test('lifts the ticker above the background layer', async ({ page }) => {
	await page.goto('/');

	await expect(page.locator('.ticker')).toHaveCSS('position', 'relative');
	await expect(page.locator('.ticker')).toHaveCSS('z-index', '1');
});

test('replaces the clock placeholders with the current time', async ({ page }) => {
	await page.goto('/');

	await expect(page.locator('[data-hud-date]')).toHaveText(/^\d{4}\.\d{2}\.\d{2}$/);
	await expect(page.locator('[data-hud-time]')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
});
