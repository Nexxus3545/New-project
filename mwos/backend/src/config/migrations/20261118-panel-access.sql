ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_super_admin_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_super_admin_role_check CHECK (NOT is_super_admin OR role='admin');
  END IF;
END $$;
-- Preserve the clinic owner's existing account; never create a public default password.
UPDATE users SET is_super_admin=TRUE
WHERE lower(email)='admin@tmccopino.com' AND role='admin' AND is_active=TRUE
AND NOT EXISTS (SELECT 1 FROM users WHERE is_super_admin=TRUE);
