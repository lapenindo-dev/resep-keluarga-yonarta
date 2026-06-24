# CHANGELOG v2.1.8 - SQL Tag Type Fix

## Perbaikan
- Memperbaiki error SQL: `column "tag" is of type text[] but expression is of type jsonb`.
- File audit schema baru dibuat lebih aman untuk database lama yang memakai `tag` bertipe `text[]`.
- Migration sekarang menangani `tag` bertipe `text[]`, `jsonb`, atau `text` tanpa cast error.
- Version/cache dinaikkan ke v2.1.8.

## File SQL yang perlu dijalankan
- `supabase-migration-v2.1.8-schema-audit-fix.sql`
