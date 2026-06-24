# Setup Fitur AI Qwen — v2.1.7

## 1. Daftar & Dapatkan API Key Qwen
1. Buka https://www.alibabacloud.com/help/en/model-studio/get-api-key
2. Daftar/login Alibaba Cloud, aktifkan "Model Studio"
3. Buat API Key (format: `sk-xxxxxxxx`)
4. Simpan key ini — JANGAN taruh di kode, JANGAN share ke siapa pun

## 2. Tambah Environment Variable di Vercel
1. Buka project di vercel.com → tab **Settings** → **Environment Variables**
2. Tambah variable baru:
   - **Name**: `DASHSCOPE_API_KEY`
   - **Value**: (paste API key dari langkah 1)
   - **Environment**: pilih semua (Production, Preview, Development)
3. Klik **Save**

## 3. Upload Semua File ke GitHub
Termasuk folder `api/` dan `package.json` — ini WAJIB ada supaya Vercel bisa menjalankan fungsi server-nya.

```
index.html
app.js
style.css
manifest.json
sw.js
package.json          ← baru
icons/
api/
  extract-recipe.js    ← baru (fungsi server)
```

## 4. Redeploy
Setelah Environment Variable ditambah, Vercel butuh **redeploy** agar variable terbaca:
- Push ulang ke GitHub (otomatis trigger deploy), ATAU
- Di Vercel dashboard → Deployments → klik "..." → Redeploy

## 5. Testing
1. Buka app → Tambah Resep
2. Coba tab **📷 Foto** dulu (paling mudah) — upload foto resep apa saja
3. Tunggu 10-20 detik, form akan otomatis terisi
4. Periksa & lengkapi sebelum klik Simpan

## Biaya
Qwen API berbayar per-token (sangat murah, ~$0.3-2 per 1 juta token).
Untuk pemakaian keluarga (beberapa resep per minggu), biayanya kemungkinan
di bawah $1/bulan. Cek dashboard Alibaba Cloud Model Studio untuk monitor pemakaian.

## Troubleshooting
- **"DASHSCOPE_API_KEY belum diset"** → cek langkah 2, pastikan sudah redeploy
- **Resep dari video** → copy caption/transcript manual lalu paste ke tab "Teks / Caption"
- **Error 401/403 dari Qwen** → API key salah atau belum aktif, cek di Alibaba Cloud Console


## v2.1.7 — AI Menu Generator

Endpoint baru:

- `/api/generate-menu`

Fungsi:

- Membuat jadwal menu 1–7 hari.
- Slot tetap Siang dan Malam.
- Menggunakan daftar resep yang sudah tersimpan.
- Menghormati menu yang dikunci/lock.
- Jika AI gagal atau env belum aktif, aplikasi otomatis fallback ke generator random lokal.

Environment variable yang dipakai tetap sama:

```
DASHSCOPE_API_KEY=isi_api_key_dashscope_anda
```


## Catatan Teks/Caption v2.1.7

Fitur ambil transcript YouTube otomatis sudah dihapus karena tidak stabil di Vercel/server hosting.

Cara input resep dari video:

1. Buka video YouTube/TikTok.
2. Copy caption/transcript/teks resep secara manual.
3. Paste ke tab **Teks / Caption**.
4. Pilih sumber: `AI`, `YouTube`, atau `Manual`.
5. Klik **Rapikan dengan AI**.

Tidak ada dependency tambahan untuk YouTube di `package.json`.


## Login Email / Proteksi Akses v2.1.7

Versi ini memakai Supabase Auth email magic link. Setelah upload versi ini:

1. Buka Supabase Dashboard → Authentication → Providers → Email.
2. Aktifkan Email provider.
3. Untuk membatasi agar tidak sembarang orang bisa daftar, buka Authentication → Sign In / Providers dan matikan open signup bila tersedia, atau buat user keluarga secara manual dari Authentication → Users → Invite user.
4. Jalankan file SQL `supabase-migration-v2.1.1-auth-rls.sql` di Supabase SQL Editor.
5. Pastikan semua email keluarga yang boleh masuk sudah diundang/dibuat di Supabase Auth.

Catatan: policy SQL v2.1.7 membuat hanya user yang sudah login yang bisa baca/tambah/edit/hapus data. Semua user login keluarga berbagi data resep yang sama.

## Share Aplikasi

Tombol share tersedia di header dan beranda. Tombol ini membagikan link aplikasi ke WhatsApp/Telegram/dll, atau menyalin link bila browser tidak mendukung native share.


## Login keluarga v2.1.7

Jika muncul error `Signups not allowed for otp`, itu bukan error Qwen. Artinya Supabase menolak Magic Link karena email belum dibuat atau signup/OTP dibatasi.

Cara paling aman untuk aplikasi keluarga:

1. Buka Supabase Dashboard.
2. Masuk ke **Authentication → Users**.
3. Klik **Add user / Create new user**.
4. Masukkan email anggota keluarga.
5. Buat password sementara.
6. Pastikan user dalam kondisi confirmed.
7. Login di aplikasi memakai email + password tersebut.

Magic Link tetap tersedia, tetapi hanya disarankan untuk email yang sudah terdaftar. Untuk mencegah orang sembarang masuk, jangan aktifkan open signup umum kecuali Anda memang ingin semua email bisa daftar sendiri.


---

## v2.1.7 - Backup JSON disembunyikan dari user keluarga

Backup / Import JSON tidak wajib untuk pemakaian harian karena data utama tersimpan di Supabase.

Perubahan keamanan UX:
- Tombol Backup JSON disembunyikan dari user keluarga.
- Halaman utama hanya menampilkan Koleksi / Print, bukan Backup.
- Export/import JSON tetap ada di kode, tetapi hanya muncul jika email login dimasukkan ke daftar admin di `app.js`.

Cara membuka backup untuk admin jika suatu hari diperlukan:
1. Buka file `app.js`.
2. Cari baris:

```js
const ADMIN_EMAILS = [];
```

3. Isi email admin, contoh:

```js
const ADMIN_EMAILS = ['admin@email.com'];
```

4. Upload ulang file. Setelah login memakai email tersebut, panel Backup Data Admin akan muncul di halaman Koleksi / Print.

Untuk istri/keluarga, biarkan `ADMIN_EMAILS = []` agar tidak ada tombol backup/import yang membingungkan atau berisiko salah restore.


## Update v2.1.7

- Field **Foto Resep** diubah menjadi **Foto Masakan** untuk hero image/kartu resep.
- Field **Foto Tambahan** diubah menjadi **Foto Resep / Tambahan** untuk catatan resep, screenshot, bahan, proses masak, atau foto tambahan.
- YouTube otomatis tetap tidak dipakai. Transcript/caption tetap lewat input teks manual.
