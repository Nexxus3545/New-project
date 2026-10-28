-- One private current evidence file per account. Uploads do not verify identity.
CREATE TABLE IF NOT EXISTS public.account_credentials (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('patient_id', 'professional_license')),
  document_type TEXT NOT NULL,
  document_label VARCHAR(100) NOT NULL,
  license_number VARCHAR(120),
  id_last4 VARCHAR(4),
  expires_at DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  document_bytes BYTEA NOT NULL CHECK (octet_length(document_bytes) BETWEEN 1 AND 2097152),
  file_name VARCHAR(100) NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_credentials_role_document_check CHECK (
    (kind = 'patient_id' AND license_number IS NULL AND document_type IN (
      'philhealth_id','national_id','passport','drivers_license','umid','sss_id','gsis_id','postal_id','voters_id','other_government_id'))
    OR (kind = 'professional_license' AND document_type = 'professional_license'
      AND NULLIF(BTRIM(license_number), '') IS NOT NULL AND expires_at IS NOT NULL AND id_last4 IS NULL)
  ),
  CONSTRAINT account_credentials_last4_check CHECK (id_last4 IS NULL OR id_last4 ~ '^[A-Za-z0-9]{4}$')
);
CREATE INDEX IF NOT EXISTS idx_account_credentials_review ON public.account_credentials(status, submitted_at);
ALTER TABLE public.account_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_credentials FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.account_credentials FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.account_credentials FROM authenticated;
  END IF;
END $$;
