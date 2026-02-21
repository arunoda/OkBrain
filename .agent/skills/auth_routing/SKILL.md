---
name: auth_routing
description: Guide to using src/proxy.ts for authentication and routing in Next.js.
---

# Next.js Proxy (`src/proxy.ts`)

This project uses `src/proxy.ts`, which is the standard replacement for `middleware.ts` in newer versions of Next.js. It handles request interception, routing boundaries, and authentication.

## Overview

The `proxy.ts` feature provides a more specialized way to handle network boundaries compared to the legacy generic middleware. It is the designated place for:
- Authentication verification
- Request redirects and rewrites
- Header modifications
- Public path exclusion

The `proxy.ts` file is responsible for intercepting requests and enforcing authentication rules before they reach the application logic.

**File Location**: `src/proxy.ts`

## Key Responsibilities

1.  **Public Path Exclusion**: Checks if the requested path is in the `publicPaths` array. If so, it allows the request to proceed without authentication.
2.  **Authentication Verification**: For non-public paths, it retrieves the `auth-token` cookie and verifies it using `jwtVerify`.
3.  **Redirects**:
    - If the request is for an API route (`/api/`) and is unauthorized, it returns a 401 JSON response.
    - For other unauthorized requests, it redirects the user to `/login`.

## Common Tasks

### Adding a Public Route

To make a new route public (accessible without login), add the path prefix to the `publicPaths` array in `src/proxy.ts`.

```typescript
// src/proxy.ts

const publicPaths = [
  "/login",
  "/api/auth/login",
  // ... other paths
  "/new-public-route/", // <--- Add your new public path here
  "/s/" // Shared links
];
```

### Modifying Authentication Logic

The authentication logic checks for the `auth-token` cookie. JWT verification matches the secret provided in `process.env.JWT_SECRET`.

## Configuration

The `config` export at the bottom of the file defines which paths trigger this proxy logic.

```typescript
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
```
