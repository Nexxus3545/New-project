-- MWOS Database Schema
-- TMC Copino Birthing Home and Medical Clinic

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin','doctor','midwife','nurse','patient')),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  avatar_url TEXT,
  ui_preferences JSONB DEFAULT '{"theme":"system","accent":"teal","density":"comfortable","surface":"solid","motion":"full"}',
  is_active BOOLEAN DEFAULT true,
  refresh_token TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{"theme":"system","accent":"teal","density":"comfortable","surface":"solid","motion":"full"}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients table
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  civil_status VARCHAR(50),
  religion VARCHAR(100),
  nationality VARCHAR(100) DEFAULT 'Filipino',
  address TEXT,
  city VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(255),
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_relation VARCHAR(100),
  philhealth_id VARCHAR(50),
  philhealth_type VARCHAR(50),
  blood_type VARCHAR(10),
  allergies TEXT,
  existing_conditions TEXT,
  current_medications TEXT,
  ob_gyne_history JSONB DEFAULT '{}',
  risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low','moderate','high')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pregnancies table
CREATE TABLE IF NOT EXISTS pregnancies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  lmp DATE NOT NULL,
  edd DATE NOT NULL,
  gravida INTEGER DEFAULT 1,
  para INTEGER DEFAULT 0,
  abortion INTEGER DEFAULT 0,
  living_children INTEGER DEFAULT 0,
  risk_level VARCHAR(20) DEFAULT 'low',
  risk_factors TEXT[],
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','delivered','miscarried','aborted')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  pregnancy_id UUID REFERENCES pregnancies(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id),
  appointment_type VARCHAR(50) DEFAULT 'prenatal',
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  notes TEXT,
  reminder_sent BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vitals table
CREATE TABLE IF NOT EXISTS vitals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  pregnancy_id UUID REFERENCES pregnancies(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  gestational_age_weeks INTEGER,
  weight_kg DECIMAL(5,2),
  height_cm DECIMAL(5,2),
  bmi DECIMAL(4,2),
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  bp_category VARCHAR(30),
  pulse_rate INTEGER,
  temperature DECIMAL(4,2),
  respiratory_rate INTEGER,
  fundal_height_cm DECIMAL(5,2),
  fetal_heart_rate INTEGER,
  fetal_presentation VARCHAR(50),
  fetal_movement VARCHAR(20),
  edema VARCHAR(20),
  notes TEXT,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  pregnancy_id UUID REFERENCES pregnancies(id) ON DELETE CASCADE NOT NULL,
  delivery_date DATE NOT NULL,
  delivery_time TIME,
  delivery_type VARCHAR(30) DEFAULT 'NSD' CHECK (delivery_type IN ('NSD','CS','Forceps','Vacuum')),
  gestational_age_at_delivery INTEGER,
  birth_attendant UUID REFERENCES users(id),
  newborn_sex VARCHAR(10),
  birth_weight_kg DECIMAL(5,3),
  apgar_1min INTEGER,
  apgar_5min INTEGER,
  newborn_condition TEXT,
  complications TEXT,
  placenta_delivery VARCHAR(30),
  blood_loss_ml INTEGER,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Labor progress (partograph data)
CREATE TABLE IF NOT EXISTS labor_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cervical_dilation INTEGER,
  fetal_station INTEGER,
  fetal_heart_rate INTEGER,
  contractions_per_10min INTEGER,
  contraction_duration INTEGER,
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  pulse_rate INTEGER,
  temperature DECIMAL(4,2),
  urine_output INTEGER,
  oxytocin_units INTEGER,
  alert_flag BOOLEAN DEFAULT false,
  action_flag BOOLEAN DEFAULT false,
  notes TEXT,
  recorded_by UUID REFERENCES users(id)
);

-- Lab results
CREATE TABLE IF NOT EXISTS lab_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  pregnancy_id UUID REFERENCES pregnancies(id) ON DELETE SET NULL,
  test_name VARCHAR(200) NOT NULL,
  test_date DATE NOT NULL,
  result_value TEXT,
  unit VARCHAR(50),
  reference_range VARCHAR(100),
  status VARCHAR(20) DEFAULT 'normal' CHECK (status IN ('normal','abnormal','critical')),
  notes TEXT,
  file_url TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ultrasounds
CREATE TABLE IF NOT EXISTS ultrasounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  pregnancy_id UUID REFERENCES pregnancies(id) ON DELETE SET NULL,
  scan_date DATE NOT NULL,
  gestational_age_weeks INTEGER,
  findings TEXT,
  fetal_biometry JSONB,
  placenta_location VARCHAR(50),
  amniotic_fluid VARCHAR(50),
  file_url TEXT,
  performed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prescriptions
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  pregnancy_id UUID REFERENCES pregnancies(id) ON DELETE SET NULL,
  medication_name VARCHAR(200) NOT NULL,
  dosage VARCHAR(100),
  frequency VARCHAR(100),
  route VARCHAR(50),
  duration VARCHAR(100),
  instructions TEXT,
  prescribed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  prescribed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Postpartum records
CREATE TABLE IF NOT EXISTS postpartum_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE NOT NULL,
  visit_date DATE NOT NULL,
  days_postpartum INTEGER,
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  temperature DECIMAL(4,2),
  wound_status VARCHAR(100),
  lochia VARCHAR(100),
  breastfeeding_status VARCHAR(50),
  emotional_status VARCHAR(50),
  notes TEXT,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Immunizations
CREATE TABLE IF NOT EXISTS immunizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  vaccine_name VARCHAR(200) NOT NULL,
  dose_number INTEGER DEFAULT 1,
  date_given DATE NOT NULL,
  due_date DATE,
  given_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Education content
CREATE TABLE IF NOT EXISTS education_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(300) NOT NULL,
  category VARCHAR(100),
  trimester_target VARCHAR(20),
  content TEXT,
  media_url TEXT,
  is_published BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  unit VARCHAR(50),
  quantity INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  expiry_date DATE,
  supplier VARCHAR(200),
  unit_cost DECIMAL(10,2),
  notes TEXT,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing
CREATE TABLE IF NOT EXISTS billing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_type VARCHAR(200),
  amount DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid','waived')),
  philhealth_claim_no VARCHAR(100),
  philhealth_amount DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  channel VARCHAR(30) DEFAULT 'in_app' CHECK (channel IN ('in_app','email','sms')),
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Backup logs
CREATE TABLE IF NOT EXISTS backup_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  backup_file TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success','failed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_pregnancies_patient_id ON pregnancies(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_date ON appointments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vitals_patient_id ON vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_patient_id ON deliveries(patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_patient_id ON billing(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

SELECT 'Migration completed successfully' as status;
