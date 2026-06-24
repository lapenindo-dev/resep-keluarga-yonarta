# CHANGELOG v2.0.3 — YouTube Auto Removed

## Perubahan utama
- Fitur ambil transcript YouTube otomatis dihapus karena tidak stabil di Vercel/server hosting.
- Tab AI sekarang hanya: Foto dan Teks/Caption.
- Teks/Caption bisa dipakai untuk paste caption TikTok, transcript YouTube manual, catatan resep, atau teks resep lain.
- Tambah pilihan sumber saat memproses teks: AI / YouTube / Manual.
- Dependency YouTube (`youtube-transcript`, `youtubei.js`) dihapus dari `package.json`.
- Endpoint `/api/extract-recipe` hanya menerima mode `photo` dan `text`.
- Cache/version dinaikkan ke v2.0.3.

## Catatan
Jika resep berasal dari YouTube, copy transcript/caption secara manual lalu paste ke tab Teks/Caption dan pilih sumber `YouTube`.
