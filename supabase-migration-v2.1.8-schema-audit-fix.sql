-- ============================================
-- Migration v2.1.8: Schema Audit + Tag Type Fix
-- Jalankan di Supabase SQL Editor.
-- Aman untuk database lama karena memakai IF NOT EXISTS.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabel utama resep
CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  nama_resep text NOT NULL,
  bahan_utama text DEFAULT '',
  jenis_hidangan text DEFAULT '',
  durasi_menit integer,
  porsi integer,
  status text DEFAULT 'Belum Dicoba',
  rating_keluarga integer DEFAULT 0,
  bahan jsonb DEFAULT '[]'::jsonb,
  cara_memasak jsonb DEFAULT '[]'::jsonb,
  tag text[] DEFAULT ARRAY[]::text[],
  catatan_yonarta text DEFAULT '',
  link_sumber text DEFAULT '',
  foto_url text,
  foto_urls jsonb DEFAULT '[]'::jsonb,
  dimasak_oleh text DEFAULT '',
  sumber_resep text DEFAULT 'Manual'
);

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS nama_resep text;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS bahan_utama text DEFAULT '';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS jenis_hidangan text DEFAULT '';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS durasi_menit integer;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS porsi integer;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS status text DEFAULT 'Belum Dicoba';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS rating_keluarga integer DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS bahan jsonb DEFAULT '[]'::jsonb;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cara_memasak jsonb DEFAULT '[]'::jsonb;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS tag text[] DEFAULT ARRAY[]::text[];
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS catatan_yonarta text DEFAULT '';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS link_sumber text DEFAULT '';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS foto_url text;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS foto_urls jsonb DEFAULT '[]'::jsonb;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS dimasak_oleh text DEFAULT '';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS sumber_resep text DEFAULT 'Manual';

-- Isi default untuk data lama yang masih NULL
UPDATE recipes SET bahan = '[]'::jsonb WHERE bahan IS NULL;
UPDATE recipes SET cara_memasak = '[]'::jsonb WHERE cara_memasak IS NULL;
-- Kolom tag di beberapa database lama bertipe text[], sedangkan draft audit sebelumnya memakai jsonb.
-- Blok ini aman untuk text[] / jsonb / text dan tidak akan error cast.
DO $$
DECLARE
  tag_udt text;
BEGIN
  SELECT udt_name INTO tag_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'tag';

  IF tag_udt = '_text' THEN
    UPDATE recipes SET tag = ARRAY[]::text[] WHERE tag IS NULL;
    ALTER TABLE recipes ALTER COLUMN tag SET DEFAULT ARRAY[]::text[];
  ELSIF tag_udt = 'jsonb' THEN
    UPDATE recipes SET tag = '[]'::jsonb WHERE tag IS NULL;
    ALTER TABLE recipes ALTER COLUMN tag SET DEFAULT '[]'::jsonb;
  ELSIF tag_udt = 'text' THEN
    UPDATE recipes SET tag = '' WHERE tag IS NULL;
    ALTER TABLE recipes ALTER COLUMN tag SET DEFAULT '';
  END IF;
END $$;
UPDATE recipes SET foto_urls = '[]'::jsonb WHERE foto_urls IS NULL;
UPDATE recipes SET status = 'Belum Dicoba' WHERE status IS NULL;
UPDATE recipes SET rating_keluarga = 0 WHERE rating_keluarga IS NULL;
UPDATE recipes SET sumber_resep = 'Manual' WHERE sumber_resep IS NULL OR sumber_resep = '';

-- 2. Master bahan
CREATE TABLE IF NOT EXISTS master_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  nama_bahan text NOT NULL,
  kategori_bahan text DEFAULT 'Lainnya'
);
ALTER TABLE master_ingredients ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE master_ingredients ADD COLUMN IF NOT EXISTS kategori_bahan text DEFAULT 'Lainnya';
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_ingredients_nama_lower ON master_ingredients (lower(nama_bahan));

-- 3. Master satuan
CREATE TABLE IF NOT EXISTS master_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  nama_satuan text NOT NULL
);
ALTER TABLE master_units ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_units_nama_lower ON master_units (lower(nama_satuan));

-- 4. Log masak
CREATE TABLE IF NOT EXISTS cook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,
  cooked_at timestamptz DEFAULT now()
);

-- 5. Index performa ringan
CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_bahan_utama ON recipes(bahan_utama);
CREATE INDEX IF NOT EXISTS idx_recipes_sumber_resep ON recipes(sumber_resep);
CREATE INDEX IF NOT EXISTS idx_cook_log_recipe ON cook_log(recipe_id);
CREATE INDEX IF NOT EXISTS idx_cook_log_date ON cook_log(cooked_at DESC);

-- 6. Bucket foto. App memakai getPublicUrl, jadi bucket baru dibuat public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-photos', 'recipe-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 7. RLS: hanya user login yang boleh akses tabel.
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE cook_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipes_authenticated_all" ON recipes;
DROP POLICY IF EXISTS "master_ingredients_authenticated_all" ON master_ingredients;
DROP POLICY IF EXISTS "master_units_authenticated_all" ON master_units;
DROP POLICY IF EXISTS "cook_log_authenticated_all" ON cook_log;

CREATE POLICY "recipes_authenticated_all" ON recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "master_ingredients_authenticated_all" ON master_ingredients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "master_units_authenticated_all" ON master_units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cook_log_authenticated_all" ON cook_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. Storage RLS untuk bucket recipe-photos.
DROP POLICY IF EXISTS "recipe_photos_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "recipe_photos_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "recipe_photos_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "recipe_photos_authenticated_delete" ON storage.objects;

CREATE POLICY "recipe_photos_authenticated_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'recipe-photos');
CREATE POLICY "recipe_photos_authenticated_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'recipe-photos');
CREATE POLICY "recipe_photos_authenticated_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'recipe-photos') WITH CHECK (bucket_id = 'recipe-photos');
CREATE POLICY "recipe_photos_authenticated_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'recipe-photos');
