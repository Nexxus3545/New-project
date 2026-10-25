ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_revoked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS account_security_requests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  purpose VARCHAR(30) NOT NULL CHECK (purpose IN ('deactivate','delete','reactivate','sign_in_confirm','secure_account')),
  resource_id UUID,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS account_security_requests_owner_idx ON account_security_requests(user_id, created_at DESC);
ALTER TABLE account_security_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security_requests FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON account_security_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON account_security_requests FROM authenticated;
  END IF;
END $$;
