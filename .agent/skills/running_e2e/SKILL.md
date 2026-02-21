---
name: Running E2E Tests
description: How to set up and run E2E tests locally using Playwright.
---

# Running E2E Tests

This skill covers setting up your environment and running the Playwright E2E test suite.

## Prerequisites

Make sure dependencies are installed:

```bash
npm install
```

Playwright browsers must also be installed:

```bash
npx playwright install
```

## Environment Setup

Create a `.env.test` file in the project root with the following keys:

```bash
# Required
GOOGLE_API_KEY=<your-google-api-key>
XAI_API_KEY=<your-xai-api-key>
BRAVE_API_KEY=<your-brave-api-key>
TEST_DB_PATH=brain.test.db
TEST_MODE=true
```

### Getting the API Keys

| Key | Where to get it |
|-----|-----------------|
| `GOOGLE_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `XAI_API_KEY` | [xAI Console](https://console.x.ai/) |
| `BRAVE_API_KEY` | [Brave Search API](https://brave.com/search/api/) |

All three API keys are required. Some tests exercise xAI (Grok) models and Brave-powered tools (web search, news search, image search), so they will fail without these keys.

## Running Tests

### Run all tests

```bash
npm run test:e2e
```

### Run a specific test file

```bash
npm run test:e2e -- e2e/chat.spec.ts
```

### Run tests in headed mode (see the browser)

```bash
npm run test:e2e:headed
```

### Run tests with Playwright UI

```bash
npm run test:e2e:ui
```

## How It Works

- Playwright starts a test dev server on port **3001** automatically (`npm run dev:test -- -p 3001`).
- Tests use a separate **`brain.test.db`** SQLite database so your production data is never touched.
- Tests run in parallel with **5 workers**. Each test creates its own isolated user via `setupPageWithUser(page)`.
- The `.env.test` file is loaded by both `playwright.config.ts` and `test-utils.ts` at the start of each run.

## Troubleshooting

- **Tests fail with missing model errors**: Make sure `XAI_API_KEY` is set in `.env.test`. The xAI tests require a valid key.
- **Search/image tool tests fail**: Make sure `BRAVE_API_KEY` is set in `.env.test`.
- **Port 3001 already in use**: Kill any existing dev server on that port, or let Playwright reuse it (it does this by default outside of CI).
- **Browser not found**: Run `npx playwright install` to download the required browsers.
