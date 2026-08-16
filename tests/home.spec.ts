import { expect, test } from '@playwright/test';

test('renders the home page in a browser', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('ogadra.com');
	await expect(page.getByRole('heading', { name: 'OGADRA' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'ogadra.com' })).toHaveAttribute('href', '/');
	await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
		'href',
		'https://github.com/ogadra',
	);
	await expect(page.getByRole('img', { name: "ogadra's Icon Image." })).toBeVisible();
	await expect(page.getByText('FRONT-END')).toBeVisible();
	await expect(page.getByText('INFRASTRUCTURE')).toBeVisible();
});

test('renders the GitHub panels from the pinned fixture', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText('DATA LINK OFFLINE')).toHaveCount(0);
	await expect(page.locator('.ticker')).toContainText('PUBLIC REPOS 42');
	await expect(page.locator('#languages').getByText('TypeScript')).toBeVisible();
	await expect(page.locator('#languages').getByText('55%')).toBeVisible();
	await expect(page.locator('#log')).toContainText('07/05 23:12 PUSH ogadra/portfolio');
	await expect(page.locator('#subject .stat.orange .stat-value')).toHaveText('42');
	await expect(page.locator('#subject .stat.cyan .stat-value')).toHaveText('7');
	await expect(page.locator('#subject .stat.green .stat-value')).toHaveText('NOMINAL');
	// the counter animates up to the fixture total, so wait for it to land
	await expect(page.locator('#activity [data-hud-contributions]')).toHaveText('21');
	// the fixture has four silent days among its fourteen
	await expect(page.locator('#activity .wave span.off')).toHaveCount(4);
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

	await expect(page.locator('[data-hud-date]')).toHaveText(/^\d{4}\/\d{2}\/\d{2}$/);
	await expect(page.locator('[data-hud-time]')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
});
