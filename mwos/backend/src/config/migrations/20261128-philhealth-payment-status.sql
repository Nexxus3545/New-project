-- A clinic records reimbursement status separately from the payment ledger.
-- Legacy claim references and amounts cannot establish reimbursement status.
ALTER TABLE public.billing
  ADD COLUMN IF NOT EXISTS philhealth_payment_status VARCHAR(20) NOT NULL DEFAULT 'not_recorded'
    CHECK (philhealth_payment_status IN ('not_recorded', 'processing', 'paid')),
  ADD COLUMN IF NOT EXISTS philhealth_status_updated_at TIMESTAMPTZ;
