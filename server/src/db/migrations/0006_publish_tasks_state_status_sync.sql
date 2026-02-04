-- publish_tasks: ensure both state and status columns exist with proper defaults
-- This migration is idempotent and safe to run multiple times

-- Step 1: Add status column if it doesn't exist (text, nullable initially)
ALTER TABLE publish_tasks
  ADD COLUMN IF NOT EXISTS status text;

-- Step 2: Add state column if it doesn't exist (text, nullable initially)
-- Note: state likely already exists, but we ensure it's there
ALTER TABLE publish_tasks
  ADD COLUMN IF NOT EXISTS state text;

-- Step 3: Backfill data - if status is NULL, set it from state
-- Only run if status column exists (it should after step 1, but be safe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'publish_tasks' 
    AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'publish_tasks' 
    AND column_name = 'state'
  ) THEN
    UPDATE publish_tasks
    SET status = state
    WHERE status IS NULL AND state IS NOT NULL;
  END IF;
END $$;

-- Step 4: Backfill data - if state is NULL, set it from status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'publish_tasks' 
    AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'publish_tasks' 
    AND column_name = 'state'
  ) THEN
    UPDATE publish_tasks
    SET state = status
    WHERE state IS NULL AND status IS NOT NULL;
  END IF;
END $$;

-- Step 5: Set defaults for any remaining NULL values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'publish_tasks' 
    AND column_name = 'status'
  ) THEN
    UPDATE publish_tasks
    SET status = 'pending'
    WHERE status IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'publish_tasks' 
    AND column_name = 'state'
  ) THEN
    UPDATE publish_tasks
    SET state = 'pending'
    WHERE state IS NULL;
  END IF;
END $$;

-- Step 6: Change column types from varchar(50) to text if needed
-- PostgreSQL allows this conversion, but we'll do it safely
DO $$
BEGIN
  -- Check if status is varchar and convert to text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'publish_tasks' 
    AND column_name = 'status' 
    AND data_type = 'character varying'
  ) THEN
    ALTER TABLE publish_tasks ALTER COLUMN status TYPE text;
  END IF;

  -- Check if state is varchar and convert to text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'publish_tasks' 
    AND column_name = 'state' 
    AND data_type = 'character varying'
  ) THEN
    ALTER TABLE publish_tasks ALTER COLUMN state TYPE text;
  END IF;
END $$;

-- Step 7: Set defaults for both columns
ALTER TABLE publish_tasks
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE publish_tasks
  ALTER COLUMN state SET DEFAULT 'pending';

-- Step 8: Make columns NOT NULL (safe since we've backfilled all NULLs)
ALTER TABLE publish_tasks
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE publish_tasks
  ALTER COLUMN state SET NOT NULL;

