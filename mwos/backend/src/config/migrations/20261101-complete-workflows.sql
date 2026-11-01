-- Additive workflow storage. Existing clinic data is preserved.
ALTER TABLE education_content ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS labor_started_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS birth_recorded BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE labor_progress ALTER COLUMN cervical_dilation TYPE NUMERIC(4,1);
ALTER TABLE labor_progress ADD COLUMN IF NOT EXISTS assessment TEXT;
ALTER TABLE labor_progress ADD COLUMN IF NOT EXISTS care_plan TEXT;
CREATE TABLE IF NOT EXISTS newborn_records (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), patient_id UUID NOT NULL REFERENCES patients(id),
 delivery_id UUID NOT NULL REFERENCES deliveries(id), baby_name VARCHAR(200) NOT NULL,
 birth_order INTEGER NOT NULL DEFAULT 1 CHECK (birth_order > 0), date_of_birth DATE NOT NULL,
 sex VARCHAR(20), birth_weight_kg NUMERIC(5,3), notes TEXT,
 created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(delivery_id, birth_order)
);
CREATE INDEX IF NOT EXISTS newborn_patient_idx ON newborn_records(patient_id);
CREATE TABLE IF NOT EXISTS pediatric_visits (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), patient_id UUID NOT NULL REFERENCES patients(id),
 newborn_id UUID NOT NULL REFERENCES newborn_records(id), visit_date DATE NOT NULL,
 weight_kg NUMERIC(6,3), length_cm NUMERIC(5,2), head_circumference_cm NUMERIC(5,2),
 temperature NUMERIC(4,2), feeding TEXT, development TEXT, assessment TEXT, care_plan TEXT,
 follow_up_date DATE, recorded_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pediatric_newborn_date_idx ON pediatric_visits(newborn_id, visit_date DESC);
CREATE TABLE IF NOT EXISTS billing_payments (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), bill_id UUID NOT NULL REFERENCES billing(id),
 amount NUMERIC(10,2) NOT NULL CHECK (amount > 0), payment_method VARCHAR(50) NOT NULL,
 reference VARCHAR(150), notes TEXT, request_id UUID NOT NULL UNIQUE,
 recorded_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_payments_bill_idx ON billing_payments(bill_id);
ALTER TABLE billing ADD COLUMN IF NOT EXISTS opening_paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
-- Historical paid records already represent a fully settled bill. Partial legacy
-- payments have no amount evidence and need reconciliation rather than invention.
UPDATE billing SET opening_paid_amount=total_amount WHERE payment_status='paid' AND opening_paid_amount=0 AND NOT EXISTS (SELECT 1 FROM billing_payments p WHERE p.bill_id=billing.id);
ALTER TABLE billing ADD COLUMN IF NOT EXISTS needs_reconciliation BOOLEAN NOT NULL DEFAULT false;
UPDATE billing SET needs_reconciliation=true WHERE payment_status='partial' AND opening_paid_amount=0 AND NOT EXISTS (SELECT 1 FROM billing_payments p WHERE p.bill_id=billing.id);
CREATE TABLE IF NOT EXISTS clinic_referrals (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), patient_id UUID NOT NULL REFERENCES patients(id),
 destination VARCHAR(250) NOT NULL, reason TEXT NOT NULL, clinical_summary TEXT,
 receiving_contact VARCHAR(200), status VARCHAR(30) NOT NULL DEFAULT 'requested'
 CHECK(status IN ('requested','accepted','in_transit','handed_over','closed','cancelled')),
 created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS referral_events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), referral_id UUID NOT NULL REFERENCES clinic_referrals(id),
 status VARCHAR(30) NOT NULL, note TEXT NOT NULL, recorded_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS referral_patient_idx ON clinic_referrals(patient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS referral_event_idx ON referral_events(referral_id,created_at);
CREATE TABLE IF NOT EXISTS pharmacy_pickups (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), patient_id UUID NOT NULL REFERENCES patients(id),
 items JSONB NOT NULL, notes TEXT, status VARCHAR(20) NOT NULL DEFAULT 'requested'
 CHECK(status IN ('requested','ready','dispensed','cancelled')), review_note TEXT,
 request_id UUID NOT NULL UNIQUE, reviewed_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pickup_patient_idx ON pharmacy_pickups(patient_id,created_at DESC);
CREATE TABLE IF NOT EXISTS appointment_reminders (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), appointment_id UUID NOT NULL REFERENCES appointments(id),
 schedule_key TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT, delivered_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(appointment_id,schedule_key)
);

ALTER TABLE ultrasounds ADD COLUMN IF NOT EXISTS notes TEXT;
-- Only the trusted backend database role should access these clinical tables.
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['newborn_records','pediatric_visits','billing_payments','clinic_referrals','referral_events','pharmacy_pickups','appointment_reminders'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',table_name);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',table_name); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated',table_name); END IF;
 END LOOP;
END $$;

ALTER TABLE lab_results DROP CONSTRAINT IF EXISTS lab_results_status_check;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_status_check CHECK(status IN ('normal','abnormal','critical','pending'));
