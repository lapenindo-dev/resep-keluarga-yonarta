# Changelog v2.2.3 — Manual Penulis + Save Atas

## Perubahan

- Nama penulis resep sekarang diisi manual melalui field **Nama Penulis Resep**.
- Timestamp **Tanggal Dibuat** tetap otomatis memakai `created_at`.
- Timestamp **Last Edit** tetap otomatis memakai `last_edit_at`.
- Tampilan audit resep tidak lagi mengandalkan nama login sebagai penulis resep.
- Saat membuka halaman tambah/edit resep, posisi scroll otomatis dimulai dari bagian paling atas.
- Ditambahkan tombol **Simpan Resep** di bagian atas form.
- Tombol **Simpan Resep** di bagian bawah tetap dipertahankan.

## Database

- Tidak perlu SQL migration baru jika `supabase-migration-v2.2.2-author-timestamps.sql` sudah dijalankan.
