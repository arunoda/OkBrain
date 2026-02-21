---
name: user_management
description: Creating and managing users in the Brain application.
---

# User Management

## Creating a User

Use the existing script to create a new user:

```bash
npx tsx scripts/create-user.ts <email> <password>
```

**Example:**
```bash
npx tsx scripts/create-user.ts hello@user.com password
```

The script will:
1. Check if a user with that email already exists
2. Hash the password with bcrypt
3. Generate a UUID for the user
4. Insert the user into the `users` table in SQLite

**File**: `scripts/create-user.ts`

## Key Files

- `scripts/create-user.ts` - User creation script
- `src/lib/db/db-users.ts` - Database operations (`createUser`, `getUserById`, `getUserByEmail`)
- `src/lib/auth.ts` - Auth utilities (`hashPassword`, `verifyPassword`, `createSession`, `getSession`)

## Database Schema

Users are stored in the `users` table with columns:
- `id` - UUID primary key
- `email` - Unique email address
- `password` - Bcrypt-hashed password
