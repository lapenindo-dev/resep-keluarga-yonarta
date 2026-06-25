# Resep Keluarga v3.0.0

Dibangun ulang mengikuti Master Product Bible Volume 1, Volume 2, dan Volume 3.

## Perubahan Utama

- Mengubah identitas aplikasi menjadi **Resep Keluarga v3.0** sebagai Family Recipe Heritage App.
- Menyederhanakan bottom navigation menjadi 5 aksi harian: Beranda, Resep, Tambah, Rencana, Koleksi.
- Menambahkan **Family Hub drawer** sebagai rumah digital keluarga untuk Family Profile, Warisan, Gallery, Shopping List, Backup, Sharing, AI Assistant, Bantuan, Privacy, Settings, dan Master Bahan.
- Menambahkan pilihan asal resep berbentuk kartu: Keluarga, Warisan, Internet, Teman, dan Kreasi sendiri.
- Menambahkan halaman trust: Backup & Export, Sharing Keluarga, Privacy Policy Ringkas, dan Bantuan Singkat.
- Menambahkan halaman Warisan yang menampilkan resep berlabel Warisan atau koleksi bernuansa keluarga.
- Mengubah visual layer menjadi warm utility: cream/off-white, brown/amber, radius modern, card ringkas, dan recipe photo square.
- Menjaga keputusan UX: author dan last edit tetap di detail resep, bukan di card beranda.
- Menjaga AI sebagai asisten perapihan resep, bukan pusat produk.

## Catatan Teknis

- Supabase URL/key tetap mengikuti baseline terakhir yang diupload.
- Struktur database utama tidak diubah agar kompatibel dengan data existing.
- Kolom lama seperti `catatan_yonarta` tetap dipertahankan sebagai field database internal agar tidak merusak schema existing, walaupun label UI sudah menjadi Cerita di Balik Resep.
- Service worker cache name diperbarui ke `resep-keluarga-v3.0.0`.
