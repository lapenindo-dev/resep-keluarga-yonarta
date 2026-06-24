# Setup Fitur AI Qwen — v2.0.0

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
- **YouTube "tidak memiliki transcript"** → video tidak ada caption sama sekali, pakai tab "TikTok/Teks" untuk input manual
- **Error 401/403 dari Qwen** → API key salah atau belum aktif, cek di Alibaba Cloud Console


## v2.0.0 — AI Menu Generator

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
