import { expect, test } from '@playwright/test';

test('renders the HUD chrome in a browser', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('ogadra.com');
	await expect(page.getByRole('link', { name: 'ogadra.com' })).toHaveAttribute('href', '/');
	await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
		'href',
		'https://github.com/ogadra',
	);
	await expect(page.locator('.ticker')).toContainText('PUBLIC REPOS 42');
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
