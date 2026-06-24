-- ============================================
-- Migration v2.2.2: Penulis + Tanggal Dibuat + Last Edit
-- Jalankan di Supabase SQL Editor sebelum deploy v2.2.2.
-- Aman untuk database lama karena memakai IF NOT EXISTS.
-- ============================================

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS penulis_nama text DEFAULT '';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS penulis_email text DEFAULT '';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS last_edit_at timestamptz;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS last_edit_by_name text DEFAULT '';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS last_edit_by_email text DEFAULT '';

-- Pastikan data lama tetap punya tanggal yang bisa ditampilkan.
UPDATE recipes SET created_at = now() WHERE created_at IS NULL;
UPDATE recipes SET last_edit_at = created_at WHERE last_edit_at IS NULL;
UPDATE recipes SET penulis_nama = '' WHERE penulis_nama IS NULL;
UPDATE recipes SET penulis_email = '' WHERE penulis_email IS NULL;
UPDATE recipes SET last_edit_by_name = penulis_nama WHERE last_edit_by_name IS NULL OR last_edit_by_name = '';
UPDATE recipes SET last_edit_by_email = penulis_email WHERE last_edit_by_email IS NULL OR last_edit_by_email = '';

CREATE INDEX IF NOT EXISTS idx_recipes_last_edit_at ON recipes(last_edit_at DESC);
