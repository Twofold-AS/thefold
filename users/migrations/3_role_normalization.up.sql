-- Fase E, Commit 27 — flat three-tier role system (user / admin / superadmin)
-- Migration 1 created role TEXT NOT NULL DEFAULT 'admin' and seeded two admins.
-- We tighten defaults, add a CHECK constraint, index non-user rows, and
-- designate the project owner as the first (and only) superadmin.

-- 1. Loosen then re-fix the default so new rows start as 'user'.
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';

-- 2. Normalize any legacy values outside the new union (defensive — current
--    seed only contains 'admin', but older hand-crafted rows may exist).
UPDATE users SET role = 'user'
WHERE role NOT IN ('user', 'admin', 'superadmin');

-- 3. Enforce the union with a CHECK constraint. `IF NOT EXISTS` isn't valid
--    for ADD CONSTRAINT, so drop-then-add to stay idempotent.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'admin', 'superadmin'));

-- 4. Partial index for fast "is this user privileged?" lookups.
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE role != 'user';

-- 5. Bootstrap: promote the project owner to superadmin. Idempotent.
UPDATE users SET role = 'superadmin' WHERE email = 'mikkis@twofold.no';
