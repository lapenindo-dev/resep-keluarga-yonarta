# CHANGELOG v2.0.2 — YouTube Transcript Multi-Method

## Perbaikan
- Menambahkan metode otomatis tambahan untuk membaca transcript YouTube:
  - `youtube-transcript` package
  - `youtubei.js` / Innertube
  - parsing halaman watch/embed/youtube-nocookie
  - direct timedtext fallback
- Menambahkan kolom manual khusus di tab YouTube.
- Menambahkan tombol **Proses Teks Manual YouTube** agar hasil copy transcript tetap masuk sebagai sumber YouTube.
- Memperjelas pesan error YouTube.
- Cache/version dinaikkan ke v2.0.2.

## Catatan
YouTube bisa tetap memblokir server hosting seperti Vercel untuk video tertentu. Karena itu v2.0.2 memakai multi-metode plus fallback manual yang lebih mudah.
