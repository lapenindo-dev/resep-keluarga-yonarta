# Resep Keluarga Yonarta v2.0.1

## Perbaikan YouTube Import

- Memperbaiki pembacaan video ID YouTube dari format `youtu.be`, `watch?v=`, `shorts`, `embed`, dan `live`.
- Parser transcript YouTube dibuat lebih kuat dengan membaca `ytInitialPlayerResponse` terlebih dahulu.
- Menambahkan fallback ke endpoint `timedtext` untuk caption Indonesia/Inggris dan auto-caption.
- Pesan error dibuat lebih jelas kalau YouTube memblokir akses server Vercel.

## Catatan penting

YouTube kadang tetap memblokir pengambilan transcript otomatis dari server. Jika itu terjadi, gunakan tab **TikTok/Teks** lalu paste transcript manual dari YouTube.
