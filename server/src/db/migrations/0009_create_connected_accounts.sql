-- connected_accounts: ensure table exists with expected columns (idempotent)

CREATE TABLE IF NOT EXISTS connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'connected', -- connected|revoked|error
  account_ref TEXT,
  token_ciphertext TEXT NOT NULL,
  token_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connected_accounts_provider
ON connected_accounts (provider);

