ALTER TABLE oauth_login_codes ADD COLUMN IF NOT EXISTS provider VARCHAR(24);
ALTER TABLE oauth_login_codes ADD COLUMN IF NOT EXISTS verified_email VARCHAR(255);
ALTER TABLE oauth_login_codes ADD COLUMN IF NOT EXISTS email_otp_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE oauth_login_codes ADD COLUMN IF NOT EXISTS email_otp_hash TEXT;
ALTER TABLE oauth_login_codes ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMPTZ;
ALTER TABLE oauth_login_codes ADD COLUMN IF NOT EXISTS email_otp_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE oauth_login_codes ADD COLUMN IF NOT EXISTS email_otp_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS notification_email_events (
  id UUID PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  recipient VARCHAR(255),
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  delivery_status VARCHAR(24) NOT NULL CHECK (delivery_status IN ('pending','sending','accepted','failed','unconfigured','no_verified_recipient')),
  error_code VARCHAR(40),
  attempted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_email_events_notification ON notification_email_events(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_email_events_user ON notification_email_events(user_id);
ALTER TABLE notification_email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notification_email_events FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON notification_email_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON notification_email_events FROM authenticated;
  END IF;
END $$;
