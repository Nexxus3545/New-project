-- Preserve existing requests and confirmed bookings. Patient preferences do not
-- reserve a slot; only scheduled/active sessions participate in overlap checks.
ALTER TABLE public.tele_consult_sessions
  ADD COLUMN IF NOT EXISTS preferred_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 30;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tele_consult_sessions'::regclass
      AND conname = 'tele_consult_sessions_duration_minutes_check'
  ) THEN
    ALTER TABLE public.tele_consult_sessions
      ADD CONSTRAINT tele_consult_sessions_duration_minutes_check
      CHECK (duration_minutes IN (15, 30, 45, 60)) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.tele_consult_sessions
  VALIDATE CONSTRAINT tele_consult_sessions_duration_minutes_check;

CREATE INDEX IF NOT EXISTS idx_teleconsult_clinician_booking
  ON public.tele_consult_sessions (clinician_id, start_at)
  WHERE status IN ('scheduled', 'active');
CREATE INDEX IF NOT EXISTS idx_teleconsult_patient_booking
  ON public.tele_consult_sessions (patient_id, start_at)
  WHERE status IN ('scheduled', 'active');
CREATE INDEX IF NOT EXISTS idx_teleconsult_pending_review
  ON public.tele_consult_sessions (preferred_start_at, created_at)
  WHERE status = 'requested';
