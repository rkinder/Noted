-- Noted — PostgreSQL schema
-- All statements are idempotent (safe to re-run on startup)

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           TEXT        PRIMARY KEY,
  email        TEXT        NOT NULL UNIQUE,
  password_hash TEXT       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ─── Folders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS folders (
  id          TEXT        PRIMARY KEY,
  owner_id    TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  parent_id   TEXT        REFERENCES folders (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_owner_id  ON folders (owner_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders (parent_id);

-- ─── Notes (metadata only — content lives in S3/filesystem) ───────────────────
CREATE TABLE IF NOT EXISTS notes (
  id          TEXT        PRIMARY KEY,
  title       TEXT        NOT NULL DEFAULT 'Untitled Note',
  owner_id    TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  folder_id   TEXT        REFERENCES folders (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_owner_id  ON notes (owner_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes (folder_id);

-- ─── Note collaborators ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note_collaborators (
  note_id    TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write')),
  PRIMARY KEY (note_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_note_collaborators_user_id ON note_collaborators (user_id);
