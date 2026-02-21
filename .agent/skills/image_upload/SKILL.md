---
name: Image Upload
description: Local image upload with optimization for docs (TipTap editor). Separate from the chat file upload system (AI provider FILE APIs).
---

# Image Upload

Local image upload system for the document editor. Images are converted to WebP via `sharp` and served by Next.js. This is independent of the chat file upload system which uses AI provider FILE APIs.

## Architecture

```
src/lib/data-dir.ts                    # Path helpers (UPLOAD_DATA_DIR)
src/app/api/upload/route.ts            # POST - upload & convert to WebP
src/app/api/ai/upload/route.ts         # POST - AI provider FILE API uploads (chat)
src/app/uploads/[filename]/route.ts    # GET  - serve uploaded files
src/app/components/TiptapEditor.tsx    # Editor integration (slash menu, drag/drop, paste)
```

## How It Works

### Upload Flow

1. User triggers upload via slash menu "Image", drag-and-drop, or paste
2. Client sends `POST /api/upload` with `multipart/form-data` (field: `file`)
3. Server validates: auth, file type (JPEG/PNG/GIF/WebP/HEIC/HEIF), max 10MB
4. `sharp` converts to WebP (quality 80), saves as `{uuid}.webp` in `UPLOAD_DATA_DIR/uploads/`
5. Returns `{ url, filename, originalName, mimeType, size }`
6. Client inserts `<img src="/uploads/{uuid}.webp">` into the TipTap editor

### File Serving

`GET /uploads/{filename}` serves files from `UPLOAD_DATA_DIR/uploads/` with:
- Path traversal protection (rejects `..`, `/`, `\` in filename)
- Content-Type detection from extension
- `Cache-Control: public, max-age=31536000, immutable` (UUID filenames never change)

### Data Directory

Controlled by `UPLOAD_DATA_DIR` env var (default: `./data`). The `data/` and `data-test/` directories are gitignored.

```typescript
import { getUploadPath, getFileUrl } from '@/lib/data-dir';

getUploadPath('abc.webp')  // → './data/uploads/abc.webp'
getFileUrl('abc.webp')     // → '/uploads/abc.webp'
```

Auto-creates the `uploads/` subdirectory on first use.

### Production Deployment

In production, the upload directory lives **outside** the app directory at `/var/www/brain-data/` to survive `git reset --hard` during deploys. The env var is exported in `scripts/deploy/deploy.sh` and the directory is created by `scripts/deploy/remote-setup.sh`:

- App: `/var/www/brain`
- Uploads: `/var/www/brain-data/uploads/`
- Env: `UPLOAD_DATA_DIR=/var/www/brain-data` (set in `deploy.sh`, not `.env.local`)

## TipTap Integration

### Slash Menu

The "Image" item in `slashMenuItems` triggers a hidden `<input type="file">` via `imageInputRef`. On file select, `uploadImage()` POSTs to `/api/upload` and `editor.chain().focus().setImage({ src: url }).run()` inserts the image.

### Drag-and-Drop / Paste

The `ImageDropPaste` ProseMirror plugin extension handles:
- **Drop**: Intercepts image file drops, uploads, inserts at drop position
- **Paste**: Intercepts clipboard image pastes, uploads, inserts at cursor

Both use the same `uploadImage()` helper function defined at module level in TiptapEditor.tsx.

### Image Extension

Uses `@tiptap/extension-image` configured with `class: 'uploaded-image'` for styling. Images get `max-width: 100%`, border-radius, and a cyan outline when selected.

## Two Upload Systems

| Aspect | Local Upload (`/api/upload`) | AI Upload (`/api/ai/upload`) |
|--------|------------------------------|------------------------------|
| Used by | Document editor (TipTap) | Chat file attachments |
| Storage | Local disk (`UPLOAD_DATA_DIR/uploads/`) | AI provider FILE APIs (Gemini, etc.) |
| Converts to | WebP via sharp | Passes through to provider |
| File types | Images only (JPEG, PNG, GIF, WebP, HEIC, HEIF) | Images + PDFs |
| Serving | `/uploads/{filename}` route | Provider URI |
| Reference in | ChatLayout.tsx (`/api/ai/upload`) | TiptapEditor.tsx (`/api/upload`) |

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/data-dir.ts` | `getUploadPath()`, `getFileUrl()` helpers |
| `src/app/api/upload/route.ts` | Image upload endpoint (validates, converts, saves) |
| `src/app/uploads/[filename]/route.ts` | File serving with caching |
| `src/app/api/ai/upload/route.ts` | AI provider file upload (chat attachments) |
| `src/app/components/TiptapEditor.tsx` | `uploadImage()`, `ImageDropPaste` plugin, slash menu |
| `src/app/components/TiptapEditor.module.css` | `.uploaded-image` styles |
| `e2e/image-upload.spec.ts` | E2E tests (API + UI) |

## E2E Tests

Tests use `sharp` to generate valid test PNGs programmatically (no fixture files needed):

```typescript
import sharp from 'sharp';

async function createTestPNG(): Promise<Buffer> {
  return sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();
}
```

### API tests
- Upload returns WebP URL
- Rejects oversized files, non-image files, unauthenticated requests
- Serves uploaded file with correct headers
- Returns 404 for non-existent files

### UI tests
- Slash menu image upload inserts `<img>` with WebP src
- Uploaded image persists after page reload
