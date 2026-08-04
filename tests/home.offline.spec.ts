import { expect, test } from '@playwright/test';

test('degrades every GitHub panel when there are no stats', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByRole('heading', { name: 'OGADRA' })).toBeVisible();
	await expect(page.locator('#languages')).toContainText('DATA LINK OFFLINE');
	await expect(page.locator('#log')).toContainText('DATA LINK OFFLINE');
	await expect(page.locator('#activity')).toContainText('LINK OFFLINE');
	await expect(page.locator('#skills .meter')).toHaveCount(0);
});
