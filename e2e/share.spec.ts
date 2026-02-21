import { test, expect } from '@playwright/test';
import { v4 as uuid } from 'uuid';
import { setupPageWithUser } from './test-utils';

test.describe('Public Sharing', () => {
  test('should share a conversation', async ({ page, browser }) => {
    // 1. Create a conversation
    await setupPageWithUser(page);
    await page.goto('/');
    const chatInput = page.getByPlaceholder(/Ask me anything/i);
    await chatInput.fill('Hello for sharing');
    await chatInput.press('Enter');

    // Wait for response
    await expect(page.locator('.message.assistant')).toBeVisible({ timeout: 20000 });

    // 2. Open Share Modal
    await page.getByLabel('More options').click();
    await page.getByText('Share', { exact: true }).click();

    // 3. Generate link
    await expect(page.getByText('Share Publicly')).toBeVisible();
    await page.locator('#generate-share-link').click();

    // 4. Get the link
    const linkElement = page.locator('#share-url-text');
    await expect(linkElement).toBeVisible();
    const publicUrl = await linkElement.innerText();
    expect(publicUrl).toContain('/s/');

    // 5. Open public link in a new context (to simulate a different user)
    // We use browser.newContext() to ensure no session/cookies are shared
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    await newPage.goto(publicUrl);

    // 6. Verify content
    await expect(newPage.locator('h1')).toBeVisible();
    await expect(newPage.locator('.message.user')).toContainText('Hello for sharing');
    await expect(newPage.locator('.message.assistant')).toBeVisible();

    // Verify no private elements
    await expect(newPage.locator('.sidebar')).not.toBeVisible();
    await expect(newPage.getByPlaceholder(/Ask me anything/i)).not.toBeVisible();

    await newContext.close();
  });

  test('should share a document', async ({ page, browser }) => {
    // 1. Create a document
    await setupPageWithUser(page);
    await page.goto('/');
    // Click 'Doc' button in sidebar
    await page.getByRole('button', { name: /^Doc$/ }).click();

    // Wait for document page to load
    await page.waitForURL(/\/doc\//);

    const titleInput = page.getByPlaceholder(/Untitled Document/i);
    await titleInput.fill('Public Doc Test');
    await titleInput.blur();

    // The editor content is in .tiptap
    const editor = page.locator('.tiptap');
    await editor.click();
    await page.keyboard.type('This is public content');

    // Wait for save
    await page.waitForTimeout(2000);

    // 2. Open Share Modal (from triple-dot menu)
    await page.getByLabel('More options').click();
    await page.getByText('Share', { exact: true }).click();

    // 3. Generate link
    await page.locator('#generate-share-link').click();

    // 4. Get the link
    const linkElement = page.locator('#share-url-text');
    await expect(linkElement).toBeVisible();
    const publicUrl = await linkElement.innerText();

    // 5. Open public link
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    await newPage.goto(publicUrl);

    // 6. Verify
    await expect(newPage.locator('h1')).toHaveText('Public Doc Test');
    await expect(newPage.locator('.tiptap')).toContainText('This is public content');

    // Verify read-only
    const tiptap = newPage.locator('.tiptap');
    await expect(tiptap).toHaveAttribute('contenteditable', 'false');

    await newContext.close();
  });
});
