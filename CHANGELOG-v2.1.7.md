# CHANGELOG v2.1.7 — Audit Table & UI Bugfix

Perbaikan hasil audit dari v2.1.6:

- Judul halaman diperbaiki dari v2.1.3 menjadi v2.1.7.
- `package.json` version diperbaiki menjadi v2.1.7.
- Cache service worker dinaikkan ke v2.1.7.
- Export backup JSON version diperbaiki menjadi 2.1.7.
- Print footer diperbaiki menjadi v2.1.7.
- Riwayat resep diperkuat dengan escape HTML pada nama resep.
- Link sumber resep diperkuat agar hanya menerima URL http/https.
- Tombol hapus koleksi dan hapus resep dari koleksi dibuat lebih aman untuk nama koleksi yang memakai tanda petik.
- Ditambahkan SQL audit `supabase-migration-v2.1.7-schema-audit.sql` untuk memastikan tabel/kolom utama aplikasi lengkap.

Tidak ada perubahan konsep fitur besar. Ini fokus bugfix dan stabilisasi.
