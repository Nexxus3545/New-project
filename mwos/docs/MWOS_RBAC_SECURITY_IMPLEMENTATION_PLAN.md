# MWOS RBAC and Security Implementation Plan

This document translates the MWOS credential-aware RBAC, MFA, biometric, audit, and secure-upload requirements into concrete implementation work for the current repository.

It is designed for the current stack:

- Backend: `Node.js + Express + PostgreSQL`
- Web: `React + Tailwind + React Query`
- Desktop: `Electron`
- Mobile: `React Native + Expo`

## 1. Core Rules

### 1.1 Hierarchical RBAC

The system must enforce role and credential boundaries:

- `Doctor`:
  - full diagnosis access
  - prescription signing
  - high-risk review and update
  - tele-consult approval
- `Nurse`:
  - vital sign logging
  - patient history access within permitted clinical scope
  - prenatal and follow-up task execution
  - no prescribing
- `Midwife`:
  - vital sign logging
  - prenatal check-up records
  - labor and postpartum charting
  - no physician-only diagnosis or prescription finalization
- `Admin`:
  - billing
  - scheduling
  - staff registry
  - license verification workflow
  - restricted medical-detail access unless explicitly granted

### 1.2 Credential Rule

Every professional user must have:

- verified `license_id`
- active account status
- role-permission mapping
- audit identity

No sensitive clinical mutation should succeed unless:

1. session is active
2. account is active
3. role allows the action
4. credential is verified if the action is clinical
5. step-up auth is completed if the action is critical

## 2. Safer Production Security Position

The original `Biometric_Template_Hash` idea is understandable, but production MWOS should not store raw or reconstructable biometric material unless absolutely required by a regulated device workflow.

Preferred approach:

- mobile biometrics stay on-device
- web and desktop use `WebAuthn`, `Windows Hello`, `Touch ID`, or approved workstation biometrics
- database stores:
  - credential IDs
  - public-key references
  - authenticator metadata
  - verification timestamps

This gives strong authentication with lower data protection risk.

## 3. Database Blueprint

## 3.1 Staff Registry

```sql
CREATE TABLE staff_registry (
    staff_id UUID PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('Doctor', 'Nurse', 'Midwife', 'Admin')),
    license_id VARCHAR(50) UNIQUE NOT NULL,
    license_type VARCHAR(50) NOT NULL,
    issuing_authority VARCHAR(100) NOT NULL,
    verification_status VARCHAR(30) NOT NULL CHECK (
        verification_status IN ('Pending_Verification', 'Verified', 'Suspended', 'Expired')
    ),
    verified_at TIMESTAMPTZ,
    mobile_number VARCHAR(20) UNIQUE,
    account_status VARCHAR(30) NOT NULL CHECK (
        account_status IN ('Active', 'Suspended', 'Pending_Verification')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 3.2 Permission Tables

```sql
CREATE TABLE role_permissions (
    permission_id UUID PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('Doctor', 'Nurse', 'Midwife', 'Admin')),
    permission_code VARCHAR(80) NOT NULL,
    UNIQUE (role, permission_code)
);

CREATE TABLE permission_overrides (
    override_id UUID PRIMARY KEY,
    staff_id UUID NOT NULL REFERENCES staff_registry(staff_id),
    permission_code VARCHAR(80) NOT NULL,
    override_type VARCHAR(20) NOT NULL CHECK (override_type IN ('grant', 'deny')),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 3.3 Biometric / Passkey Metadata

```sql
CREATE TABLE auth_credentials (
    credential_id UUID PRIMARY KEY,
    staff_id UUID NOT NULL REFERENCES staff_registry(staff_id),
    credential_type VARCHAR(30) NOT NULL CHECK (
        credential_type IN ('WebAuthn', 'Passkey', 'Device_Biometric', 'OTP')
    ),
    external_credential_ref TEXT NOT NULL,
    public_key TEXT,
    last_verified_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 3.4 OTP Challenges

```sql
CREATE TABLE otp_challenges (
    otp_id UUID PRIMARY KEY,
    staff_id UUID NOT NULL REFERENCES staff_registry(staff_id),
    purpose VARCHAR(80) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('SMS')),
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 3.5 Digital Signatures

```sql
CREATE TABLE digital_signatures (
    signature_id UUID PRIMARY KEY,
    staff_id UUID NOT NULL REFERENCES staff_registry(staff_id),
    license_id VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action_type VARCHAR(80) NOT NULL,
    credential_strength VARCHAR(30) NOT NULL CHECK (
        credential_strength IN ('Base', 'Step_Up', 'Clinical_Signature')
    ),
    signature_hash TEXT NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 3.6 Immutable Audit Trail

```sql
CREATE TABLE security_audit (
    log_id BIGSERIAL PRIMARY KEY,
    staff_id UUID REFERENCES staff_registry(staff_id),
    action_performed VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_ip VARCHAR(45),
    auth_method VARCHAR(30) NOT NULL CHECK (
        auth_method IN ('Password', 'Biometric', 'SMS_OTP', 'WebAuthn', 'Passkey')
    ),
    credential_strength VARCHAR(30) NOT NULL CHECK (
        credential_strength IN ('Base', 'Step_Up', 'Clinical_Signature')
    )
);
```

## 4. Backend API Task List

## 4.1 Staff and License Registry

- `GET /staff-registry`
- `POST /staff-registry`
- `GET /staff-registry/:id`
- `PATCH /staff-registry/:id`
- `PATCH /staff-registry/:id/verify-license`
- `PATCH /staff-registry/:id/suspend`

### Rules

- only admin can verify or suspend staff credentials
- clinical modules reject access if `verification_status != 'Verified'`

## 4.2 Permissions and Overrides

- `GET /security/permissions`
- `POST /security/permissions/override`
- `DELETE /security/permissions/override/:id`

## 4.3 MFA and Biometrics

- `POST /auth/webauthn/register/start`
- `POST /auth/webauthn/register/finish`
- `POST /auth/webauthn/login/start`
- `POST /auth/webauthn/login/finish`
- `POST /auth/otp/request`
- `POST /auth/otp/verify`

## 4.4 Digital Signatures

- `POST /security/sign`
- `GET /security/signatures/:entityType/:entityId`

## 4.5 Security Audit

- `GET /security/audit`
- `GET /security/audit/:staffId`

## 4.6 Flow Uploading

- `POST /uploads/signed-url`
- `POST /uploads/session/start`
- `POST /uploads/session/:id/part`
- `POST /uploads/session/:id/complete`
- `POST /documents/:id/verify`

## 5. Security Wrapper Pattern

Every sensitive backend controller should call a shared policy guard before executing business logic.

Example:

```ts
await authorizeClinicalAction({
  user: req.user,
  requiredPermission: 'patient.risk.update',
  requireVerifiedCredential: true,
  requireStepUp: true,
  entityType: 'patient',
  entityId: req.params.id,
})
```

The shared guard must validate:

- session active
- account active
- role permission present
- license verification complete
- override deny not present
- step-up auth satisfied when required

## 6. Web and Desktop Screen Task Map

Because desktop should share the web shell, these screens should be implemented once and rendered in both:

### Admin

- Staff Registry
- License Verification Queue
- Permission Override Console
- Security Audit Explorer
- OTP Challenge Logs

### Clinical Staff

- Staff Profile with verified license badge
- Patient Vitals and History
- Prenatal Check-Up Form
- Prescription Screen
- High-Risk Status Update Modal with OTP confirmation
- Upload Center with drag-and-drop Flow Uploading

### Shared Auth

- Password login
- Passkey / WebAuthn login
- Step-up auth modal
- Session and device security alerts

## 7. Mobile Screen Task Map

### Auth

- password login
- biometric quick login
- OTP confirmation flow

### Staff

- staff profile and license status
- patient dashboard
- vitals logging
- prenatal visit form
- upload workflow with resumable state
- high-risk change confirmation

### Patient

- patient dashboard
- health tracking
- secure upload
- appointment management
- secure messaging

## 8. Flow Uploading Implementation Tasks

### Backend

- direct-to-storage signed upload policy
- chunk manifest tracking
- resumable upload session status
- background finalization worker

### Web/Desktop

- drag-and-drop surface
- upload queue
- chunk progress visualization
- pause and resume states

### Mobile

- background-safe upload queue where platform allows
- resume failed uploads on reconnect
- low-bandwidth retry messaging

## 9. Zero-Failure Development Strategy

Use this as the practical interpretation of "zero-bug":

- no unhandled exception leaves the API
- no permission bypass succeeds
- no critical mutation occurs without audit
- no large upload is lost silently
- no clinical write occurs without attributable identity

### Required Engineering Controls

- shared request validation
- integration tests for RBAC matrix
- audit assertions in sensitive endpoint tests
- upload interruption and resume tests
- OTP and step-up auth tests
- license verification gating tests

## 10. Recommended Immediate Build Order

1. Database migrations for `staff_registry`, `role_permissions`, `auth_credentials`, `otp_challenges`, `digital_signatures`, `security_audit`
2. Shared backend authorization wrapper
3. Staff registry and license verification admin screens
4. WebAuthn and OTP backend flows
5. Mobile biometric login integration
6. Drag-and-drop and resumable upload pipeline
7. Clinical signature enforcement on chart writes
