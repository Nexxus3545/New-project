ALTER TABLE patients ADD COLUMN IF NOT EXISTS qr_token UUID NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX IF NOT EXISTS patients_qr_token_idx ON patients(qr_token);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS patient_visits (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), patient_id UUID NOT NULL REFERENCES patients(id),
 appointment_id UUID REFERENCES appointments(id), stage TEXT NOT NULL DEFAULT 'checked_in',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','completed','cancelled')),
 created_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_patient_visit ON patient_visits(patient_id) WHERE status='open';
CREATE TABLE IF NOT EXISTS patient_visit_events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), visit_id UUID NOT NULL REFERENCES patient_visits(id),
 stage TEXT NOT NULL, note TEXT, recorded_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS clinical_outcomes (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), patient_id UUID NOT NULL REFERENCES patients(id), newborn_id UUID REFERENCES newborn_records(id),
 outcome_type TEXT NOT NULL CHECK(outcome_type IN('maternal_death','neonatal_death')),
 occurred_on DATE NOT NULL, evidence_note TEXT NOT NULL, verified_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((outcome_type='maternal_death' AND newborn_id IS NULL) OR (outcome_type='neonatal_death' AND newborn_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_maternal_outcome ON clinical_outcomes(patient_id) WHERE outcome_type='maternal_death';
CREATE UNIQUE INDEX IF NOT EXISTS one_neonatal_outcome ON clinical_outcomes(newborn_id) WHERE outcome_type='neonatal_death';
CREATE TABLE IF NOT EXISTS inventory_transactions (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), inventory_id UUID NOT NULL REFERENCES inventory(id),
 quantity_before INTEGER NOT NULL, quantity_after INTEGER NOT NULL, delta INTEGER NOT NULL,
 reason TEXT NOT NULL, recorded_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION record_inventory_quantity_change() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF NEW.quantity < 0 THEN RAISE EXCEPTION 'Inventory quantity cannot be negative'; END IF;
 IF TG_OP='INSERT' THEN
  INSERT INTO inventory_transactions(inventory_id,quantity_before,quantity_after,delta,reason,recorded_by)
  VALUES(NEW.id,0,NEW.quantity,NEW.quantity,COALESCE(NEW.notes,'Opening balance'),NEW.updated_by);
 ELSIF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
  INSERT INTO inventory_transactions(inventory_id,quantity_before,quantity_after,delta,reason,recorded_by)
  VALUES(NEW.id,OLD.quantity,NEW.quantity,NEW.quantity-OLD.quantity,COALESCE(NEW.notes,'Stock adjustment'),NEW.updated_by);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inventory_quantity_history ON inventory;
CREATE TRIGGER inventory_quantity_history AFTER INSERT OR UPDATE OF quantity ON inventory FOR EACH ROW EXECUTE FUNCTION record_inventory_quantity_change();
DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['patient_visits','patient_visit_events','clinical_outcomes','inventory_transactions'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',t); END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',t); END IF;
 END LOOP; END $$;
