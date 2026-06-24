# CHANGELOG v2.1.1 — Login Email + Share Aplikasi

## Update utama

- Tambah layar login email menggunakan Supabase Auth magic link.
- Aplikasi dikunci sampai user login.
- Tambah tombol logout.
- Tambah tombol kecil share aplikasi di header.
- Tambah tombol share aplikasi di beranda.
- Share aplikasi memakai native share bila tersedia, fallback copy link / WhatsApp.
- Tambah SQL migration untuk RLS agar data hanya bisa diakses user yang sudah login.
- Cache/version dinaikkan ke v2.1.1.

## Catatan keamanan

- Frontend login saja belum cukup jika RLS belum aktif.
- Jalankan `supabase-migration-v2.1.1-auth-rls.sql` agar akses anonim benar-benar tertutup.
- Untuk keluarga, undang email keluarga di Supabase Auth.
