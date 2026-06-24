# CHANGELOG v2.1.0 — Final Stabil

## Fokus update
Versi ini menggabungkan beberapa perbaikan besar dalam satu paket final, tanpa menambah lagi Menu Hemat atau Shopping List Pintar lanjutan.

## Perubahan utama
- UX tambah resep dirapikan menjadi: Manual, Foto, dan Teks / Caption.
- YouTube otomatis tetap dihapus. Resep dari YouTube diproses lewat paste transcript/caption manual di tab Teks / Caption.
- Tambah halaman Tools: Backup / Koleksi / Print.
- Tambah Export Backup JSON.
- Tambah Import / Restore Backup JSON.
- Tambah Koleksi / Folder Resep berbasis browser/local storage.
- Tambah koleksi default: Menu Harian, Menu Anak, Natal, Imlek, BBQ, Favorit Mama.
- Tambah tombol Print / PDF di detail resep.
- Print resep memakai format khusus yang lebih rapi untuk dapur.
- Cache dan version dinaikkan ke v2.1.0.

## Catatan teknis
- Koleksi disimpan di localStorage browser/HP.
- Backup JSON menyertakan recipes, masterIngredients, masterUnits, cookLog, mealPlan, recipeHistory, dan recipeCollections.
- Import backup akan menambahkan resep baru yang belum ada berdasarkan nama resep agar tidak mudah duplikat.
- Field database tidak ditambah agar tetap kompatibel dengan Supabase schema lama.
