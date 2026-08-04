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
