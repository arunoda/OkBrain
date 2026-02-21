import { test, expect } from '@playwright/test';
import { loadTestEnv, cleanupTestDb, setupPageWithUser } from './test-utils';

loadTestEnv();

test.beforeAll(async () => {
  cleanupTestDb();
});

test.describe('Stop Functionality', () => {
  test.describe.configure({ mode: 'parallel' });
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should stop FIRST message generation and ensure NO conversation is created', async ({ page }) => {
    await setupPageWithUser(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Type a message
    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.waitFor({ timeout: 10000 });
    const messageText = 'Write a 1000 word story about a robot who wants to learn how to cook.';
    await input.fill(messageText);

    // Send the message
    await input.press('Enter');

    // Verify stop button appears
    const stopButton = page.locator('button.stop-btn');
    await expect(stopButton).toBeVisible({ timeout: 10000 });

    // Wait a bit to let generation start
    await page.waitForTimeout(2000);

    // Stop it
    await stopButton.click();

    // Verify the input is IMMEDIATELY restored (before cancellation completes)
    await expect(input).toHaveValue(messageText, { timeout: 500 });

    // Verify textarea is disabled during cancellation
    await expect(input).toBeDisabled();

    // Verify stop button is hidden during cancellation
    await expect(stopButton).not.toBeVisible();

    // Verify "Cancelling" status is shown in the streaming message
    const cancellingStatus = page.locator('.typing-indicator:has-text("Cancelling")');
    await expect(cancellingStatus).toBeVisible({ timeout: 2000 });

    // Wait for cancellation to complete - cancelling status disappears
    await expect(cancellingStatus).not.toBeVisible({ timeout: 10000 });

    // Verify textarea is enabled again after cancellation
    await expect(input).toBeEnabled();

    // Verify the input still has the message
    await expect(input).toHaveValue(messageText);

    // Verify the messages are removed from the UI
    const messagesCount = await page.locator('.message').count();
    expect(messagesCount).toBe(0);

    // Reload the page and verify they are still gone (server-side cleanup check)
    await page.reload();
    await page.waitForLoadState('networkidle');
    const messagesCountAfterReload = await page.locator('.message').count();
    expect(messagesCountAfterReload).toBe(0);

    // Verify NO conversation created (should look like a new chat)
    // We can check /api/conversations or check if the URL is still just / (or the initial one) and no history in sidebar
    const res = await page.request.get('/api/conversations');
    const conversations = await res.json();
    expect(conversations.length).toBe(0);

    // Also verify side bar is empty
    const sidebarConversations = page.locator('.sidebar-conversation');
    expect(await sidebarConversations.count()).toBe(0);
  });

  test('should show text immediately in textarea and disable it during cancellation', async ({ page }) => {
    await setupPageWithUser(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.waitFor({ timeout: 10000 });
    const messageText = 'Tell me a long story about space exploration.';
    await input.fill(messageText);
    await input.press('Enter');

    // Wait for streaming to start
    const stopButton = page.locator('button.stop-btn');
    await expect(stopButton).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Click stop
    await stopButton.click();

    // These should happen immediately (within 500ms):
    // 1. Text is restored to textarea
    await expect(input).toHaveValue(messageText, { timeout: 500 });

    // 2. Textarea is disabled
    await expect(input).toBeDisabled({ timeout: 500 });

    // 3. Stop button is hidden during cancellation
    await expect(stopButton).not.toBeVisible({ timeout: 500 });

    // Wait for cancellation to complete - textarea becomes enabled
    await expect(input).toBeEnabled({ timeout: 10000 });

    // 4. Textarea is enabled again
    await expect(input).toBeEnabled();

    // 5. Cursor should be at end of text (verify by checking we can type at end)
    await input.focus();
    await input.press('End');
    await page.keyboard.type(' - continued');
    await expect(input).toHaveValue(messageText + ' - continued');
  });

  test('should stop SECOND message generation and ensure conversation PERSISTS', async ({ page }) => {
    await setupPageWithUser(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 1. Send first message to create conversation
    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.fill('Hello');
    await input.press('Enter');

    // Wait for first message to complete
    await page.locator('.message.assistant').waitFor({ timeout: 20000 });
    // Handle if it's streaming, wait for stop button to go away
    await expect(page.locator('button.stop-btn')).not.toBeVisible({ timeout: 30000 });

    // Verify conversation created
    let res = await page.request.get('/api/conversations');
    let conversations = await res.json();
    expect(conversations.length).toBe(1);
    const conversationId = conversations[0].id;

    // 2. Send second message
    const secondMessage = 'Write a long poem about space.';
    await input.fill(secondMessage);
    await input.press('Enter');

    // Verify stop button appears
    const stopButton = page.locator('button.stop-btn');
    await expect(stopButton).toBeVisible({ timeout: 10000 });

    // Wait a bit
    await page.waitForTimeout(1000);

    // Stop it
    await stopButton.click();
    await expect(stopButton).not.toBeVisible({ timeout: 10000 });

    // Verify input restored
    await expect(input).toHaveValue(secondMessage);

    // Verify new messages removed (should only have the first 2 messages: user + assistant)
    const messages = page.locator('.message');
    await expect(messages).toHaveCount(2);

    // Reload and verify
    await page.reload();
    const messagesAfterReload = page.locator('.message');
    await expect(messagesAfterReload).toHaveCount(2);

    // Verify conversation STILL exists
    res = await page.request.get('/api/conversations');
    conversations = await res.json();
    expect(conversations.length).toBe(1);
    expect(conversations[0].id).toBe(conversationId);
  });

  test('should stop Summary generation and NOT restore input', async ({ page }) => {
    await setupPageWithUser(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Send a message first
    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.fill('Write a short story.');
    await input.press('Enter');
    await page.locator('.message.assistant').waitFor({ timeout: 20000 });
    await expect(page.locator('button.stop-btn')).not.toBeVisible({ timeout: 30000 });

    // Click Summarize button
    const summarizeButton = page.locator('button.summarize-button');
    await expect(summarizeButton).toBeVisible({ timeout: 5000 });
    await summarizeButton.click();

    // Verify stop button appears
    const stopButton = page.locator('button.stop-btn');
    await expect(stopButton).toBeVisible();

    // Stop it
    await stopButton.click();
    await expect(stopButton).not.toBeVisible();

    // Verify input is EMPTY
    await expect(input).toHaveValue('');

    // Verify summary placeholder is gone. 
    // We should only have 2 messages (User + Assistant response)
    const messages = page.locator('.message');
    await expect(messages).toHaveCount(2);
  });

  test('should stop Verify generation and NOT restore input', async ({ page }) => {
    await setupPageWithUser(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Send a message first
    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.fill('State a fact about cats.');
    await input.press('Enter');
    await page.locator('.message.assistant').waitFor({ timeout: 20000 });
    await expect(page.locator('button.stop-btn')).not.toBeVisible({ timeout: 30000 });

    // Click Verify button
    const verifyButton = page.locator('button.verify-button-main');
    await expect(verifyButton).toBeVisible({ timeout: 5000 });
    await verifyButton.click();

    // Verify stop button appears
    const stopButton = page.locator('button.stop-btn');
    await expect(stopButton).toBeVisible();

    // Stop it
    await stopButton.click();
    await expect(stopButton).not.toBeVisible();

    // Verify input is EMPTY
    await expect(input).toHaveValue('');

    // Verify verification placeholder is gone.
    // We should only have 2 messages
    const messages = page.locator('.message');
    await expect(messages).toHaveCount(2);
  });

});
