# Resep Keluarga Yonarta v2.0.0

## Fokus Update

AI Menu Generator fleksibel jumlah hari.

## Perubahan Utama

- Tambah AI Menu Generator via endpoint `/api/generate-menu`.
- Jumlah hari bisa dipilih 1 sampai 7 hari.
- Slot menu tetap hanya Siang dan Malam, tanpa Pagi.
- Tombol jadwal diubah menjadi “Buat Menu dengan AI”.
- AI memilih resep berdasarkan mode: Random Semua, Favorit Keluarga, Menu Cepat, atau Menu Hemat.
- Menu yang sudah dikunci/lock tetap dipertahankan saat generate ulang.
- Jika AI belum aktif atau API gagal, aplikasi otomatis fallback ke generator random lokal supaya fitur tetap jalan.
- Shopping list otomatis mengikuti jumlah hari/menu yang sedang dibuat.
- Cache/service worker dinaikkan ke v2.0.0.

## Catatan

Tidak ada fitur scan foto/OCR baru yang ditambahkan pada versi ini.
Jika sebelumnya sudah menjalankan migrasi database, tidak perlu migrasi tambahan untuk v2.0.0.
