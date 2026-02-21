---
name: E2E Testing with Playwright
description: Instructions and best practices for writing end-to-end tests for the Brain application using Playwright.
---

# E2E Testing with Playwright

This skill guides you through adding and maintaining E2E tests for the Brain application.

## Test Location
All E2E tests are located in the `e2e/` directory.
- `e2e/test-utils.ts`: Contains shared helpers (DB cleanup, auth, API waiting).
- Spec files should be named `*.spec.ts`.

## Core Principles

### 1. User-Centric Selectors
**DO NOT** use test-specific attributes like `data-testid` or `data-message-id`. This is a must.
*   **Good**: `page.locator('button:has-text("Verify")')`, `page.locator('.message.assistant')`
*   **Good**: `page.getByPlaceholder('Ask me anything...')`
*   **Avoid**: `page.locator('[data-message-id="..."]')`
*   **Reason**: We want to test what the user sees and interacts with. We don't feed any machine/test readable features for that.

### 2. UI Interaction & Waiting
*   **Text content**: Verify elements by their text content whenever possible.
    ```typescript
    await expect(page.locator('.model-tag')).toHaveText('Grok');
    ```
*   **Visiblity**: Always wait for visibility before assertions if the element appears asynchronously.
    ```typescript
    await expect(locator).toBeVisible({ timeout: 10000 });
    ```
*   **Stable Selectors**: It is acceptable to use stable CSS class names (e.g., `.sidebar`, `.message.assistant`, `.action-container`) or element IDs.

### 3. Database Access
Since Playwright runs in Node.js, you may verify state or setup data using direct database access. Do this only if you can't verify something from the UI. If there's a way to verify it from the UI, do that.
*   Use `better-sqlite3` to connect to `brain.test.db`.
*   **Example**: Modifying a message or checking if a record exists.
    ```typescript
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.join(process.cwd(), 'brain.test.db'));
    // perform queries...
    db.close();
    ```

## Writing a New Parallel-Ready Test

To ensure tests can run in parallel without interfering with each other, follow this pattern:

1.  **Cleanup (Once)**: Use `beforeAll` to run `cleanupTestDb` once for the entire worker/suite, rather than before every test.
2.  **Unique Users**: Use `setupPageWithUser(page)` inside each test to create a fresh user and isolated session.

```typescript
import { test, expect } from '@playwright/test';
import { loadTestEnv, cleanupTestDb, setupPageWithUser, waitForApiResponse } from './test-utils';

loadTestEnv();

// 1. Cleanup once per worker
test.beforeAll(async () => {
  cleanupTestDb();
});

test.describe('Feature Suite', () => {
  // 2. Enable parallel execution
  test.describe.configure({ mode: 'parallel' });

  test('should perform an isolated action', async ({ page }) => {
    // 3. Setup unique user and session for this test
    const user = await setupPageWithUser(page);

    await page.goto('/');
    
    // Interaction...
    const input = page.locator('textarea[placeholder="Ask me anything..."]');
    await input.fill('Hello');
    
    const responsePromise = waitForApiResponse(page, '/api/chat');
    await input.press('Enter');
    await responsePromise;

    // Assertions...
    await expect(page.locator('.message.assistant')).toBeVisible();
  });
});
```

## Core Utilities in `test-utils.ts`

- `loadTestEnv()`: Mandatory at the top of every spec to load `.env.test`.
- `cleanupTestDb()`: Clears all tables in the test database. Best run in `beforeAll`.
- `setupPageWithUser(page, options)`: Creates a new user in the DB and injects their auth cookie into the browser context. This is the preferred way to authenticate. **Always use this** — it seeds highlight data by default, which prevents the app from triggering background highlight generation that can interfere with tests.
    - `options.skipHighlights`: (optional, default `false`) If set to true, skips seeding fresh highlight data. Only use this if your test specifically needs to test highlight generation itself.
- `waitForApiResponse(page, urlPattern)`: Helper to wait for a specific network response before proceeding with UI assertions.
- `createUniqueUser()`: Creates a user and returns their ID, email, and token (useful for API-only testing).
- `seedFreshHighlights(userId)`: Manually seeds highlight data if you need specific control. Called automatically by `setupPageWithUser`.

## Example Pattern: API Interaction

If you need to setup data via API using the same user as the page:

```typescript
test('should verify API data in UI', async ({ page, request }) => {
  const user = await setupPageWithUser(page);

  // Use the user's token for direct API requests
  const response = await request.post('/api/docs', {
    data: { title: 'Pre-created Doc' },
    headers: { 'Cookie': `auth-token=${user.token}` }
  });
  const doc = await response.json();

  await page.goto(`/doc/${doc.id}`);
  await expect(page.locator('.document-title-input')).toHaveValue('Pre-created Doc');
});
```
