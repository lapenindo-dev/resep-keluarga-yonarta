-- ============================================
-- Migration v1.3.0: Multi-foto, Siapa Masak, Statistik
-- Jalankan di Supabase SQL Editor, lalu klik Run
-- ============================================

-- 1. Tambah kolom foto_urls (galeri foto tambahan, array)
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS foto_urls JSONB DEFAULT '[]'::jsonb;

-- 2. Tambah kolom siapa yang masak
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS dimasak_oleh TEXT DEFAULT '';

-- 3. Tabel baru untuk catat riwayat "sudah dimasak" (buat statistik)
CREATE TABLE IF NOT EXISTS cook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,
  cooked_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cook_log_recipe ON cook_log(recipe_id);
CREATE INDEX IF NOT EXISTS idx_cook_log_date ON cook_log(cooked_at);
