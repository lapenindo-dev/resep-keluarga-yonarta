# Resep Keluarga v3.1.3 — Desktop Responsive Fix

- Memaksa light modern UI pada desktop/laptop walaupun OS/browser memakai dark mode.
- Mengganti stylesheet ke file baru `style-v313.css` agar tidak tertahan cache `style.css` lama.
- Menambahkan critical CSS langsung di `index.html` agar hero/header tidak kembali ke dark brown lama.
- Memperbaiki layout desktop: header lebih pendek, hero tidak terpotong, konten max-width 980px, quick cards 4 kolom, bottom nav floating capsule.
- Memperbarui service worker cache ke v3.1.3 dan memaksa reload untuk CSS/JS/HTML.
