# Resep Keluarga Yonarta v1.9.1

## Fitur utama

- Meal Planner mingguan dengan slot Siang dan Malam.
- Slot Pagi dihapus sesuai kebutuhan keluarga.
- Jadwal menu otomatis tersimpan di browser/HP.
- Lock menu per slot agar tidak ikut berubah saat acak ulang.
- Copy jadwal menu ke teks.
- Shopping List otomatis dari bahan terstruktur resep.
- Penggabungan bahan berdasarkan nama bahan + satuan.
- Checklist belanja, copy teks, dan share ke WhatsApp.
- Dashboard statistik: total resep, favorit, rating 5 bintang, total kali masak, jenis terbanyak, sumber terbanyak, resep paling sering dimasak, ringkasan koleksi, dan aktivitas 7 hari terakhir.

## Catatan database

Jika sebelumnya sudah menjalankan migrasi v1.3.0, tidak perlu migrasi tambahan untuk v1.9.1.
Fitur Meal Planner disimpan lokal di browser/HP, sedangkan statistik masak memakai tabel `cook_log`.
