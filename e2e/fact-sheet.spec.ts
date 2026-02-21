import { test, expect } from '@playwright/test';
import { loadTestEnv, cleanupTestDb, setupPageWithUser } from './test-utils';
import * as path from 'path';

loadTestEnv();

test.beforeAll(() => {
  cleanupTestDb();
});

// Helper: seed facts directly in the database, returns array of IDs
function seedFacts(userId: string, facts: Array<{ category: string; fact: string }>): string[] {
  const Database = require('better-sqlite3');
  const { v4: uuidv4 } = require('uuid');
  const dbPath = path.resolve(process.env.TEST_DB_PATH || 'brain.test.db');
  const db = new Database(dbPath);

  const insert = db.prepare(`
    INSERT INTO facts (id, user_id, category, fact, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const ids: string[] = [];
  for (const f of facts) {
    const id = uuidv4();
    insert.run(id, userId, f.category, f.fact, new Date().toISOString());
    ids.push(id);
  }

  db.pragma('wal_checkpoint(FULL)');
  db.close();
  return ids;
}

// Helper: seed fact extractions with controlled timestamps
function seedFactExtractions(userId: string, extractions: Array<{ factId: string; hoursAgo: number }>) {
  const Database = require('better-sqlite3');
  const { v4: uuidv4 } = require('uuid');
  const dbPath = path.resolve(process.env.TEST_DB_PATH || 'brain.test.db');
  const db = new Database(dbPath);

  // Need a conversation for the FK constraint
  const convId = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO conversations (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(convId, userId, 'Extraction Test', now, now);

  const insert = db.prepare(`
    INSERT INTO fact_extractions (id, fact_id, conversation_id, created_at)
    VALUES (?, ?, ?, ?)
  `);

  for (const ext of extractions) {
    const createdAt = new Date(Date.now() - ext.hoursAgo * 60 * 60 * 1000).toISOString();
    insert.run(uuidv4(), ext.factId, convId, createdAt);
  }

  db.pragma('wal_checkpoint(FULL)');
  db.close();
}

// Helper: read fact sheet from DB
function getFactSheetFromDb(userId: string) {
  const Database = require('better-sqlite3');
  const dbPath = path.resolve(process.env.TEST_DB_PATH || 'brain.test.db');
  const db = new Database(dbPath);

  const sheet = db.prepare(
    'SELECT * FROM fact_sheets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(userId);

  db.close();
  return sheet as any;
}

// Helper: seed a fact_sheet directly
function seedFactSheet(userId: string, entries: Array<{ category: string; fact: string; score: number }>) {
  const Database = require('better-sqlite3');
  const { v4: uuidv4 } = require('uuid');
  const dbPath = path.resolve(process.env.TEST_DB_PATH || 'brain.test.db');
  const db = new Database(dbPath);

  db.prepare(`
    INSERT INTO fact_sheets (id, user_id, facts_json, dedup_log, fact_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, JSON.stringify(entries), null, entries.length, new Date().toISOString());

  db.pragma('wal_checkpoint(FULL)');
  db.close();
}

// Helper: seed chat messages
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

test.describe('Fact Sheet Scoring & Assembly', () => {
  test.describe.configure({ mode: 'serial' });

  test('should generate fact sheet with correct scoring based on extraction recency', async ({ page, request }) => {
    const user = await setupPageWithUser(page);
    const headers = { Cookie: `auth-token=${user.token}` };

    // Seed facts across categories
    const factIds = seedFacts(user.id, [
      { category: 'core', fact: 'Lives in Sri Lanka' },
      { category: 'core', fact: 'Has a family of four' },
      { category: 'technical', fact: 'Uses TypeScript' },
      { category: 'technical', fact: 'Prefers SQLite' },
      { category: 'project', fact: 'Building Brain app' },
      { category: 'transient', fact: 'Looking at ThinkPad X1' },
    ]);

    // Seed extractions at different ages:
    // Core fact 0: mentioned 3 times very recently → highest core score
    // Core fact 1: mentioned once, very old → low core score
    // Tech fact 0: mentioned twice today → high tech score
    // Tech fact 1: mentioned once, old → low tech score
    // Project fact: mentioned once recently
    // Transient fact: mentioned once today
    seedFactExtractions(user.id, [
      { factId: factIds[0], hoursAgo: 0.5 },  // 10 points
      { factId: factIds[0], hoursAgo: 2 },     // 8 points
      { factId: factIds[0], hoursAgo: 5 },     // 8 points
      { factId: factIds[1], hoursAgo: 500 },   // 0.5 points
      { factId: factIds[2], hoursAgo: 0.5 },   // 10 points
      { factId: factIds[2], hoursAgo: 3 },     // 8 points
      { factId: factIds[3], hoursAgo: 200 },   // 0.5 points
      { factId: factIds[4], hoursAgo: 1 },     // 8 points (edge: exactly 1 hour → 8)
      { factId: factIds[5], hoursAgo: 12 },    // 6 points
    ]);

    // Trigger fact sheet generation via test endpoint
    const res = await request.post('http://localhost:3001/api/fact-sheet/generate', { headers });
    expect(res.ok()).toBeTruthy();

    // Verify via API
    const sheetRes = await request.get('http://localhost:3001/api/fact-sheet', { headers });
    expect(sheetRes.ok()).toBeTruthy();

    const data = await sheetRes.json();
    expect(data).not.toBeNull();
    expect(data.facts.length).toBe(6);
    expect(data.fact_count).toBe(6);

    // Verify scoring order within core: "Lives in Sri Lanka" (3 recent extractions) > "Has a family of four" (1 old)
    const coreFacts = data.facts.filter((f: any) => f.category === 'core');
    expect(coreFacts.length).toBe(2);
    expect(coreFacts[0].fact).toBe('Lives in Sri Lanka');
    expect(coreFacts[0].score).toBeGreaterThan(coreFacts[1].score);

    // Verify scoring order within technical: "Uses TypeScript" > "Prefers SQLite"
    const techFacts = data.facts.filter((f: any) => f.category === 'technical');
    expect(techFacts.length).toBe(2);
    expect(techFacts[0].fact).toBe('Uses TypeScript');
    expect(techFacts[0].score).toBeGreaterThan(techFacts[1].score);

    // Verify category ordering: core → technical → project → transient
    const categories = data.facts.map((f: any) => f.category);
    const firstCore = categories.indexOf('core');
    const firstTech = categories.indexOf('technical');
    const firstProject = categories.indexOf('project');
    const firstTransient = categories.indexOf('transient');
    expect(firstCore).toBeLessThan(firstTech);
    expect(firstTech).toBeLessThan(firstProject);
    expect(firstProject).toBeLessThan(firstTransient);

    // All scores should be > 0 since all facts have extractions
    for (const fact of data.facts) {
      expect(fact.score).toBeGreaterThan(0);
    }

    console.log('[TEST] Fact sheet scores:', data.facts.map((f: any) => `${f.category}: "${f.fact}" = ${f.score}`));
  });

  test('should respect category max limits', async ({ page, request }) => {
    const user = await setupPageWithUser(page);
    const headers = { Cookie: `auth-token=${user.token}` };

    // Seed 35 core facts (max is 30)
    const facts = Array.from({ length: 35 }, (_, i) => ({
      category: 'core',
      fact: `Core fact number ${i + 1}`,
    }));
    const factIds = seedFacts(user.id, facts);

    // Give all of them recent extractions
    seedFactExtractions(user.id, factIds.map((id, i) => ({
      factId: id,
      hoursAgo: i * 0.5, // spread across recent times
    })));

    const res = await request.post('http://localhost:3001/api/fact-sheet/generate', { headers });
    expect(res.ok()).toBeTruthy();

    const sheetRes = await request.get('http://localhost:3001/api/fact-sheet', { headers });
    const data = await sheetRes.json();

    // Max 30 core facts should be included
    const coreCount = data.facts.filter((f: any) => f.category === 'core').length;
    expect(coreCount).toBeLessThanOrEqual(30);
    console.log(`[TEST] Core facts in sheet: ${coreCount} (max 30, had 35)`);
  });

  test('should save fact sheet to DB with correct structure', async ({ page, request }) => {
    const user = await setupPageWithUser(page);
    const headers = { Cookie: `auth-token=${user.token}` };

    const factIds = seedFacts(user.id, [
      { category: 'core', fact: 'Test core fact' },
      { category: 'transient', fact: 'Test transient fact' },
    ]);

    seedFactExtractions(user.id, [
      { factId: factIds[0], hoursAgo: 0.5 },
      { factId: factIds[1], hoursAgo: 2 },
    ]);

    await request.post('http://localhost:3001/api/fact-sheet/generate', { headers });

    // Verify directly in DB
    const sheet = getFactSheetFromDb(user.id);
    expect(sheet).not.toBeNull();
    expect(sheet.user_id).toBe(user.id);
    expect(sheet.fact_count).toBe(2);

    const entries = JSON.parse(sheet.facts_json);
    expect(entries.length).toBe(2);
    expect(entries[0]).toHaveProperty('category');
    expect(entries[0]).toHaveProperty('fact');
    expect(entries[0]).toHaveProperty('score');
  });
});

test.describe('Fact Sheet via Extraction Pipeline', () => {
  test.describe.configure({ mode: 'serial' });

  test('should generate fact sheet after fact extraction', async ({ page, request }) => {
    test.setTimeout(120_000);

    const user = await setupPageWithUser(page);
    const headers = { Cookie: `auth-token=${user.token}` };

    // Seed conversations with personal info
    seedChatMessages(user.id, [
      {
        messages: [
          { role: 'user', content: 'I live in Tokyo and work as a data scientist. I use Python and PyTorch daily.' },
          { role: 'assistant', content: 'Sounds great! Python and PyTorch are excellent for data science work.' },
        ],
      },
    ]);

    // Trigger extraction (which now also generates fact sheet)
    console.log('[TEST] Triggering fact extraction...');
    const extractRes = await request.post('http://localhost:3001/api/facts/extract', { headers });
    expect(extractRes.ok()).toBeTruthy();
    const extractResult = await extractRes.json();
    console.log('[TEST] Extraction result:', extractResult);
    expect(extractResult.state).toBe('succeeded');

    // Verify fact sheet was generated
    const sheetRes = await request.get('http://localhost:3001/api/fact-sheet', { headers });
    expect(sheetRes.ok()).toBeTruthy();

    const data = await sheetRes.json();
    expect(data).not.toBeNull();
    expect(data.facts.length).toBeGreaterThan(0);
    expect(data.fact_count).toBeGreaterThan(0);
    expect(data.created_at).toBeTruthy();

    // All facts should have scores > 0 (just extracted = very recent)
    for (const fact of data.facts) {
      expect(fact.score).toBeGreaterThan(0);
    }

    console.log('[TEST] Fact sheet after extraction:', data.facts);
  });
});

test.describe('Fact Sheet UI', () => {
  test('should show empty state when no fact sheet exists', async ({ page }) => {
    await setupPageWithUser(page);

    await page.goto('/me');
    await page.locator('.me-tab:has-text("Fact Sheet")').click();

    await expect(page.locator('.me-empty-state')).toContainText('No fact sheet generated yet');
  });

  test('should display fact sheet with scores and categories', async ({ page }) => {
    const user = await setupPageWithUser(page);

    // Seed a fact sheet directly
    seedFactSheet(user.id, [
      { category: 'core', fact: 'Lives in Tokyo', score: 100 },
      { category: 'core', fact: 'Has two kids', score: 50 },
      { category: 'technical', fact: 'Uses Rust', score: 48 },
      { category: 'project', fact: 'Building a robot', score: 32 },
      { category: 'transient', fact: 'Shopping for a laptop', score: 12 },
    ]);

    await page.goto('/me');
    await page.locator('.me-tab:has-text("Fact Sheet")').click();

    // Verify all facts display
    await expect(page.locator('.me-fact-item')).toHaveCount(5);

    // Verify category badges
    await expect(page.locator('.me-fact-badge-core')).toHaveCount(2);
    await expect(page.locator('.me-fact-badge-technical')).toHaveCount(1);
    await expect(page.locator('.me-fact-badge-project')).toHaveCount(1);
    await expect(page.locator('.me-fact-badge-transient')).toHaveCount(1);

    // Verify scores are shown
    await expect(page.locator('.me-fact-score')).toHaveCount(5);
    await expect(page.locator('.me-fact-score').first()).toContainText('100');

    // Verify meta info
    await expect(page.locator('.me-fact-sheet-meta')).toContainText('5 facts');
    await expect(page.locator('.me-fact-sheet-meta')).toContainText('Generated');

    // Verify fact text is visible
    await expect(page.locator('.me-fact-text', { hasText: 'Lives in Tokyo' })).toBeVisible();
    await expect(page.locator('.me-fact-text', { hasText: 'Shopping for a laptop' })).toBeVisible();
  });
});
