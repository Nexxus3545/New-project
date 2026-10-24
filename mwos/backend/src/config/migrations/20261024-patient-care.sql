-- Additive only: existing patients and clinical records are not reclassified.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender VARCHAR(30)
  CHECK (gender IN ('female', 'male', 'other', 'prefer_not_to_say'));
ALTER TABLE patients ADD COLUMN IF NOT EXISTS care_type VARCHAR(20)
  CHECK (care_type IN ('general', 'maternal'));
ALTER TABLE appointments ALTER COLUMN appointment_type SET DEFAULT 'consultation';
