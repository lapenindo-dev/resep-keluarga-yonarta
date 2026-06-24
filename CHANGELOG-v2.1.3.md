# Resep Keluarga Yonarta v2.1.3

## Fokus update
Backup JSON disembunyikan dari user keluarga agar aplikasi lebih aman dan tidak membingungkan.

## Perubahan
- Menu utama `Backup / Koleksi / Print` diganti menjadi `Koleksi / Print`.
- Tab bawah `Tools` diganti label menjadi `Koleksi`.
- Panel `Backup Data` diberi status admin-only.
- Export/import JSON hanya bisa dipakai oleh email yang dimasukkan ke `ADMIN_EMAILS` di `app.js`.
- Default `ADMIN_EMAILS = []`, artinya backup disembunyikan dari semua user keluarga.
- Fungsi export/import tetap ada untuk kebutuhan admin/developer di masa depan.
- Version/cache dinaikkan ke v2.1.3.

## Catatan
Backup manual JSON tidak wajib untuk pemakaian harian karena data utama tersimpan di Supabase.
