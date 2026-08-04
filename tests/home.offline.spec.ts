import { expect, test } from '@playwright/test';

test('keeps the HUD chrome up when there are no stats', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('ogadra.com');
	await expect(page.locator('.ticker')).toContainText('PUBLIC REPOS --');
});
