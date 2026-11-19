-- Additive panel scheduling workflow; existing appointments and bills stay intact.
CREATE TABLE IF NOT EXISTS provider_availability (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), provider_id UUID NOT NULL REFERENCES users(id),
 service_date DATE NOT NULL, starts_at TIME NOT NULL, ends_at TIME NOT NULL,
 slot_minutes INTEGER NOT NULL DEFAULT 30 CHECK(slot_minutes IN(15,30,45,60)),
 max_appointments INTEGER NOT NULL CHECK(max_appointments BETWEEN 1 AND 100),
 consultation_mode TEXT NOT NULL CHECK(consultation_mode IN('online','in_person')),
 fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(fee>=0),
 status TEXT NOT NULL DEFAULT 'available' CHECK(status IN('available','blocked','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS availability_provider_day_idx ON provider_availability(provider_id,service_date);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS availability_id UUID REFERENCES provider_availability(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_mode TEXT NOT NULL DEFAULT 'in_person' CHECK(consultation_mode IN('online','in_person'));
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS billing_id UUID REFERENCES billing(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS teleconsult_id UUID UNIQUE REFERENCES tele_consult_sessions(id);
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK(status IN('scheduled','confirmed','completed','cancelled','no_show','awaiting_payment','payment_review','declined','rescheduled'));
CREATE TABLE IF NOT EXISTS consultation_payment_reviews (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), appointment_id UUID NOT NULL REFERENCES appointments(id),
 bill_id UUID NOT NULL REFERENCES billing(id), submitted_by UUID NOT NULL REFERENCES users(id),
 amount NUMERIC(10,2) NOT NULL CHECK(amount>0), payment_method TEXT NOT NULL CHECK(payment_method IN('cash','bank_transfer','gcash','card','other')),
 reference VARCHAR(150) NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','verified','rejected')),
 review_note TEXT, reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(appointment_id,reference)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_consultation_payment ON consultation_payment_reviews(appointment_id) WHERE status='pending';
CREATE OR REPLACE FUNCTION synchronize_consultation_appointment() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM appointments WHERE teleconsult_id=NEW.id) THEN
  IF NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
   RAISE EXCEPTION 'Cancel and rebook the linked appointment to change the consultation schedule';
  END IF;
  IF NEW.status IN('completed','cancelled') THEN
   UPDATE appointments SET status=NEW.status,updated_at=NOW(),review_note=CASE WHEN NEW.status='cancelled' AND billing_id IS NOT NULL
    THEN 'Video consultation cancelled. Clinic must review any payment or refund separately.' ELSE review_note END WHERE teleconsult_id=NEW.id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS consultation_appointment_sync ON tele_consult_sessions;
CREATE TRIGGER consultation_appointment_sync AFTER UPDATE ON tele_consult_sessions FOR EACH ROW EXECUTE FUNCTION synchronize_consultation_appointment();
DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['provider_availability','consultation_payment_reviews'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',t); END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',t); END IF;
 END LOOP; END $$;
