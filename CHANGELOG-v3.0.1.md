# Resep Keluarga v3.0.1 — MPB Alignment Fix

Perbaikan setelah audit terhadap Master Product Bible Volume 1, 2, dan 3.

## Fix utama

- Family Hub Drawer dibuat benar-benar aktif, bisa dibuka dari tombol rumah di header, ditutup via tombol X, tap backdrop, atau tombol Escape.
- Bottom navigation dikunci menjadi 5 item: Beranda, Resep, Tambah, Rencana, Koleksi.
- Fitur sekunder dipindahkan ke Family Hub: Family Profile, Warisan, Gallery, Shopping List, Backup, Sharing, AI Assistant, Bantuan, Privacy, Settings, dan Master Bahan.
- Header dibuat lebih ringkas supaya tidak terlalu boros ruang mobile.
- Form Tambah Resep dibuat bertahap: pilih asal resep dulu, isi data inti, lalu detail opsional bisa dibuka manual.
- Recipe card dipadatkan: menghapus metadata “biasanya dimasak oleh” dari kartu, menjaga foto square, tombol edit/hapus sejajar.
- Menghapus sisa tampilan/copy lama seperti “Yonarta” dan “Warisan Keluarga / Prit”.
- Service worker cache dinaikkan ke `resep-keluarga-v3.0.1` agar browser tidak terus membaca cache lama.

## Catatan

Schema database tidak diubah. Field internal lama seperti `catatan_yonarta` tetap dipakai agar database existing tidak rusak, tetapi UI tetap menggunakan label “Cerita di Balik Resep”.
