# Resep Keluarga v3.1.2 — Force Light Modern UI

Perbaikan khusus untuk kasus laptop/browser memakai dark mode sehingga tampilan aplikasi masih terlihat gelap/kuno.

## Perubahan

- Memaksa `color-scheme: light only` pada root, body, form control, dan komponen utama.
- Menambahkan hard override untuk hero, topbar, card, form tambah resep, recipe card, Family Hub, dan bottom navigation.
- Mengganti theme color menjadi light.
- Mengubah service worker menjadi network-first/no-store dan menghapus cache lama saat activate.
- Menaikkan cache/link version ke `3.1.2-force-light`.

## Tujuan

Aplikasi tetap tampil light, clean, modern, dan premium walaupun device atau browser memakai dark mode.
