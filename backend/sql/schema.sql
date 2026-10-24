CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app_users(id),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    storage_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS document_permissions (
    document_id UUID NOT NULL REFERENCES documents(id),
    user_id UUID NOT NULL REFERENCES app_users(id),
    permission TEXT NOT NULL CHECK (permission IN ('read', 'edit')),
    granted_by UUID NOT NULL REFERENCES app_users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id UUID REFERENCES app_users(id),
    action TEXT NOT NULL,
    document_id UUID,
    target_user_id UUID,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    previous_hash TEXT,
    event_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_owner
    ON documents(owner_id);

CREATE INDEX IF NOT EXISTS idx_documents_category
    ON documents(category);

CREATE INDEX IF NOT EXISTS idx_documents_created
    ON documents(created_at);

CREATE INDEX IF NOT EXISTS idx_permissions_user
    ON document_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_occurred
    ON audit_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_document
    ON audit_events(document_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
ON audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id
ON audit_events (actor_id);
    