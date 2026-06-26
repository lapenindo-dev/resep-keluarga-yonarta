// /api/extract-recipe.js
// Vercel Serverless Function — secure AI recipe extraction proxy.
// Supports: photo OCR, pasted text/caption, and richer web-link extraction.

const DASHSCOPE_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

const RECIPE_SCHEMA_PROMPT = `Kamu adalah asisten ekstraksi resep untuk aplikasi Resep Keluarga.
Keluarkan HANYA JSON valid (tanpa markdown, tanpa backtick, tanpa penjelasan tambahan) dengan skema persis seperti ini:

{
  "nama_resep": "string",
  "bahan_utama": "salah satu dari: Babi, Ayam, Sapi, Seafood, Sayur, Telur, Tahu dan Tempe, Lainnya",
  "jenis_hidangan": "salah satu dari: Nasi, Mie, Sup dan Kuah, Goreng, Panggang, Tumis, Cemilan, Dessert, Saus dan Bumbu, Minuman, Lainnya",
  "durasi_menit": angka_atau_null,
  "porsi": angka_atau_null,
  "bahan": [
    { "nama_grup": "Bahan Utama", "items": [ { "nama_bahan": "string", "jumlah": angka_atau_string, "satuan": "string" } ] }
  ],
  "cara_memasak": ["langkah 1", "langkah 2"],
  "tag": ["tag1", "tag2"],
  "foto_url": "string_atau_null",
  "link_sumber": "string_atau_null",
  "catatan_sumber": "string_atau_null"
}

Aturan penting:
- Ambil bahan, langkah, durasi, porsi, gambar, dan konteks sumber jika tersedia.
- Untuk YouTube, gunakan transcript/deskripsi bila ada. Jika hanya judul tersedia, jangan mengarang bahan/langkah.
- Gunakan Bahasa Indonesia untuk semua isi teks.
- Jika informasi tidak tersedia/tidak jelas, isi null atau array kosong [].`;

function decodeHtml(str = '') {
  return String(str)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(Number(n)); } catch { return _; } })
    .trim();
}

function extractJson(text) {
  let cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  try { return JSON.parse(cleaned); } catch (e) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e2) {}
    }
    throw new Error('Gagal parsing JSON dari respons AI');
  }
}

async function callQwen({ model, messages }) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY belum diset di Environment Variables Vercel.');

  const resp = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.18, max_tokens: 3000 })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Qwen API error (${resp.status}): ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Respons Qwen kosong.');
  return content;
}

function isBlockedHost(hostname = '') {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === '::1' || host.startsWith('[')) return true;
  return false;
}

function absoluteUrl(url, base) {
  if (!url) return '';
  try { return new URL(decodeHtml(url), base).href; } catch { return ''; }
}

function cleanHtmlToText(html = '') {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/li>|<\/h\d>|<\/div>|<\/section>|<\/article>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pickMeta(html = '', name = '') {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i');
  return decodeHtml(html.match(re1)?.[1] || html.match(re2)?.[1] || '');
}

function extractJsonLdRecipes(html = '') {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => decodeHtml(m[1].trim()));
  const hits = [];
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object') return;
    const type = node['@type'];
    const typeText = Array.isArray(type) ? type.join(' ') : String(type || '');
    if (/Recipe/i.test(typeText)) hits.push(node);
    Object.keys(node).forEach(k => { if (k === '@graph' || typeof node[k] === 'object') walk(node[k]); });
  }
  for (const raw of blocks) { try { walk(JSON.parse(raw)); } catch(e) {} }
  return hits.slice(0, 5);
}

function normalizeInstructionText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(normalizeInstructionText).filter(Boolean).join('\n');
  if (typeof value === 'object') return value.text || value.name || normalizeInstructionText(value.itemListElement);
  return '';
}

function normalizeImageValue(image, base) {
  if (!image) return '';
  if (typeof image === 'string') return absoluteUrl(image, base);
  if (Array.isArray(image)) return normalizeImageValue(image[0], base);
  if (typeof image === 'object') return absoluteUrl(image.url || image.contentUrl || image.thumbnailUrl, base);
  return '';
}

function compactRecipeSchema(recipe, baseUrl) {
  if (!recipe || typeof recipe !== 'object') return '';
  const out = {
    name: recipe.name,
    description: recipe.description,
    author: typeof recipe.author === 'string' ? recipe.author : recipe.author?.name,
    image: normalizeImageValue(recipe.image, baseUrl),
    recipeYield: recipe.recipeYield,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTime: recipe.totalTime,
    recipeIngredient: recipe.recipeIngredient,
    recipeInstructions: normalizeInstructionText(recipe.recipeInstructions),
    keywords: recipe.keywords,
    recipeCategory: recipe.recipeCategory,
    recipeCuisine: recipe.recipeCuisine
  };
  return JSON.stringify(out, null, 2).slice(0, 9000);
}

function extractImageCandidates(html = '', baseUrl = '', schemaRecipes = []) {
  const urls = [];
  for (const r of schemaRecipes) {
    const img = normalizeImageValue(r.image, baseUrl);
    if (img) urls.push(img);
  }
  ['og:image', 'twitter:image', 'image'].forEach(key => {
    const img = pickMeta(html, key);
    if (img) urls.push(absoluteUrl(img, baseUrl));
  });
  for (const m of html.matchAll(/<img[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]*>/gi)) {
    const u = absoluteUrl(m[1], baseUrl);
    if (u && !/logo|avatar|icon|sprite|placeholder|blank/i.test(u)) urls.push(u);
    if (urls.length > 8) break;
  }
  return [...new Set(urls.filter(Boolean))].slice(0, 8);
}

function getYoutubeId(inputUrl) {
  try {
    const u = new URL(inputUrl);
    if (/youtu\.be$/i.test(u.hostname)) return u.pathname.split('/').filter(Boolean)[0] || '';
    if (/youtube\.com$/i.test(u.hostname) || /(^|\.)youtube\.com$/i.test(u.hostname)) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex(p => ['shorts','embed','live'].includes(p));
      if (idx >= 0 && parts[idx+1]) return parts[idx+1];
    }
  } catch {}
  return '';
}

function extractBalancedJsonAfter(text, marker) {
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const start = text.indexOf('{', idx);
  if (start < 0) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

async function fetchYoutubeSource(parsed) {
  const videoId = getYoutubeId(parsed.href);
  let title = '', channel = '', description = '', thumbnail = '', transcript = '';
  try {
    const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(parsed.href)}`, { headers: { 'User-Agent': 'Mozilla/5.0 ResepKeluargaBot/1.0' } });
    if (oembed.ok) {
      const data = await oembed.json();
      title = data.title || title;
      channel = data.author_name || channel;
      thumbnail = data.thumbnail_url || thumbnail;
    }
  } catch {}

  if (videoId) {
    try {
      const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=id&gl=ID`;
      const resp = await fetch(watchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept-Language': 'id,en;q=0.9' } });
      if (resp.ok) {
        const html = await resp.text();
        const raw = extractBalancedJsonAfter(html, 'ytInitialPlayerResponse');
        if (raw) {
          const player = JSON.parse(raw);
          title = player.videoDetails?.title || title;
          channel = player.videoDetails?.author || channel;
          description = player.videoDetails?.shortDescription || description;
          const thumbs = player.videoDetails?.thumbnail?.thumbnails || [];
          if (!thumbnail && thumbs.length) thumbnail = thumbs[thumbs.length - 1].url;
          const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          const preferred = tracks.find(t => /id|indonesia/i.test(`${t.languageCode} ${t.name?.simpleText || ''}`)) || tracks.find(t => /en/i.test(t.languageCode || '')) || tracks[0];
          if (preferred?.baseUrl) {
            const capUrl = preferred.baseUrl + (preferred.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
            const capResp = await fetch(capUrl, { headers: { 'User-Agent': 'Mozilla/5.0 ResepKeluargaBot/1.0' } });
            if (capResp.ok) {
              const txt = await capResp.text();
              try {
                const json = JSON.parse(txt);
                transcript = (json.events || []).map(ev => (ev.segs || []).map(s => s.utf8 || '').join('')).join(' ')
                  .replace(/\s+/g, ' ').trim();
              } catch {
                transcript = cleanHtmlToText(txt);
              }
            }
          }
        }
      }
    } catch {}
  }

  return {
    text: [
      `URL: ${parsed.href}`,
      'Jenis sumber: YouTube/video.',
      `Video ID: ${videoId || '-'}`,
      `Judul: ${title || '-'}`,
      `Channel: ${channel || '-'}`,
      thumbnail ? `Gambar utama: ${thumbnail}` : '',
      description ? `Deskripsi video:\n${description.slice(0, 7000)}` : '',
      transcript ? `Transcript/caption video:\n${transcript.slice(0, 18000)}` : 'Transcript/caption video: tidak tersedia atau tidak bisa diakses dari server.'
    ].filter(Boolean).join('\n\n'),
    primaryImage: thumbnail || '',
    title,
    description,
    transcriptAvailable: Boolean(transcript)
  };
}

async function fetchUrlSource(sourceUrl) {
  let parsed;
  try { parsed = new URL(sourceUrl); } catch(e) { throw new Error('URL tidak valid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL harus http atau https.');
  if (isBlockedHost(parsed.hostname)) throw new Error('URL ini tidak bisa diakses demi keamanan.');

  const isYoutube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(parsed.hostname);
  if (isYoutube) return fetchYoutubeSource(parsed);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(parsed.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 ResepKeluargaBot/1.1 (+https://resepkeluarga.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'id,en;q=0.9'
      }
    });
    if (!resp.ok) throw new Error(`Link tidak bisa dibuka (${resp.status}).`);
    const contentType = resp.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) throw new Error('Link berhasil dibuka, tetapi bukan halaman teks/resep yang bisa dibaca.');

    const html = (await resp.text()).slice(0, 450000);
    const title = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' '));
    const metaDescription = pickMeta(html, 'description') || pickMeta(html, 'og:description') || pickMeta(html, 'twitter:description');
    const ogTitle = pickMeta(html, 'og:title') || pickMeta(html, 'twitter:title');
    const schemaRecipeObjs = extractJsonLdRecipes(html);
    const schemaRecipes = schemaRecipeObjs.map(r => compactRecipeSchema(r, parsed.href)).filter(Boolean).join('\n\n');
    const images = extractImageCandidates(html, parsed.href, schemaRecipeObjs);
    const bodyText = cleanHtmlToText(html).slice(0, 24000);

    return {
      text: [
        `URL: ${parsed.href}`,
        'Jenis sumber: website/web page.',
        `Judul: ${ogTitle || title || '-'}`,
        `Deskripsi: ${metaDescription || '-'}`,
        images.length ? `Gambar kandidat:\n${images.map((u, i) => `${i+1}. ${u}`).join('\n')}` : '',
        schemaRecipes ? `Recipe schema terdeteksi. Prioritaskan data ini karena biasanya paling akurat:\n${schemaRecipes}` : '',
        `Teks halaman:\n${bodyText}`
      ].filter(Boolean).join('\n\n'),
      primaryImage: images[0] || '',
      title: ogTitle || title || '',
      description: metaDescription || '',
      schemaFound: schemaRecipeObjs.length > 0
    };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Waktu mengambil link terlalu lama. Coba paste caption/transcript manual.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { mode, imageBase64, rawText, url } = req.body || {};
    let messages;
    let model;
    let sourceAssets = {};

    if (mode === 'photo') {
      const images = Array.isArray(req.body?.imagesBase64) ? req.body.imagesBase64 : (imageBase64 ? [imageBase64] : []);
      if (!images.length) throw new Error('Foto tidak ditemukan.');
      model = 'qwen3-vl-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: `Berikut ${images.length} foto resep masakan (bisa tulisan tangan, cetak, screenshot chat, atau foto hidangan). Gabungkan informasi dari semua foto menjadi satu resep utuh dalam JSON sesuai skema.` },
          ...images.map(img => ({ type: 'image_url', image_url: { url: img } }))
        ]}
      ];
    } else if (mode === 'text') {
      if (!rawText || !rawText.trim()) throw new Error('Teks tidak boleh kosong.');
      model = 'qwen-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        { role: 'user', content: `Berikut caption/teks/transcript/catatan resep masakan. Ubah menjadi resep terstruktur JSON sesuai skema:\n\n${rawText.slice(0, 12000)}` }
      ];
    } else if (mode === 'url') {
      if (!url || !String(url).trim()) throw new Error('Link tidak boleh kosong.');
      sourceAssets = await fetchUrlSource(String(url).trim());
      model = 'qwen-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        { role: 'user', content: `Ekstrak resep dari sumber web/link berikut secara lengkap. Prioritaskan recipe schema, transcript, deskripsi, dan teks halaman. Ambil nama resep, foto utama, bahan-bahan, takaran, cara masak, durasi, porsi, tag, dan link sumber jika tersedia. Jangan berhenti di judul jika ada informasi lain di bawah ini. Jangan mengarang data yang tidak ada.\n\n${sourceAssets.text.slice(0, 28000)}` }
      ];
    } else {
      throw new Error('Mode tidak dikenali. Gunakan: photo, text, atau url.');
    }

    const raw = await callQwen({ model, messages });
    const recipe = extractJson(raw);
    if (mode === 'url' && url) {
      recipe.link_sumber = recipe.link_sumber || String(url).trim();
      recipe.foto_url = recipe.foto_url || sourceAssets.primaryImage || null;
      recipe.catatan_sumber = recipe.catatan_sumber || (sourceAssets.transcriptAvailable === false ? 'Transcript YouTube tidak tersedia; data diambil dari metadata/deskripsi/halaman yang bisa dibaca.' : null);
    }
    res.status(200).json({ recipe, source: sourceAssets });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Terjadi kesalahan.' });
  }
}
