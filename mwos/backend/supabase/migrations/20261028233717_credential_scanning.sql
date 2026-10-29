ALTER TABLE public.account_credentials
  ADD COLUMN IF NOT EXISTS document_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'not_scanned',
  ADD COLUMN IF NOT EXISTS scan_revision INTEGER,
  ADD COLUMN IF NOT EXISTS scan_token UUID,
  ADD COLUMN IF NOT EXISTS scan_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scan_result JSONB,
  ADD COLUMN IF NOT EXISTS verification_method TEXT,
  ADD COLUMN IF NOT EXISTS verification_confirmed_at TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.account_credentials'::regclass AND conname='account_credentials_scan_status_check') THEN
    ALTER TABLE public.account_credentials ADD CONSTRAINT account_credentials_scan_status_check
      CHECK (scan_status IN ('not_scanned','processing','completed','unreadable','unavailable','failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.account_credentials'::regclass AND conname='account_credentials_verification_method_check') THEN
    ALTER TABLE public.account_credentials ADD CONSTRAINT account_credentials_verification_method_check
      CHECK (verification_method IS NULL OR verification_method IN ('issuer_check','in_person_original'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_account_credentials_document_hash ON public.account_credentials(document_sha256)
  WHERE document_sha256 IS NOT NULL;

-- A different legal name/birth date requires a new comparison and review.
-- Incrementing revision also invalidates an in-flight OCR/review receipt.
CREATE OR REPLACE FUNCTION public.reset_credential_identity_context() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE target_user_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF NEW.first_name IS NOT DISTINCT FROM OLD.first_name AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
      AND NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW; END IF;
    target_user_id := NEW.id;
  ELSE
    IF NEW.first_name IS NOT DISTINCT FROM OLD.first_name AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
      AND NEW.date_of_birth IS NOT DISTINCT FROM OLD.date_of_birth THEN RETURN NEW; END IF;
    target_user_id := NEW.user_id;
  END IF;
  UPDATE public.account_credentials SET status='pending', revision=revision+1,
    reviewed_at=NULL, reviewed_by=NULL, review_notes=NULL,
    verification_method=NULL, verification_confirmed_at=NULL,
    scan_status='not_scanned', scan_revision=NULL, scan_token=NULL, scan_started_at=NULL,
    scanned_at=NULL, scan_result=NULL, updated_at=NOW() WHERE user_id=target_user_id;
  IF FOUND THEN
    UPDATE public.staff_registry SET license_status='pending', verified_at=NULL, verified_by=NULL, updated_at=NOW()
      WHERE user_id=target_user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reset_user_credential_context ON public.users;
CREATE TRIGGER reset_user_credential_context AFTER UPDATE OF first_name,last_name,role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.reset_credential_identity_context();
DROP TRIGGER IF EXISTS reset_patient_credential_context ON public.patients;
CREATE TRIGGER reset_patient_credential_context AFTER UPDATE OF first_name,last_name,date_of_birth ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.reset_credential_identity_context();
