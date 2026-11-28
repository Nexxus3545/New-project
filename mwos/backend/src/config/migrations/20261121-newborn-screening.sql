-- Structured newborn screening and hearing follow-up records.
-- This table documents clinic entries only; it does not infer or certify clinical results.
CREATE TABLE IF NOT EXISTS newborn_screenings (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 patient_id UUID NOT NULL REFERENCES patients(id),
 newborn_id UUID NOT NULL REFERENCES newborn_records(id),
 screened_on DATE NOT NULL,
 newborn_screening_status VARCHAR(30) NOT NULL DEFAULT 'pending'
  CHECK (newborn_screening_status IN ('pending','collected','documented','follow_up_needed','referred')),
 hearing_screen_status VARCHAR(30) NOT NULL DEFAULT 'pending'
  CHECK (hearing_screen_status IN ('pending','documented','follow_up_needed','referred')),
 follow_up_date DATE,
 notes TEXT,
 recorded_by UUID REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS newborn_screenings_newborn_idx ON newborn_screenings(newborn_id, screened_on DESC);
ALTER TABLE public.newborn_screenings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.newborn_screenings FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE public.newborn_screenings FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE public.newborn_screenings FROM authenticated; END IF;
END $$;
