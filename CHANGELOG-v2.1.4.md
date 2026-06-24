# CHANGELOG v2.1.4 — Foto Masakan Hero Image

## Perubahan utama

- Field **Foto Resep** diubah menjadi **Foto Masakan**.
- Foto Masakan sekarang menjadi foto utama/hero image untuk kartu resep dan detail resep.
- Field **Foto Tambahan** diubah menjadi **Foto Resep / Tambahan**.
- Foto Resep / Tambahan dipakai untuk catatan resep, screenshot, bahan, proses masak, atau foto pendukung lain.
- Label AI foto dirapikan menjadi **Foto Resep** karena bagian itu dipakai untuk membaca resep dari foto/catatan/screenshot.
- Teks kosong galeri diubah menjadi **Belum ada foto masakan**.
- Cache/version dinaikkan ke **v2.1.4**.

## Catatan

Tidak ada perubahan database. Kolom lama tetap dipakai:

- `foto_url` = Foto Masakan / hero image
- `foto_urls` = Foto Resep / Tambahan

Jadi data lama tetap aman dan tidak perlu SQL migration baru.
