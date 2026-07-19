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
  ui_preferences JSONB DEFAULT '{"theme":"light","accent":"rose","density":"comfortable","surface":"solid","motion":"full"}',
  is_active BOOLEAN DEFAULT true,
  refresh_token TEXT,
  last_login_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff registry and hierarchical permissions
CREATE TABLE IF NOT EXISTS staff_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  professional_title VARCHAR(120),
  department VARCHAR(120),
  license_number VARCHAR(120),
  license_type VARCHAR(120),
  license_status VARCHAR(20) DEFAULT 'pending' CHECK (license_status IN ('pending','verified','suspended','expired')),
  credential_notes TEXT,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS license_verification_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES staff_registry(id) ON DELETE CASCADE NOT NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('created','verified','suspended','expired','note_added','restored')),
  previous_status VARCHAR(20),
  next_status VARCHAR(20),
  notes TEXT,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role VARCHAR(50) NOT NULL,
  permission_key VARCHAR(120) NOT NULL,
  is_allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (role, permission_key)
);

CREATE TABLE IF NOT EXISTS permission_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES staff_registry(id) ON DELETE CASCADE NOT NULL,
  permission_key VARCHAR(120) NOT NULL,
  effect VARCHAR(10) NOT NULL CHECK (effect IN ('grant','deny')),
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, permission_key)
);

CREATE TABLE IF NOT EXISTS auth_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES staff_registry(id) ON DELETE CASCADE NOT NULL,
  credential_type VARCHAR(30) NOT NULL CHECK (
    credential_type IN ('WebAuthn', 'Passkey', 'Device_Biometric', 'OTP')
  ),
  external_credential_ref TEXT NOT NULL,
  public_key TEXT,
  label VARCHAR(150),
  last_verified_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, credential_type, external_credential_ref)
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_credential_id UUID REFERENCES auth_credentials(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID REFERENCES staff_registry(id) ON DELETE CASCADE NOT NULL,
  credential_id TEXT UNIQUE NOT NULL,
  credential_public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  transports JSONB DEFAULT '[]',
  credential_device_type VARCHAR(30) DEFAULT 'singleDevice',
  credential_backed_up BOOLEAN DEFAULT false,
  attestation_format VARCHAR(30),
  label VARCHAR(150),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES staff_registry(id) ON DELETE CASCADE NOT NULL,
  purpose VARCHAR(80) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('SMS')),
  code_hash TEXT NOT NULL,
  attempt_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS digital_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES staff_registry(id) ON DELETE CASCADE NOT NULL,
  license_id VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  credential_strength VARCHAR(30) NOT NULL CHECK (
    credential_strength IN ('Base', 'Step_Up', 'Clinical_Signature')
  ),
  auth_method VARCHAR(30) NOT NULL CHECK (
    auth_method IN ('Password', 'Biometric', 'SMS_OTP', 'WebAuthn', 'Passkey')
  ),
  signature_hash TEXT NOT NULL,
  request_id VARCHAR(64),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_audit (
  id BIGSERIAL PRIMARY KEY,
  staff_id UUID REFERENCES staff_registry(id) ON DELETE SET NULL,
  action_performed VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  device_ip VARCHAR(45),
  auth_method VARCHAR(30) NOT NULL CHECK (
    auth_method IN ('Password', 'Biometric', 'SMS_OTP', 'WebAuthn', 'Passkey')
  ),
  credential_strength VARCHAR(30) NOT NULL CHECK (
    credential_strength IN ('Base', 'Step_Up', 'Clinical_Signature')
  ),
  request_id VARCHAR(64),
  notes TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{"theme":"light","accent":"rose","density":"comfortable","surface":"solid","motion":"full"}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

UPDATE users
SET ui_preferences = '{"theme":"light","accent":"rose","density":"comfortable","surface":"solid","motion":"full"}'
WHERE ui_preferences IS NULL
   OR (
     COALESCE(ui_preferences->>'theme', '') = 'system'
     AND COALESCE(ui_preferences->>'accent', '') = 'teal'
     AND COALESCE(ui_preferences->>'density', 'comfortable') = 'comfortable'
     AND COALESCE(ui_preferences->>'surface', 'solid') = 'solid'
   );

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
  patient_code VARCHAR(50),
  birthing_id VARCHAR(50),
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  suffix VARCHAR(30),
  date_of_birth DATE NOT NULL,
  civil_status VARCHAR(50),
  religion VARCHAR(100),
  nationality VARCHAR(100) DEFAULT 'Filipino',
  occupation VARCHAR(120),
  place_of_birth VARCHAR(150),
  address TEXT,
  barangay VARCHAR(100),
  city VARCHAR(100),
  province VARCHAR(100),
  postal_code VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(255),
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_relation VARCHAR(100),
  philhealth_id VARCHAR(50),
  philhealth_type VARCHAR(50),
  valid_id_type VARCHAR(100),
  valid_id_number VARCHAR(100),
  pregnancy_booklet_number VARCHAR(100),
  credential_notes TEXT,
  blood_type VARCHAR(10),
  biometric_height_cm DECIMAL(5,2),
  biometric_weight_kg DECIMAL(5,2),
  biometric_bmi DECIMAL(4,2),
  biometric_notes TEXT,
  allergies TEXT,
  existing_conditions TEXT,
  current_medications TEXT,
  ob_gyne_history JSONB DEFAULT '{}',
  risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low','moderate','high')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_code VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS birthing_id VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS suffix VARCHAR(30);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation VARCHAR(120);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(150);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS barangay VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS province VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS valid_id_type VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS valid_id_number VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pregnancy_booklet_number VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS credential_notes TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS biometric_height_cm DECIMAL(5,2);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS biometric_weight_kg DECIMAL(5,2);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS biometric_bmi DECIMAL(4,2);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS biometric_notes TEXT;

UPDATE patients
SET patient_code = 'MWOS-PAT-' || TO_CHAR(COALESCE(created_at, NOW()), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 4))
WHERE patient_code IS NULL;

UPDATE patients
SET birthing_id = 'TMC-BIR-' || TO_CHAR(COALESCE(created_at, NOW()), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 5 FOR 4))
WHERE birthing_id IS NULL;

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
  delivery_code VARCHAR(50),
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

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_code VARCHAR(50);

UPDATE deliveries
SET delivery_code = 'TMC-DEL-' || TO_CHAR(COALESCE(created_at, NOW()), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 4))
WHERE delivery_code IS NULL;

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

-- Dashboard media feed
CREATE TABLE IF NOT EXISTS media_feed_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  media_type VARCHAR(20) DEFAULT 'video' CHECK (media_type IN ('video','image')),
  media_url TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  poster_url TEXT,
  category VARCHAR(100),
  engagement_views INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE media_feed_posts ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'video';
ALTER TABLE media_feed_posts ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE media_feed_posts ADD COLUMN IF NOT EXISTS poster_url TEXT;
ALTER TABLE media_feed_posts ADD COLUMN IF NOT EXISTS engagement_views INTEGER DEFAULT 0;

UPDATE media_feed_posts
SET media_url = COALESCE(media_url, video_url),
    poster_url = COALESCE(poster_url, thumbnail_url),
    media_type = COALESCE(media_type, 'video')
WHERE media_url IS NULL OR poster_url IS NULL OR media_type IS NULL;

-- Patient documents
CREATE TABLE IF NOT EXISTS patient_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  document_type VARCHAR(100) NOT NULL,
  original_name TEXT,
  file_url TEXT NOT NULL,
  ocr_status VARCHAR(20) DEFAULT 'pending' CHECK (ocr_status IN ('pending','processed','failed')),
  ocr_text TEXT,
  ocr_extracted_data JSONB DEFAULT '{}',
  verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  verification_notes TEXT,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS ocr_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS ocr_text TEXT;
ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS ocr_extracted_data JSONB DEFAULT '{}';

-- Resumable upload sessions
CREATE TABLE IF NOT EXISTS upload_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('patient_document','media_feed','medicine_image')),
  original_name TEXT NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  total_size BIGINT NOT NULL,
  total_chunks INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  received_chunks JSONB DEFAULT '[]',
  temp_dir TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assembling','completed','failed','cancelled')),
  finalized_asset_path TEXT,
  completed_resource_type VARCHAR(50),
  completed_resource_id UUID,
  error_message TEXT,
  last_chunk_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ratings and reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name VARCHAR(120),
  role_label VARCHAR(60),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  purpose TEXT,
  dosage VARCHAR(120),
  usage_instructions TEXT,
  usage_steps JSONB DEFAULT '[]'::jsonb,
  precautions TEXT,
  side_effects TEXT,
  requires_prescription BOOLEAN DEFAULT false,
  image_url TEXT,
  availability_status VARCHAR(30) DEFAULT 'available' CHECK (availability_status IN ('available','limited','out_of_stock')),
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

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS dosage VARCHAR(120);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS usage_instructions TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS usage_steps JSONB DEFAULT '[]'::jsonb;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS precautions TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS side_effects TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN DEFAULT false;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS availability_status VARCHAR(30) DEFAULT 'available';

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
  request_id VARCHAR(64),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);

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

-- Interaction center: threads and messages
CREATE TABLE IF NOT EXISTS conversation_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_type VARCHAR(30) NOT NULL DEFAULT 'care_team' CHECK (thread_type IN ('care_team','patient_support','handoff','announcement','tele_consult')),
  title VARCHAR(255) NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','archived')),
  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES conversation_threads(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  UNIQUE (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES conversation_threads(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  message_type VARCHAR(20) NOT NULL DEFAULT 'comment' CHECK (message_type IN ('comment','handoff','system')),
  message_category VARCHAR(30) NOT NULL DEFAULT 'general' CHECK (message_category IN ('general','clinical_advice','clinical_note','teleconsult','handoff','urgent','system')),
  is_clinical_note BOOLEAN NOT NULL DEFAULT false,
  record_promotion_status VARCHAR(20) NOT NULL DEFAULT 'not_promoted' CHECK (record_promotion_status IN ('not_promoted','promoted','rejected')),
  record_promotion_at TIMESTAMPTZ,
  record_promotion_by UUID REFERENCES users(id) ON DELETE SET NULL,
  teleconsult_session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tele_consult_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES conversation_threads(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  clinician_id UUID REFERENCES users(id) ON DELETE SET NULL,
  trigger_source VARCHAR(50) NOT NULL DEFAULT 'manual' CHECK (trigger_source IN ('manual','vitals','lab','ultrasound','message','appointment','emergency','follow_up')),
  clinical_trigger VARCHAR(120),
  reason TEXT NOT NULL,
  meeting_provider VARCHAR(30) NOT NULL DEFAULT 'jitsi' CHECK (meeting_provider IN ('jitsi','zoom','twilio_video','external')),
  meeting_url TEXT NOT NULL,
  meeting_code VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','scheduled','active','completed','cancelled')),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  triggered_from_message_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS conversation_threads
  DROP CONSTRAINT IF EXISTS conversation_threads_thread_type_check;

ALTER TABLE IF EXISTS conversation_threads
  ADD CONSTRAINT conversation_threads_thread_type_check
  CHECK (thread_type IN ('care_team','patient_support','handoff','announcement','tele_consult'));

ALTER TABLE IF EXISTS conversation_messages
  ADD COLUMN IF NOT EXISTS message_category VARCHAR(30) DEFAULT 'general';

ALTER TABLE IF EXISTS conversation_messages
  ADD COLUMN IF NOT EXISTS is_clinical_note BOOLEAN DEFAULT false;

ALTER TABLE IF EXISTS conversation_messages
  ADD COLUMN IF NOT EXISTS record_promotion_status VARCHAR(20) DEFAULT 'not_promoted';

ALTER TABLE IF EXISTS conversation_messages
  ADD COLUMN IF NOT EXISTS record_promotion_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS conversation_messages
  ADD COLUMN IF NOT EXISTS record_promotion_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS conversation_messages
  ADD COLUMN IF NOT EXISTS teleconsult_session_id UUID;

ALTER TABLE IF EXISTS conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_message_category_check;

ALTER TABLE IF EXISTS conversation_messages
  ADD CONSTRAINT conversation_messages_message_category_check
  CHECK (message_category IN ('general','clinical_advice','clinical_note','teleconsult','handoff','urgent','system'));

ALTER TABLE IF EXISTS conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_record_promotion_status_check;

ALTER TABLE IF EXISTS conversation_messages
  ADD CONSTRAINT conversation_messages_record_promotion_status_check
  CHECK (record_promotion_status IN ('not_promoted','promoted','rejected'));

ALTER TABLE IF EXISTS conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_teleconsult_session_id_fkey;

ALTER TABLE IF EXISTS conversation_messages
  ADD CONSTRAINT conversation_messages_teleconsult_session_id_fkey
  FOREIGN KEY (teleconsult_session_id) REFERENCES tele_consult_sessions(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS tele_consult_sessions
  ADD COLUMN IF NOT EXISTS triggered_from_message_id UUID;

ALTER TABLE IF EXISTS tele_consult_sessions
  DROP CONSTRAINT IF EXISTS tele_consult_sessions_triggered_from_message_id_fkey;

ALTER TABLE IF EXISTS tele_consult_sessions
  ADD CONSTRAINT tele_consult_sessions_triggered_from_message_id_fkey
  FOREIGN KEY (triggered_from_message_id) REFERENCES conversation_messages(id) ON DELETE SET NULL;

-- Interaction center: tasks
CREATE TABLE IF NOT EXISTS care_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_date DATE,
  patient_visible BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_patient_code_unique ON patients(patient_code) WHERE patient_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_birthing_id_unique ON patients(birthing_id) WHERE birthing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pregnancies_patient_id ON pregnancies(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_date ON appointments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vitals_patient_id ON vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_patient_id ON deliveries(patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_delivery_code_unique ON deliveries(delivery_code) WHERE delivery_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_patient_id ON billing(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_staff_registry_user_id ON staff_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_registry_license_status ON staff_registry(license_status);
CREATE INDEX IF NOT EXISTS idx_license_verification_events_staff_id ON license_verification_events(staff_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_permission_overrides_staff_id ON permission_overrides(staff_id);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_staff_id ON auth_credentials(staff_id);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_type ON auth_credentials(credential_type);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_staff_id ON webauthn_credentials(staff_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_staff_id ON otp_challenges(staff_id);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_purpose ON otp_challenges(purpose);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_expires_at ON otp_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_digital_signatures_staff_id ON digital_signatures(staff_id);
CREATE INDEX IF NOT EXISTS idx_digital_signatures_entity ON digital_signatures(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_staff_id ON security_audit(staff_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_created_at ON security_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_feed_posts_created_at ON media_feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_feed_posts_published ON media_feed_posts(is_published);
CREATE INDEX IF NOT EXISTS idx_media_feed_posts_media_type ON media_feed_posts(media_type);
CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_id ON patient_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_status ON patient_documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_patient_documents_ocr_status ON patient_documents(ocr_status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_owner_status ON upload_sessions(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_target_type ON upload_sessions(target_type);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_created_at ON upload_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_patient_id ON conversation_threads(patient_id);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_last_message_at ON conversation_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread_id ON conversation_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_category ON conversation_messages(message_category);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_promotion_status ON conversation_messages(record_promotion_status);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_teleconsult_session_id ON conversation_messages(teleconsult_session_id);
CREATE INDEX IF NOT EXISTS idx_tele_consult_sessions_thread_id ON tele_consult_sessions(thread_id);
CREATE INDEX IF NOT EXISTS idx_tele_consult_sessions_patient_id ON tele_consult_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_tele_consult_sessions_clinician_id ON tele_consult_sessions(clinician_id);
CREATE INDEX IF NOT EXISTS idx_tele_consult_sessions_status ON tele_consult_sessions(status);
CREATE INDEX IF NOT EXISTS idx_tele_consult_sessions_created_at ON tele_consult_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_tasks_assigned_to ON care_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_care_tasks_patient_id ON care_tasks(patient_id);
CREATE INDEX IF NOT EXISTS idx_care_tasks_status ON care_tasks(status);

SELECT 'Migration completed successfully' as status;
