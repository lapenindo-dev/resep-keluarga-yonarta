// /api/extract-recipe.js
// Vercel Serverless Function — perantara aman ke Qwen API (DashScope)
// API key disimpan di Environment Variable DASHSCOPE_API_KEY (jangan taruh di client)

const DASHSCOPE_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

const RECIPE_SCHEMA_PROMPT = `Kamu adalah asisten yang mengekstrak resep masakan menjadi data terstruktur.
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
  "tag": ["tag1", "tag2"]
}

Jika informasi tidak tersedia/tidak jelas, isi null untuk angka atau array kosong [] — JANGAN mengarang data yang tidak ada di sumber.
Gunakan Bahasa Indonesia untuk semua isi teks.`;

function extractJson(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to find the first { ... last } as fallback
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e2) { /* fall through */ }
    }
    throw new Error('Gagal parsing JSON dari respons AI');
  }
}

async function callQwen({ model, messages }) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY belum diset di Environment Variables Vercel.');

  const resp = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2000
    })
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

function cleanHtmlToText(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/li>|<\/h\d>|<\/div>|<\/section>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
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
  return (html.match(re1)?.[1] || html.match(re2)?.[1] || '').trim();
}

function extractJsonLdRecipes(html = '') {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim());
  const hits = [];
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object') return;
    const type = node['@type'];
    const typeText = Array.isArray(type) ? type.join(' ') : String(type || '');
    if (/Recipe/i.test(typeText)) hits.push(node);
    Object.keys(node).forEach(k => {
      if (k === '@graph' || typeof node[k] === 'object') walk(node[k]);
    });
  }
  for (const raw of blocks) {
    try { walk(JSON.parse(raw)); } catch(e) { /* ignore broken schema */ }
  }
  return hits.slice(0, 3);
}

function compactRecipeSchema(recipe) {
  if (!recipe || typeof recipe !== 'object') return '';
  const out = {
    name: recipe.name,
    description: recipe.description,
    recipeYield: recipe.recipeYield,
    totalTime: recipe.totalTime || recipe.cookTime || recipe.prepTime,
    recipeIngredient: recipe.recipeIngredient,
    recipeInstructions: recipe.recipeInstructions,
    keywords: recipe.keywords
  };
  return JSON.stringify(out, null, 2).slice(0, 6000);
}

async function fetchUrlSource(sourceUrl) {
  let parsed;
  try { parsed = new URL(sourceUrl); } catch(e) { throw new Error('URL tidak valid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL harus http atau https.');
  if (isBlockedHost(parsed.hostname)) throw new Error('URL ini tidak bisa diakses demi keamanan.');

  const isYoutube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(parsed.hostname);
  let youtubeInfo = '';
  if (isYoutube) {
    try {
      const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(parsed.href)}`, { headers: { 'User-Agent': 'Mozilla/5.0 ResepKeluargaBot/1.0' } });
      if (oembed.ok) {
        const data = await oembed.json();
        youtubeInfo = [`YouTube title: ${data.title || '-'}`, `YouTube channel: ${data.author_name || '-'}`].join('\n');
      }
    } catch(e) { /* oEmbed fallback is optional */ }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(parsed.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 ResepKeluargaBot/1.0 (+https://resepkeluarga.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5'
      }
    });
    if (!resp.ok) throw new Error(`Link tidak bisa dibuka (${resp.status}).`);
    const contentType = resp.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new Error('Link berhasil dibuka, tetapi bukan halaman teks/resep yang bisa dibaca.');
    }
    const html = (await resp.text()).slice(0, 350000);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    const metaDescription = pickMeta(html, 'description') || pickMeta(html, 'og:description') || pickMeta(html, 'twitter:description');
    const ogTitle = pickMeta(html, 'og:title') || pickMeta(html, 'twitter:title');
    const schemaRecipes = extractJsonLdRecipes(html).map(compactRecipeSchema).filter(Boolean).join('\n\n');
    const bodyText = cleanHtmlToText(html).slice(0, 16000);
    return [
      `URL: ${parsed.href}`,
      isYoutube ? 'Jenis sumber: YouTube/video. Catatan: transcript otomatis mungkin tidak tersedia; gunakan judul, deskripsi, dan teks halaman yang bisa dibaca.' : 'Jenis sumber: website/web page.',
      youtubeInfo,
      `Judul: ${ogTitle || title || '-'}`,
      `Deskripsi: ${metaDescription || '-'}`,
      schemaRecipes ? `Recipe schema terdeteksi:\n${schemaRecipes}` : '',
      `Teks halaman:\n${bodyText}`
    ].filter(Boolean).join('\n\n');
  } catch (e) {
    if (youtubeInfo) {
      return [
        `URL: ${parsed.href}`,
        'Jenis sumber: YouTube/video. Halaman utama tidak bisa dibaca penuh, memakai metadata YouTube yang tersedia.',
        youtubeInfo
      ].join('\n\n');
    }
    if (e.name === 'AbortError') throw new Error('Waktu mengambil link terlalu lama. Coba paste caption/transcript manual.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { mode, imageBase64, rawText, url } = req.body || {};

    let messages;
    let model;

    if (mode === 'photo') {
      const images = Array.isArray(req.body?.imagesBase64) ? req.body.imagesBase64 : (imageBase64 ? [imageBase64] : []);
      if (!images.length) throw new Error('Foto tidak ditemukan.');
      model = 'qwen3-vl-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Berikut ${images.length} foto resep masakan (bisa tulisan tangan, cetak, atau foto hidangan dari beberapa angle/halaman). Gabungkan informasi dari semua foto menjadi satu resep utuh dalam JSON sesuai skema.` },
            ...images.map(img => ({ type: 'image_url', image_url: { url: img } }))
          ]
        }
      ];
    } else if (mode === 'text') {
      if (!rawText || !rawText.trim()) throw new Error('Teks tidak boleh kosong.');
      model = 'qwen-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        { role: 'user', content: `Berikut caption/teks/transcript/catatan resep masakan. Ubah menjadi resep terstruktur JSON sesuai skema:\n\n${rawText.slice(0, 8000)}` }
      ];
    } else if (mode === 'url') {
      if (!url || !String(url).trim()) throw new Error('Link tidak boleh kosong.');
      const sourceText = await fetchUrlSource(String(url).trim());
      model = 'qwen-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        { role: 'user', content: `Ekstrak resep dari sumber web/link berikut. Jika sumber adalah YouTube dan transcript tidak tersedia, gunakan informasi yang benar-benar ada dari judul/deskripsi/teks halaman. Jangan mengarang bahan atau langkah yang tidak ada. Sertakan link sumber dalam konteks, lalu kembalikan JSON resep sesuai skema:\n\n${sourceText.slice(0, 18000)}` }
      ];
    } else {
      throw new Error('Mode tidak dikenali. Gunakan: photo, text, atau url.');
    }

    const raw = await callQwen({ model, messages });
    const recipe = extractJson(raw);
    if (mode === 'url' && url) recipe.link_sumber = String(url).trim();
    res.status(200).json({ recipe });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Terjadi kesalahan.' });
  }
}
