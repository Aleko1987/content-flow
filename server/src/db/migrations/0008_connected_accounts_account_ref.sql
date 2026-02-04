-- connected_accounts: add missing account_ref column and provider index (safe additive)

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS account_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_connected_accounts_provider
ON connected_accounts (provider);

