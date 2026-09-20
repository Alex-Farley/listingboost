-- Persist the exact provider-neutral generation request so an async worker can
-- resume from a generation_job ID without relying on browser state or queue payloads.
ALTER TABLE generation_jobs ADD COLUMN specification_json TEXT;
ALTER TABLE generation_jobs ADD COLUMN strategy_json TEXT;
