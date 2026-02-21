import { test, expect } from '@playwright/test';
import { loadTestEnv, cleanupTestDb, setupPageWithUser, waitForChatCompletion } from './test-utils';
import * as path from 'path';

loadTestEnv();

test.beforeAll(() => {
  cleanupTestDb();
});

// Seed chat messages directly in the database
function seedChatMessages(userId: string, conversations: Array<{
  messages: Array<{ role: string; content: string }>;
}>) {
  const Database = require('better-sqlite3');
  const { v4: uuidv4 } = require('uuid');
  const dbPath = path.resolve(process.env.TEST_DB_PATH || 'brain.test.db');
  const db = new Database(dbPath);

  const insertConv = db.prepare(`
    INSERT INTO conversations (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMsg = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const conv of conversations) {
    const conversationId = uuidv4();
    const now = new Date().toISOString();
    insertConv.run(conversationId, userId, 'Test Conversation', now, now);

    for (const msg of conv.messages) {
      insertMsg.run(uuidv4(), conversationId, msg.role, msg.content, now);
    }
  }

  db.pragma('wal_checkpoint(FULL)');
  db.close();
}

// Read facts from DB for a user
function getFactsFromDb(userId: string): Array<{ id: string; category: string; fact: string }> {
  const Database = require('better-sqlite3');
  const dbPath = path.resolve(process.env.TEST_DB_PATH || 'brain.test.db');
  const db = new Database(dbPath);

  const facts = db.prepare(
    'SELECT id, category, fact FROM facts WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);

  db.close();
  return facts as Array<{ id: string; category: string; fact: string }>;
}

// Seed facts directly in the database
function seedFacts(userId: string, facts: Array<{ category: string; fact: string }>) {
  const Database = require('better-sqlite3');
  const { v4: uuidv4 } = require('uuid');
  const dbPath = path.resolve(process.env.TEST_DB_PATH || 'brain.test.db');
  const db = new Database(dbPath);

  const insertFact = db.prepare(`
    INSERT INTO facts (id, user_id, category, fact, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const f of facts) {
    insertFact.run(uuidv4(), userId, f.category, f.fact, new Date().toISOString());
  }

  db.pragma('wal_checkpoint(FULL)');
  db.close();
}

test.describe('Fact Deletion', () => {
  test('should delete a fact from the /me page', async ({ page }) => {
    const user = await setupPageWithUser(page);

    // Seed some facts
    seedFacts(user.id, [
      { category: 'core', fact: 'Lives in Sri Lanka' },
      { category: 'technical', fact: 'Prefers TypeScript over JavaScript' },
      { category: 'project', fact: 'Building a knowledge app called Brain' },
    ]);

    // Navigate to /me and switch to Facts tab
    await page.goto('/me');
    await page.locator('.me-tab:has-text("Facts")').click();

    // Wait for facts to load
    await expect(page.locator('.me-fact-item')).toHaveCount(3);

    // Find the fact we want to delete
    const factToDelete = page.locator('.me-fact-item', { hasText: 'Prefers TypeScript over JavaScript' });
    await expect(factToDelete).toBeVisible();

    // Hover to reveal the delete button and click it
    await factToDelete.hover();
    page.once('dialog', dialog => dialog.accept());
    await factToDelete.locator('.me-fact-action-delete').click();

    // Verify the fact is removed from the UI
    await expect(page.locator('.me-fact-item')).toHaveCount(2);
    await expect(page.locator('.me-fact-item', { hasText: 'Prefers TypeScript over JavaScript' })).toHaveCount(0);

    // Verify remaining facts are still visible
    await expect(page.locator('.me-fact-item', { hasText: 'Lives in Sri Lanka' })).toBeVisible();
    await expect(page.locator('.me-fact-item', { hasText: 'Building a knowledge app called Brain' })).toBeVisible();

    // Verify it's also deleted from the database
    const remainingFacts = getFactsFromDb(user.id);
    expect(remainingFacts.length).toBe(2);
    expect(remainingFacts.find(f => f.fact === 'Prefers TypeScript over JavaScript')).toBeUndefined();
  });
});

test.describe('Fact Editing', () => {
  test('should edit a fact text from the /me page', async ({ page }) => {
    const user = await setupPageWithUser(page);

    seedFacts(user.id, [
      { category: 'core', fact: 'Lives in Sri Lanka' },
      { category: 'technical', fact: 'Prefers TypeScript over JavaScript' },
    ]);

    await page.goto('/me');
    await page.locator('.me-tab:has-text("Facts")').click();
    await expect(page.locator('.me-fact-item')).toHaveCount(2);

    // Hover and click edit on the first fact (most recent first)
    const factToEdit = page.locator('.me-fact-item', { hasText: 'Lives in Sri Lanka' });
    await factToEdit.hover();
    await factToEdit.locator('.me-fact-action-edit').click();

    // After clicking edit, the text moves into an input so hasText no longer matches.
    // Find the input within the fact list instead.
    const input = page.locator('.me-fact-edit-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Lives in Sri Lanka');

    // Clear and type new text, then press Enter to save
    await input.fill('Lives in Japan');
    const patchResponse = page.waitForResponse(resp => resp.url().includes('/api/facts') && resp.request().method() === 'PATCH');
    await page.keyboard.press('Enter');
    await patchResponse;

    // Verify the UI updated
    await expect(page.locator('.me-fact-item', { hasText: 'Lives in Japan' })).toBeVisible();
    await expect(page.locator('.me-fact-item', { hasText: 'Lives in Sri Lanka' })).toHaveCount(0);

    // Verify it's saved in the database
    const facts = getFactsFromDb(user.id);
    expect(facts.find(f => f.fact === 'Lives in Japan')).toBeDefined();
    expect(facts.find(f => f.fact === 'Lives in Sri Lanka')).toBeUndefined();
  });

  test('should change a fact category from the /me page', async ({ page }) => {
    const user = await setupPageWithUser(page);

    seedFacts(user.id, [
      { category: 'core', fact: 'Enjoys hiking on weekends' },
    ]);

    await page.goto('/me');
    await page.locator('.me-tab:has-text("Facts")').click();
    await expect(page.locator('.me-fact-item')).toHaveCount(1);

    // Verify initial category badge
    const factItem = page.locator('.me-fact-item').first();
    await expect(factItem.locator('.me-fact-badge')).toHaveText('core');

    // Enter edit mode
    await factItem.hover();
    await factItem.locator('.me-fact-action-edit').click();

    // Change category via the select dropdown
    const select = page.locator('.me-fact-category-select');
    await expect(select).toBeVisible();
    await select.selectOption('transient');

    // Save with the check button
    const patchResponse = page.waitForResponse(resp => resp.url().includes('/api/facts') && resp.request().method() === 'PATCH');
    await page.locator('.me-fact-action-save').click();
    await patchResponse;

    // Verify the badge updated in UI
    const updatedItem = page.locator('.me-fact-item', { hasText: 'Enjoys hiking on weekends' });
    await expect(updatedItem.locator('.me-fact-badge')).toHaveText('transient');

    // Verify it's saved in the database
    const facts = getFactsFromDb(user.id);
    const updated = facts.find(f => f.fact === 'Enjoys hiking on weekends');
    expect(updated).toBeDefined();
    expect(updated!.category).toBe('transient');
  });
});

test.describe('Fact Extraction & Context Injection', () => {
  // Run serially — each test triggers a global fact-extraction job
  test.describe.configure({ mode: 'serial' });

  test('should extract facts from seeded conversations and verify via API', async ({ page, request }) => {
    // Fact extraction calls external AI API, needs more time
    test.setTimeout(120_000);

    // 1. Setup user with seeded conversations containing personal info
    const user = await setupPageWithUser(page);

    seedChatMessages(user.id, [
      {
        messages: [
          { role: 'user', content: 'I am a software developer from Sri Lanka. I mainly use TypeScript and Next.js for my projects.' },
          { role: 'assistant', content: 'That sounds great! TypeScript and Next.js are excellent choices for web development.' },
          { role: 'user', content: 'Yes, I also prefer SQLite over PostgreSQL for my personal projects because of its simplicity.' },
          { role: 'assistant', content: 'SQLite is indeed a great choice for personal projects - simple and efficient.' },
        ],
      },
      {
        messages: [
          { role: 'user', content: 'I am currently building a personal knowledge management app called Brain.' },
          { role: 'assistant', content: 'Building your own knowledge management app is a great way to learn and organize information.' },
        ],
      },
    ]);

    // 2. Trigger fact extraction via test API route
    const headers = { Cookie: `auth-token=${user.token}` };

    console.log('[TEST] Triggering fact extraction...');
    const extractResponse = await request.post('http://localhost:3001/api/facts/extract', { headers });
    const extractResult = await extractResponse.json();
    console.log('[TEST] Fact extraction result:', extractResult);

    expect(extractResponse.ok()).toBeTruthy();
    expect(extractResult.state).toBe('succeeded');

    // 3. Verify facts were created in the database
    const facts = getFactsFromDb(user.id);
    console.log('[TEST] Extracted facts:', facts);

    expect(facts.length).toBeGreaterThan(0);

    // Check that some expected facts were captured
    const allFactTexts = facts.map(f => f.fact.toLowerCase()).join(' ');
    expect(allFactTexts).toMatch(/sri lanka|typescript|next\.?js|sqlite|brain/i);

    // 4. Verify facts are returned from the API
    const factsResponse = await request.get('http://localhost:3001/api/facts', { headers });
    const factsData = await factsResponse.json();

    expect(factsResponse.ok()).toBeTruthy();
    expect(factsData.facts.length).toBeGreaterThan(0);

    // Verify extraction_count is present
    expect(factsData.facts[0]).toHaveProperty('extraction_count');

    // 5. Verify fact sheet was also generated
    const sheetResponse = await request.get('http://localhost:3001/api/fact-sheet', { headers });
    expect(sheetResponse.ok()).toBeTruthy();
    const sheetData = await sheetResponse.json();
    expect(sheetData).not.toBeNull();
    expect(sheetData.facts.length).toBeGreaterThan(0);
    console.log('[TEST] Fact sheet generated with', sheetData.fact_count, 'facts');
  });

  test('should extract facts when assistant replies are very long (truncation)', async ({ page, request }) => {
    test.setTimeout(120_000);

    const user = await setupPageWithUser(page);

    // Generate a 200+ word assistant reply to exercise the truncation code path
    const longAssistantReply = Array.from({ length: 40 }, (_, i) =>
      `Sentence number ${i + 1} with some extra words to pad the length.`
    ).join(' '); // ~400 words

    seedChatMessages(user.id, [
      {
        messages: [
          { role: 'user', content: 'I live in Tokyo and I program in Go for my backend services.' },
          { role: 'assistant', content: longAssistantReply },
        ],
      },
    ]);

    const headers = { Cookie: `auth-token=${user.token}` };

    const extractResponse = await request.post('http://localhost:3001/api/facts/extract', { headers });
    expect(extractResponse.ok()).toBeTruthy();

    const extractResult = await extractResponse.json();
    expect(extractResult.state).toBe('succeeded');

    const facts = getFactsFromDb(user.id);
    console.log('[TEST] Facts from long-reply test:', facts);

    expect(facts.length).toBeGreaterThan(0);
    const allFactTexts = facts.map(f => f.fact.toLowerCase()).join(' ');
    expect(allFactTexts).toMatch(/tokyo|go/i);
  });

  test('should inject extracted facts into chat context', async ({ page, request }) => {
    test.setTimeout(120_000);

    // 1. Setup user and seed conversations with distinctive facts
    const user = await setupPageWithUser(page);

    seedChatMessages(user.id, [
      {
        messages: [
          { role: 'user', content: 'My favorite programming language is Rust and I have a pet cat named Whiskers.' },
          { role: 'assistant', content: 'Nice! Rust is a great language. Whiskers sounds like a lovely cat.' },
        ],
      },
    ]);

    // 2. Trigger fact extraction
    const headers = { Cookie: `auth-token=${user.token}` };

    const extractResponse = await request.post('http://localhost:3001/api/facts/extract', { headers });
    expect(extractResponse.ok()).toBeTruthy();

    const extractResult = await extractResponse.json();
    expect(extractResult.state).toBe('succeeded');

    // Verify facts exist
    const facts = getFactsFromDb(user.id);
    console.log('[TEST] Facts for context test:', facts);
    expect(facts.length).toBeGreaterThan(0);

    // Verify fact sheet exists (chat worker needs it for context injection)
    const sheetResponse = await request.get('http://localhost:3001/api/fact-sheet', { headers });
    const sheetData = await sheetResponse.json();
    expect(sheetData).not.toBeNull();
    console.log('[TEST] Fact sheet for context test:', sheetData.facts.length, 'facts');

    // 3. Start a NEW chat and ask the AI about something from the facts
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const chatInput = page.locator('textarea[placeholder="Ask me anything..."]');
    await chatInput.waitFor({ state: 'visible', timeout: 30000 });

    // Ask a question that the AI should answer using injected facts
    await chatInput.fill('What do you know about my pet? Answer briefly.');
    await page.keyboard.press('Enter');

    // 4. Wait for the response
    await waitForChatCompletion(page);

    // 5. Check the AI response mentions the cat name from the facts
    const assistantMessages = page.locator('[class*="assistant"]');
    const responseText = await assistantMessages.last().textContent();
    console.log('[TEST] AI response:', responseText);

    expect(responseText?.toLowerCase()).toMatch(/whiskers|cat/);
  });
});
