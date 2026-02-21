# Brain

A personal knowledge and chat application built with Next.js.

## Skills

When working on specific topics, read the relevant skill documentation:

- **Getting Started**: [.agent/skills/getting_started/SKILL.md](.agent/skills/getting_started/SKILL.md) - Setting up and running the app locally
- **AI Providers**: [.agent/skills/ai_providers/SKILL.md](.agent/skills/ai_providers/SKILL.md) - Adding new AI models and providers
- **Job System**: [.agent/skills/job_system/SKILL.md](.agent/skills/job_system/SKILL.md) - Background job processing with streaming
- **E2E Testing**: [.agent/skills/e2e_testing/SKILL.md](.agent/skills/e2e_testing/SKILL.md) - Playwright testing patterns
- **Running E2E Tests**: [.agent/skills/running_e2e/SKILL.md](.agent/skills/running_e2e/SKILL.md) - Setting up and running E2E tests locally
- **Auth & Routing**: [.agent/skills/auth_routing/SKILL.md](.agent/skills/auth_routing/SKILL.md) - Authentication and routing with proxy.ts
- **Location Tracking**: [.agent/skills/location_tracking/SKILL.md](.agent/skills/location_tracking/SKILL.md) - Geolocation with smart caching for chat and highlights
- **Tools**: [.agent/skills/tools/SKILL.md](.agent/skills/tools/SKILL.md) - AI tool/function calling system and adding new tools
- **Fact Extraction**: [.agent/skills/fact_extraction/SKILL.md](.agent/skills/fact_extraction/SKILL.md) - Automatic fact extraction from conversations, storage, context injection, and periodic worker
- **Fact Sheet**: [.agent/skills/fact_sheet/SKILL.md](.agent/skills/fact_sheet/SKILL.md) - Scored fact sheet generation, scoring algorithm, assembly, and context injection
- **Recent Conversations**: [.agent/skills/recent_conversations/SKILL.md](.agent/skills/recent_conversations/SKILL.md) - Bridging the gap between conversations and fact extraction
- **Image Upload**: [.agent/skills/image_upload/SKILL.md](.agent/skills/image_upload/SKILL.md) - Local image upload with WebP conversion for docs
- **RAG Fact Search**: [.agent/skills/rag_fact_search/SKILL.md](.agent/skills/rag_fact_search/SKILL.md) - Semantic search over facts using Ollama embeddings and sqlite-vec
- **User Management**: [.agent/skills/user_management/SKILL.md](.agent/skills/user_management/SKILL.md) - Creating and managing users
- **Database**: [.agent/skills/database/SKILL.md](.agent/skills/database/SKILL.md) - SQLite database setup, schema, modules, and configuration
- **Deploy**: [.agent/skills/deploy/SKILL.md](.agent/skills/deploy/SKILL.md) - Deploying to a remote server
- **Mobile Install**: [.agent/skills/mobile_install/SKILL.md](.agent/skills/mobile_install/SKILL.md) - Installing the app on mobile as a PWA or iPhone shortcut

## Key Directories

- `src/app/` - Next.js App Router pages and API routes
- `src/lib/` - Core libraries (db, auth, jobs, AI providers)
- `src/components/` - React components
- `src/workers/` - Background job workers
- `e2e/` - End-to-end tests

## Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run test:e2e` - Run E2E tests
- `npm run test:e2e -- e2e/specific.spec.ts` - Run specific test file

## Database

Uses SQLite with `better-sqlite3` (local) / SQLite Cloud (production). See the [Database skill](.agent/skills/database/SKILL.md) for details.
