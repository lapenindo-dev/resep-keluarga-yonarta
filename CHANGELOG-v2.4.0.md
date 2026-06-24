# Changelog v2.4.0 — Tema Sentimental Resep Keluarga

Update besar positioning aplikasi menjadi **Resep Keluarga** dengan fokus sentimental: menyimpan resep Mama, Oma, dan keluarga agar tidak hilang dan bisa diwariskan ke anak cucu.

## Perubahan Utama
- Headline beranda diganti menjadi: **“Simpan resep Mama hari ini, sebelum hanya tersisa kenangan.”**
- Beranda kini memiliki hero section hangat dengan subheadline tentang resep keluarga yang sering hilang karena tidak pernah ditulis.
- Wording aplikasi diubah dari nuansa dashboard teknis menjadi buku resep keluarga digital.
- Tombol utama menjadi **Simpan Resep Keluarga**.
- Label menu koleksi diarahkan menjadi **Warisan Keluarga**.

## Form Resep
- “Nama Penulis Resep” diganti menjadi **Resep dari Siapa**.
- “Siapa yang Masak” diganti menjadi **Siapa yang Biasanya Masak**.
- “Sumber Resep” diganti menjadi **Asal Resep**.
- “Tag” diganti menjadi **Label Kenangan**.
- “Catatan Yonarta” diganti menjadi **Cerita di Balik Resep**.
- Placeholder dibuat lebih sentimental agar user terdorong mencatat kenangan resep.

## Detail Resep
- Penulis, tanggal simpan, dan terakhir dirawat tampil di halaman detail saja, tepat di bawah foto resep.
- Audit tidak lagi tampil di kartu resep beranda/daftar agar kartu lebih bersih dan ringan.
- Detail resep menampilkan section khusus **Cerita di Balik Resep**.
- Label detail disesuaikan: Asal Resep, Biasanya Dimasak Oleh, Label Kenangan.

## Beranda dan Koleksi
- Maksimal resep awal di beranda dibatasi menjadi 6 item agar loading awal lebih ringan.
- Statistik dan dashboard diberi copywriting lebih hangat.
- Default koleksi baru: Resep Mama, Resep Oma, Menu Harian, Menu Anak, Hari Raya, Favorit Rumah.

## Share dan PWA
- Teks share resep kini membawa positioning Resep Keluarga dan tagline utama.
- Manifest PWA diperbarui dengan deskripsi sentimental dan warna tema Resep Keluarga.

## Catatan Teknis
- Tidak membutuhkan perubahan database baru. Field sentimental memakai kolom yang sudah ada agar aman untuk Supabase versi saat ini.
