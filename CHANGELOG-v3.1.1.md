# Resep Keluarga v3.1.1 — Hard Modern Light UI Override

Perbaikan setelah v3.1.0 masih menampilkan nuansa lama/gelap-coklat.

## Fix

- Cache busting `style.css?v=3.1.1` dan `app.js?v=3.1.1`.
- Service worker cache dinaikkan ke `resep-keluarga-v3.1.1`.
- Menambahkan hard override CSS di bagian paling akhir stylesheet agar style lama tidak menang.
- Mengubah tone UI menjadi lebih light, clean, premium, dan modern.
- Menghapus dominasi coklat gelap pada header, pilihan sumber resep, card, Family Hub, dan bottom nav.
- Memperkuat tampilan capture-first untuk foto/caption sebagai input utama.

## Catatan

Jika setelah deploy masih terlihat UI lama, clear cache/site data Chrome atau uninstall-install PWA karena service worker lama masih bisa menahan asset lama.
