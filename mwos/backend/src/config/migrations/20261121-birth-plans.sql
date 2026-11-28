-- Structured birth-plan preferences for the MWOS clinical workflow.
-- Preferences are documented for clinician review; they are not clinical orders.
CREATE TABLE IF NOT EXISTS birth_plans (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 patient_id UUID NOT NULL REFERENCES patients(id),
 pregnancy_id UUID NOT NULL REFERENCES pregnancies(id),
 planning_status VARCHAR(20) NOT NULL DEFAULT 'draft'
  CHECK (planning_status IN ('draft','submitted','reviewed','active','completed','archived')),
 preferred_birth_place VARCHAR(40) NOT NULL DEFAULT 'clinic'
  CHECK (preferred_birth_place IN ('clinic','hospital','undecided','other')),
 support_person_name VARCHAR(200),
 support_person_contact VARCHAR(80),
 transport_plan TEXT,
 emergency_contact_confirmed BOOLEAN NOT NULL DEFAULT false,
 comfort_preferences TEXT,
 newborn_care_preferences TEXT,
 questions_for_clinic TEXT,
 clinician_review TEXT,
 reviewed_by UUID REFERENCES users(id),
 reviewed_at TIMESTAMPTZ,
 created_by UUID REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(pregnancy_id)
);
CREATE INDEX IF NOT EXISTS birth_plans_patient_idx ON birth_plans(patient_id, updated_at DESC);
ALTER TABLE public.birth_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.birth_plans FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE public.birth_plans FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE public.birth_plans FROM authenticated; END IF;
END $$;
