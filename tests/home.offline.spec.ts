import { expect, test } from '@playwright/test';

test('degrades every GitHub panel when there are no stats', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('ogadra.com');
	await expect(page.getByRole('heading', { name: 'OGADRA' })).toBeVisible();
	await expect(page.locator('#activity')).toContainText('DATA LINK OFFLINE');
	await expect(page.locator('#languages')).toContainText('DATA LINK OFFLINE');
	await expect(page.locator('#log')).toContainText('DATA LINK OFFLINE');
	await expect(page.locator('.ticker')).toContainText('PUBLIC REPOS --');
});

test('reads every stat as unavailable rather than as a zero', async ({ page }) => {
	await page.goto('/');

	await expect(page.locator('#subject .stat.orange .stat-value')).toHaveText('--');
	await expect(page.locator('#subject .stat.cyan .stat-value')).toHaveText('--');
	await expect(page.locator('#subject .stat.green .stat-value')).toHaveText('OFFLINE');
	// NO LINK is what tells a missing fetch apart from a missing language
	await expect(page.locator('#skills .na')).toHaveCount(3);
	await expect(page.locator('#skills')).toContainText('NO LINK');
	await expect(page.locator('#skills .meter')).toHaveCount(0);
});
