import { expect, test } from '@playwright/test';

test('renders the home page in a browser', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('ogadra.com');
	await expect(page.getByRole('heading', { name: 'Welcome to ogadra.com!' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'ogadra.com' })).toHaveAttribute('href', '/');
	await expect(page.getByRole('img', { name: "ogadra's Icon Image." })).toBeVisible();
	await expect(page.locator('[data-typewriter]')).toContainText('Front-End', { timeout: 3000 });
});
