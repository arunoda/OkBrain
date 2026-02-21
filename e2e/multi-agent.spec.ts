import { test, expect } from '@playwright/test';
import { loadTestEnv, cleanupTestDb, waitForApiResponse, setupPageWithUser, verifyTestDb, waitForChatCompletion } from './test-utils';

loadTestEnv();

// Run cleanup once per worker (not per test)
let cleanupDone = false;
test.beforeAll(async () => {
  if (!cleanupDone) {
    // cleanupTestDb(); // Disabled to prevent race conditions in parallel mode
    if (process.env.VERIFY_DB !== 'false') {
      verifyTestDb();
      process.env.VERIFY_DB = 'false';
    }
    cleanupDone = true;
  }
});

test.describe('Multi-Agent Awareness (Simulated)', () => {
  // Enable parallel mode for tests in this describe block
  test.describe.configure({ mode: 'parallel' });

  // Don't use shared storageState - each test will create its own user
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    // Setup unique user for this test
    await setupPageWithUser(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Gemini should recognize a simulated previous bot and not self-prefix', async ({ page }) => {
    // 1. Send first message with Gemini
    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.fill('Hello Gemini');

    const responsePromise = waitForApiResponse(page, '/api/chat', 60000);
    await input.press('Enter');
    await responsePromise;

    // Wait for URL to update to /chat/[id]
    await page.waitForURL(/\/chat\/[a-f0-9-]+$/, { timeout: 15000 });

    // Wait for stream to complete
    await waitForChatCompletion(page);

    // Wait for the assistant message to appear
    const assistantMessage = page.locator('.message.assistant').first();
    await expect(assistantMessage).toBeVisible({ timeout: 15000 });

    // Wait for the verify button to appear - this confirms streaming is done and message is saved
    const verifyButton = page.locator('.verify-button-main');
    await expect(verifyButton).toBeVisible({ timeout: 30000 });

    // Extra wait to ensure DB write is complete
    await page.waitForTimeout(2000);

    // 2. SIMULATE: Change this message's model to "Grok 4.1 Fast" via direct DB update
    // Playwright tests run in Node.js, so we can access the DB directly
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = process.env.TEST_DB_PATH ? path.resolve(process.env.TEST_DB_PATH) : path.join(process.cwd(), 'brain.test.db');
    const db = new Database(dbPath);

    try {
      // Force WAL checkpoint to ensure all writes are visible
      db.pragma('wal_checkpoint(FULL)');

      // Get the conversation ID from URL
      const url = page.url();
      const conversationId = url.split('/chat/')[1];

      // Get the latest assistant message for this conversation
      const row = db.prepare(`
        SELECT id FROM messages 
        WHERE role = 'assistant' AND conversation_id = ?
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(conversationId);

      if (row && row.id) {
        db.prepare("UPDATE messages SET model = ? WHERE id = ?").run('Grok 4.1 Fast', row.id);
        db.pragma('wal_checkpoint(FULL)'); // Force checkpoint after update
        console.log(`[TEST] Successfully updated message ${row.id} model to Grok 4.1 Fast`);
      } else {
        throw new Error("Could not find the assistant message in DB");
      }
    } finally {
      db.close();
    }

    // 3. Reload to see the change - force a navigation to ensure fresh data
    const currentUrl = page.url();
    await page.goto(currentUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000); // Give UI time to settle and fetch fresh data

    // Verify the message is now labeled as Grok in the UI
    // Verify the message is now labeled as Grok in the UI
    // We target the first assistant message
    const modelTag = page.locator('.message.assistant').first().locator('.model-tag');
    await expect(modelTag).toBeVisible({ timeout: 10000 });
    // This expects the DB update to have worked and the reload to have fetched it.
    await expect(modelTag).toContainText('Grok');

    // 4. Ask Gemini about the history
    await input.fill('Who was the previous bot in this conversation?');

    const secondResponsePromise = waitForApiResponse(page, '/api/chat', 60000);
    await input.press('Enter');
    await secondResponsePromise;

    // Wait for stream to complete
    await waitForChatCompletion(page);

    // 5. Verify Gemini's awareness and no-prefixing
    const secondAssistantMessage = page.locator('.message.assistant').nth(1);
    await expect(secondAssistantMessage).toBeVisible({ timeout: 30000 });

    // Wait for text to appear
    await expect(secondAssistantMessage.locator('.message-text')).not.toBeEmpty();

    const text = await secondAssistantMessage.locator('.message-text').textContent();
    console.log('Gemini second response:', text);

    // Check for awareness - it should see "Grok 4.1 Fast" in history
    expect(text?.toLowerCase()).toContain('grok');

    // CRITICAL: Check for NO self-prefix
    expect(text).not.toContain('[Gemini 3 Flash]:');
    expect(text).not.toContain('[Grok 4.1 Fast]:');

    // UI should show it's Gemini
    await expect(secondAssistantMessage.locator('.model-tag')).toContainText('Gemini');
  });

  test('should show verify button and switch models when clicked', async ({ page }) => {
    // Verify initial AI provider is Gemini
    const providerSelect = page.locator('#ai-provider');
    await expect(providerSelect).toHaveValue('gemini');

    // Type a message
    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.waitFor({ timeout: 10000 });
    await input.fill('What is the capital of France?');

    // Send the message
    const responsePromise = waitForApiResponse(page, '/api/chat', 60000);
    await input.press('Enter');

    // Wait for the API call to complete
    await responsePromise;

    // Wait for the assistant response to finish streaming and the button to appear
    const verifyButton = page.locator('.verify-button-main');
    await expect(verifyButton).toBeVisible({ timeout: 30000 });
    await expect(verifyButton).toContainText('Verify with Grok');

    // Click the verify button
    const verifyResponsePromise = waitForApiResponse(page, '/api/chat', 60000);
    await verifyButton.click();

    // Wait for the verification API call
    await verifyResponsePromise;

    // Check that AI provider has NOT switched (should stay as gemini)
    await expect(providerSelect).toHaveValue('gemini');

    // Check that a new assistant message appeared
    const assistantMessages = page.locator('.message.assistant');
    await expect(assistantMessages).toHaveCount(2);

    // Verify the second message has the correct model name - wait for it to be visible (after typing indicator)
    const secondModelTag = assistantMessages.nth(1).locator('.model-tag');
    await expect(secondModelTag).toBeVisible({ timeout: 15000 });
    await expect(secondModelTag).toContainText('Grok');

    // 6. Verify persistence: Reload the page
    // The conversation provider should NOT have changed to Grok permanently
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(providerSelect).toHaveValue('gemini');
  });

  test('should generate a conversation summary when clicked', async ({ page }) => {
    // 1. Send a message to have something to summarize
    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.fill('Tell me a short story about a robot who loves to cook.');
    const responsePromise = waitForApiResponse(page, '/api/chat', 60000);
    await input.press('Enter');
    await responsePromise;

    // 2. Wait for the summarize button to appear
    const summarizeButton = await waitForChatCompletion(page);

    // 3. Click the summarize button
    const summarizePromise = waitForApiResponse(page, '/api/summarize', 60000);
    await summarizeButton.click();
    await summarizePromise;

    // 4. Verify a summary message appeared in the UI
    const summaryMessage = page.locator('.message.summary');
    // The container should appear quickly
    await expect(summaryMessage).toBeVisible({ timeout: 20000 });

    // The text content is streamed, so we wait for it to contain actual text
    // We expect it to NOT be empty after some time
    await expect(summaryMessage.locator('.message-text')).toContainText(/\S/, { timeout: 30000 });
  });

  test('should resume summary with proper styling after page reload', async ({ page }) => {
    test.setTimeout(90000); // Extended timeout for this test

    // 1. Send a short message to have something to summarize
    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.fill('Say hello.');
    const responsePromise = waitForApiResponse(page, '/api/chat', 60000);
    await input.press('Enter');
    await responsePromise;

    // 2. Wait for chat to complete
    await waitForChatCompletion(page);

    // 3. Click the summarize button
    const summarizeButton = page.locator('.summarize-button');
    await summarizeButton.click();

    // 4. Wait for summary message to appear (streaming started)
    const summaryMessage = page.locator('.message.summary');
    await expect(summaryMessage).toBeVisible({ timeout: 10000 });

    // 5. Reload the page while summarization is in progress
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 6. Verify the summary message is still visible with proper styling
    // The .message.summary class should be applied (SSR resume with correct role)
    const resumedSummaryMessage = page.locator('.message.summary');
    await expect(resumedSummaryMessage).toBeVisible({ timeout: 10000 });

    // 7. Verify the summary completes with content
    await expect(resumedSummaryMessage.locator('.message-text')).toContainText(/\S/, { timeout: 30000 });
  });
});


