-- ============================================
-- Migration v2.1.1: Login Email + RLS Authenticated Only
-- Jalankan di Supabase SQL Editor setelah mengaktifkan Supabase Auth Email.
-- Tujuan: user anonim tidak bisa baca/tambah/edit/hapus data.
-- Semua user yang sudah login dapat berbagi data resep keluarga yang sama.
-- ============================================

-- 1. Aktifkan Row Level Security
ALTER TABLE IF EXISTS recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS master_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS master_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cook_log ENABLE ROW LEVEL SECURITY;

-- 2. Hapus policy lama jika ada
DROP POLICY IF EXISTS "recipes_authenticated_all" ON recipes;
DROP POLICY IF EXISTS "master_ingredients_authenticated_all" ON master_ingredients;
DROP POLICY IF EXISTS "master_units_authenticated_all" ON master_units;
DROP POLICY IF EXISTS "cook_log_authenticated_all" ON cook_log;

-- 3. Izinkan hanya user login untuk akses data aplikasi
CREATE POLICY "recipes_authenticated_all"
ON recipes FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "master_ingredients_authenticated_all"
ON master_ingredients FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "master_units_authenticated_all"
ON master_units FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "cook_log_authenticated_all"
ON cook_log FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Storage policy untuk bucket foto resep
-- Pastikan bucket recipe-photos sudah ada.
DROP POLICY IF EXISTS "recipe_photos_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "recipe_photos_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "recipe_photos_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "recipe_photos_authenticated_delete" ON storage.objects;

CREATE POLICY "recipe_photos_authenticated_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'recipe-photos');

CREATE POLICY "recipe_photos_authenticated_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recipe-photos');

CREATE POLICY "recipe_photos_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'recipe-photos')
WITH CHECK (bucket_id = 'recipe-photos');

CREATE POLICY "recipe_photos_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'recipe-photos');

-- Catatan:
-- Jika foto sebelumnya memakai public URL dan bucket dibuat public, foto lama mungkin tetap bisa terlihat melalui URL langsung.
-- Untuk keamanan penuh, ubah bucket menjadi private dan gunakan signed URL. Versi ini fokus menutup akses aplikasi/data dari anonymous user.
