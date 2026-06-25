# Resep Keluarga v3.0

Versi ini adalah rebuild UI/UX besar berdasarkan Master Product Bible Volume 1, Volume 2, dan Volume 3.

## Fokus Produk

Resep Keluarga diposisikan sebagai **Family Recipe Heritage App**: aplikasi untuk menyimpan, merapikan, membagikan, dan mewariskan resep keluarga.

Tagline utama:

> Simpan resep Mama hari ini, sebelum hanya tersisa kenangan.

## Struktur Navigasi v3.0

Bottom navigation hanya berisi aksi harian:

1. Beranda
2. Resep
3. Tambah
4. Rencana
5. Koleksi

Family Hub drawer berisi fitur sekunder dan trust layer:

- Family Profile
- Warisan
- Gallery
- Shopping List
- Backup
- Sharing
- AI Assistant
- Bantuan
- Privacy Policy
- Settings
- Master Bahan

## Catatan Kompatibilitas

Schema database utama tidak diubah agar data existing tetap aman. Field internal `catatan_yonarta` masih dipakai sebagai nama kolom database, tetapi label UI sudah diarahkan menjadi “Cerita di Balik Resep”.
