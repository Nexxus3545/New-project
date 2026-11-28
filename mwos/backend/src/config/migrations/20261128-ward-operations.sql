ALTER TABLE public.care_tasks
  ADD COLUMN IF NOT EXISTS ward_category TEXT,
  ADD COLUMN IF NOT EXISTS ward_due_time TIME;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.care_tasks'::regclass
      AND conname = 'care_tasks_ward_assignment_check'
  ) THEN
    ALTER TABLE public.care_tasks ADD CONSTRAINT care_tasks_ward_assignment_check CHECK (
      (ward_category IS NULL AND ward_due_time IS NULL)
      OR (
        ward_category IS NOT NULL
        AND ward_category IN ('medication', 'meal', 'operations')
        AND due_date IS NOT NULL
        AND patient_visible IS FALSE
      )
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS care_tasks_ward_due_idx
  ON public.care_tasks (due_date, ward_due_time)
  WHERE ward_category IS NOT NULL;
