# MWOS Implementation Backlog

This backlog turns the production architecture into buildable phases for Web, Desktop, Mobile, Backend, Database, and DevOps.

## Guiding Rule

Every phase must preserve:

- UI parity across web, desktop, and mobile
- shared API contracts
- shared validation logic
- role-safe access rules
- auditability of sensitive actions

## Phase 0: Shared Platform Foundation

### Goal

Create the shared architecture that prevents platform drift.

### Backend

- formalize API versioning
- standardize error envelope and correlation IDs
- create shared permission middleware
- centralize domain validation schemas

### Web and Desktop

- converge desktop renderer onto the same React shell as web
- extract shared navigation config
- extract shared design tokens
- extract shared dashboard cards, forms, tables, and upload controls

### Mobile

- align design tokens with web and desktop
- mirror route names and permission logic
- create shared API client and query-key conventions

### DevOps

- define environment matrix for local, staging, and production
- standardize logging format
- add health endpoints and readiness checks

### Acceptance Criteria

- one canonical token set
- one canonical permission map
- one canonical route and screen matrix

## Phase 1: Staff Registry and Hierarchical RBAC

### Goal

Implement professional identity, license verification, and credential-aware access controls.

### Database

- create `staff_registry`
- create `license_verification_events`
- create `role_permissions`
- create `permission_overrides`

### Backend

- add staff registry CRUD
- add license verification status workflow
- add permission evaluator by role plus credential status
- enforce restricted access for doctor-only, nurse-only, midwife-only, and admin-only actions

### Web and Desktop

- staff profile screens
- license verification badges
- role-permission admin console

### Mobile

- staff profile view
- restricted-action messaging
- role-aware home actions

### Acceptance Criteria

- a midwife cannot prescribe
- a nurse cannot finalize diagnosis
- an admin cannot open restricted clinical vitals without explicit policy permission

## Phase 2: Authentication, Biometrics, MFA, and Digital Signatures

### Goal

Make identity strong enough for clinical-grade operations.

### Database

- create `auth_credentials`
- create `webauthn_credentials`
- create `otp_challenges`
- create `digital_signatures`

### Backend

- add WebAuthn/passkey registration and login
- add OTP challenge and verify endpoints
- add step-up auth middleware
- add digital signature service for chart entries

### Mobile

- integrate device biometrics
- implement biometric fallback UX
- implement OTP verification flow

### Web and Desktop

- implement WebAuthn or platform authenticator flows
- implement desktop workstation fingerprint or platform-auth integration abstraction
- implement critical-action OTP modal

### Acceptance Criteria

- critical actions require step-up auth
- chart entries are signed with license ID and timestamp
- biometric data is never stored raw in application tables

## Phase 3: Patient Onboarding and Document Flow Uploading

### Goal

Deliver production-grade intake and resilient file upload workflows.

### Database

- add onboarding drafts
- add upload sessions
- add document versions
- add OCR extraction records

### Backend

- signed upload URLs
- multipart/chunked upload orchestration
- OCR processing pipeline
- antivirus and file-type validation
- verification queue assignment

### Web and Desktop

- drag-and-drop upload
- chunk progress and retry UI
- upload preview, queue, and status
- registrar-assisted onboarding flow

### Mobile

- tap upload flow
- resumable upload state handling
- onboarding draft resume

### Acceptance Criteria

- interrupted uploads resume safely
- OCR suggestions require confirmation before record merge
- every upload is attributable and auditable

## Phase 4: Smart Scheduling and Reminder Engine

### Goal

Make scheduling safe, conflict-aware, and automated.

### Database

- add provider availability rules
- add room/resource calendars
- add reminder jobs

### Backend

- conflict-check service
- prenatal cadence recommendation engine
- reminder dispatch jobs
- missed-appointment follow-up workflow

### Web, Desktop, and Mobile

- unified booking flow
- alternative slot suggestions
- reminder preference controls

### Acceptance Criteria

- no double-booked providers
- no invalid room conflicts
- reminders fire through SMS, email, and in-app paths

## Phase 5: Health Tracking Suite and Trend Analytics

### Goal

Deliver real-time maternal monitoring with clear trend visibility.

### Database

- add denormalized trend tables or materialized views
- add alert threshold policy tables

### Backend

- derived metric engine
- abnormal trend detection
- alert generation and notification service

### Web, Desktop, and Mobile

- trend charts for BP, weight, and kick counts
- alert badges and escalation prompts
- patient-safe simplified guidance cards

### Acceptance Criteria

- abnormal readings surface immediately
- clinicians see deteriorating trends first
- patient dashboard remains readable and action-oriented

## Phase 6: Doctor and Patient Portal with Tele-Consult Triggers

### Goal

Complete secure clinical communication and remote care escalation.

### Database

- add tele-consult sessions
- add clinical message classification metadata

### Backend

- secure messaging service
- tele-consult trigger endpoint
- meeting-link provider integration
- clinical-message-to-record promotion flow

### Web, Desktop, and Mobile

- unified conversation UX
- tele-consult CTA
- attachment and task linkage

### Acceptance Criteria

- patient and care team messaging is role-safe
- tele-consult launches from clinical triggers
- clinical advice can be added to the medical record with audit trace

## Phase 7: Admin Analytics, Audit, and Compliance Controls

### Goal

Support operations, risk review, and compliance readiness.

### Database

- expand security audit events
- add export logs
- add retention policy references

### Backend

- audit search API
- compliance export reports
- data-access event reporting
- backup verification status endpoints

### Web and Desktop

- admin analytics dashboard
- audit explorer
- license and access review panels

### Acceptance Criteria

- every sensitive read/write is queryable
- admin reports are exportable without exposing restricted raw data

## Phase 8: Hardening, Performance, and Release Readiness

### Goal

Stabilize the platform for staged rollout.

### Backend and Infrastructure

- Redis caching
- queue dead-letter handling
- S3 lifecycle rules
- CDN caching
- Sentry and log aggregation
- restore drills

### Clients

- error boundaries
- retry and rollback behavior
- cache invalidation review
- accessibility and responsiveness review

### Acceptance Criteria

- no unhandled exceptions in standard smoke paths
- backups are restore-tested
- high-volume upload and dashboard flows meet latency targets

## Cross-Cutting Delivery Workstreams

### Documentation

- API contracts
- permission matrix
- threat model
- onboarding SOPs
- incident response guide

### QA

- RBAC test matrix
- biometric and MFA tests
- upload interruption tests
- schedule conflict tests
- alert escalation tests

### Migration Strategy

- preserve current MWOS app while introducing shared packages incrementally
- move desktop to shared web shell first
- then align mobile to shared domain and validation packages
