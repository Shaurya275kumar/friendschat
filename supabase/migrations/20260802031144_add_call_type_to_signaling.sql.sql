ALTER TABLE call_signaling ADD COLUMN IF NOT EXISTS call_type text DEFAULT 'audio';
