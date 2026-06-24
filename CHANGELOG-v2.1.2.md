# CHANGELOG v2.1.2

## Login Supabase diperbaiki

- Login utama diubah menjadi email + password.
- Magic Link tetap tersedia sebagai opsi kedua.
- Pesan error `Signups not allowed for otp` dibuat lebih jelas.
- Panduan setup Supabase Auth ditambahkan ke dokumentasi.
- Cache/version naik ke v2.1.2.

Catatan: untuk aplikasi keluarga yang tertutup, buat user keluarga dulu di Supabase Authentication → Users. Jangan mengaktifkan open signup bila tidak ingin sembarang orang bisa daftar.
