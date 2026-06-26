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
  "tag": ["tag1", "tag2"],
  "foto_url": "string_atau_null"
}

Jika informasi tidak tersedia/tidak jelas, isi null untuk angka/foto atau array kosong [] — JANGAN mengarang data yang tidak ada di sumber.
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
      max_tokens: 3500
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

function extractYoutubeVideoId(urlObj) {
  const host = urlObj.hostname.toLowerCase();
  if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
    return urlObj.pathname.split('/').filter(Boolean)[0] || '';
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    if (urlObj.pathname === '/watch') return urlObj.searchParams.get('v') || '';
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || '';
  }
  return '';
}

function safeJsonParseLoose(raw = '') {
  try { return JSON.parse(raw); } catch(e) { return null; }
}

function extractBalancedObject(text = '', startIndex = 0) {
  const first = text.indexOf('{', startIndex);
  if (first < 0) return '';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = first; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(first, i + 1);
    }
  }
  return '';
}

function pickBestYoutubeThumbnail(thumbnails = []) {
  if (!Array.isArray(thumbnails) || !thumbnails.length) return '';
  const sorted = [...thumbnails].sort((a,b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
  return sorted[0]?.url || '';
}

function collectTextRuns(node, out = []) {
  if (!node) return out;
  if (typeof node === 'string') return out;
  if (Array.isArray(node)) { node.forEach(x => collectTextRuns(x, out)); return out; }
  if (typeof node !== 'object') return out;
  if (typeof node.simpleText === 'string') out.push(node.simpleText);
  if (Array.isArray(node.runs)) node.runs.forEach(r => { if (typeof r?.text === 'string') out.push(r.text); });
  for (const k of Object.keys(node)) {
    if (k !== 'runs' && k !== 'simpleText') collectTextRuns(node[k], out);
  }
  return out;
}


function decodeHtmlEntities(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\n/g, '\n')
    .replace(/\\u0026/g, '&')
    .trim();
}

function getTextFromYoutubeRuns(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map(r => r.text || '').join('');
  return '';
}

function mergeLongestText(current = '', candidate = '') {
  const clean = decodeHtmlEntities(candidate || '').trim();
  if (!clean) return current || '';
  if (!current || clean.length > current.length) return clean;
  return current;
}

function normalizeYoutubeText(text = '') {
  return decodeHtmlEntities(String(text || ''))
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function recipeTextScore(text = '') {
  const t = normalizeYoutubeText(text);
  if (!t) return 0;
  let score = Math.min(t.length, 12000) / 120;
  const recipeHits = (t.match(/\b(bahan|resep|cara|langkah|masak|goreng|kukus|panggang|tumis|adonan|minyak|tepung|garam|gula|sdt|sdm|gram|gr\b|kg\b|ml\b|butir|siung|iris|cincang|ingredient|instructions|method)\b/gi) || []).length;
  score += recipeHits * 12;
  const timeCodeHits = (t.match(/\b\d{1,2}:\d{2}\b/g) || []).length;
  score -= Math.min(timeCodeHits * 8, 80);
  return score;
}

function pushTextCandidate(out, text, label = '') {
  const clean = normalizeYoutubeText(text);
  if (!clean || clean.length < 20) return;
  out.push({ label, text: clean, score: recipeTextScore(clean) });
}

function collectYoutubeDescriptionCandidates(node, out = [], path = '') {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectYoutubeDescriptionCandidates(v, out, `${path}.${i}`));
    return out;
  }
  if (typeof node !== 'object') return out;

  if (node.attributedDescription?.content) pushTextCandidate(out, node.attributedDescription.content, `${path}.attributedDescription.content`);
  if (node.shortDescription) pushTextCandidate(out, node.shortDescription, `${path}.shortDescription`);
  if (node.description) {
    const desc = getTextFromYoutubeRuns(node.description);
    pushTextCandidate(out, desc, `${path}.description`);
  }
  if (/description/i.test(path)) {
    const text = getTextFromYoutubeRuns(node);
    pushTextCandidate(out, text, path);
  }
  if (node.expandableVideoDescriptionBodyRenderer || node.structuredDescriptionContentRenderer || node.videoDescriptionHeaderRenderer) {
    const text = collectTextRuns(node, []).join('\n');
    pushTextCandidate(out, text, `${path}.renderer`);
  }

  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'object') collectYoutubeDescriptionCandidates(v, out, path ? `${path}.${k}` : k);
  }
  return out;
}

function bestYoutubeDescriptionFromCandidates(candidates = []) {
  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = c.text.slice(0, 500);
    if (!seen.has(key)) { seen.add(key); unique.push(c); }
  }
  unique.sort((a, b) => b.score - a.score || b.text.length - a.text.length);
  return unique[0]?.text || '';
}

function extractYoutubeDescriptionFromHtml(html = '') {
  const candidates = [];
  const patterns = [
    /"shortDescription"\s*:\s*"((?:\\.|[^"\\])*)"/g,
    /"attributedDescription"\s*:\s*\{\s*"content"\s*:\s*"((?:\\.|[^"\\])*)"/g,
    /"description"\s*:\s*\{\s*"simpleText"\s*:\s*"((?:\\.|[^"\\])*)"/g
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html))) {
      try { pushTextCandidate(candidates, JSON.parse(`"${m[1]}"`), 'html-regex'); } catch(e) { pushTextCandidate(candidates, m[1], 'html-regex-raw'); }
    }
  }
  return bestYoutubeDescriptionFromCandidates(candidates);
}

async function fetchYoutubeNext(videoId) {
  if (!videoId) return null;
  const keys = [process.env.YOUTUBE_INNERTUBE_KEY, 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'].filter(Boolean);
  const clients = [
    { clientName: 'WEB', clientVersion: '2.20240304.00.00' },
    { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30 }
  ];
  for (const key of keys) {
    for (const client of clients) {
      try {
        const resp = await fetch(`https://www.youtube.com/youtubei/v1/next?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'User-Agent': client.clientName === 'ANDROID'
              ? 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'
              : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            'Origin': 'https://www.youtube.com',
            'Referer': `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
          },
          body: JSON.stringify({
            context: { client, user: { lockedSafetyMode: false }, request: { useSsl: true } },
            videoId,
            contentCheckOk: true,
            racyCheckOk: true
          })
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        const candidates = collectYoutubeDescriptionCandidates(data, []);
        const description = bestYoutubeDescriptionFromCandidates(candidates);
        const headerRuns = collectTextRuns(data?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0], []).join(' ');
        return { description, headerRuns };
      } catch(e) { /* try next */ }
    }
  }
  return null;
}

function extractImageUrlFromSourceText(sourceText = '') {
  return (sourceText.match(/(?:Thumbnail|Gambar utama|Image):\s*(https?:\/\/\S+)/i)?.[1] || '').trim();
}

function extractTitleFromSourceText(sourceText = '') {
  return (sourceText.match(/Judul:\s*([^\n]+)/i)?.[1] || '').trim().replace(/^[-–]\s*/, '');
}

function extractMainDescriptionBlock(sourceText = '') {
  const m = sourceText.match(/DESKRIPSI\/CAPTION YOUTUBE LENGKAP:\n([\s\S]*?)(?:\n\nCatatan|\n\nURL:|$)/i);
  return normalizeYoutubeText(m?.[1] || sourceText);
}

function normalizeCaptionLines(text = '') {
  return normalizeYoutubeText(text)
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)
    .filter(x => !/^https?:\/\//i.test(x))
    .filter(x => !/^#/.test(x))
    .filter(x => !/^[-=]{3,}$/.test(x))
    .filter(x => !/^\[[A-Z ]+\]$/.test(x));
}

function parseIngredientLine(line = '') {
  const clean = line.replace(/^[-•*]\s*/, '').trim();
  const m = clean.match(/^([\d¼½¾.,\/\s+-]+)\s*([a-zA-ZÀ-ÿ]+)?\s+(.+)$/);
  if (m) {
    return { jumlah: m[1].trim(), satuan: (m[2] || '').trim(), nama_bahan: m[3].trim() };
  }
  return { jumlah: '', satuan: '', nama_bahan: clean };
}

function fallbackParseRecipeFromSource(sourceText = {}) {
  const text = extractMainDescriptionBlock(sourceText);
  const lines = normalizeCaptionLines(text);
  const groups = [];
  let currentGroup = null;
  let inSteps = false;
  const steps = [];
  const stopLine = /^(english|ingredients|instructions|instagram|follow|subscribe|music|source|video|link|===)/i;
  const ingredientHeader = /^(bahan|ingredients?)\b([^:：]*)[:：]?/i;
  const stepHeader = /^(cara|langkah|membuat|cara membuat|cara memasak|directions?|instructions?|method)\b/i;

  for (const raw of lines) {
    let line = raw.replace(/^\d{1,2}:\d{2}\s*:?\s*/, '').trim();
    if (!line || stopLine.test(line)) continue;
    if (/^\d{1,2}:\d{2}\b/.test(raw)) continue;

    if (stepHeader.test(line)) {
      inSteps = true;
      continue;
    }

    if (/^resep\b/i.test(line) && !currentGroup && !inSteps) continue;

    const ih = line.match(ingredientHeader);
    if (ih && !inSteps) {
      const name = line.replace(/[:：]\s*$/, '').trim() || 'Bahan';
      currentGroup = { nama_grup: name, items: [] };
      groups.push(currentGroup);
      continue;
    }

    const looksIngredient = /(\b\d+[\d¼½¾.,\/\s-]*\s*(gr|gram|g|kg|ml|l|liter|sdm|sdt|tsp|tbsp|cup|cups|siung|butir|buah|lembar|batang|ruas|pcs|pc|ekor|sendok)\b|secukupnya|garam|gula|tepung|minyak|bawang|telur|ayam|daging|santan|air\b)/i.test(line);
    if (!inSteps && looksIngredient) {
      if (!currentGroup) {
        currentGroup = { nama_grup: 'Bahan', items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(parseIngredientLine(line));
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s*(.+)$/);
    const looksStep = /(campur|aduk|masukkan|tuang|panaskan|goreng|rebus|kukus|panggang|tumis|potong|iris|haluskan|diamkan|masak|sajikan|blender|uleg|bentuk)/i.test(line);
    if (inSteps || numbered || looksStep) {
      const step = (numbered ? numbered[1] : line).trim();
      if (step.length > 8) steps.push(step);
    }
  }

  groups.forEach(g => { g.items = g.items.filter(i => i.nama_bahan && i.nama_bahan.length > 1); });
  const bahan = groups.filter(g => g.items.length);
  return { bahan, cara_memasak: steps.slice(0, 40) };
}

function hasUsableIngredients(groups) {
  return Array.isArray(groups) && groups.some(g => Array.isArray(g.items) && g.items.some(i => i && i.nama_bahan));
}

function hasUsableSteps(steps) {
  return Array.isArray(steps) && steps.some(s => String(s || '').trim().length > 4);
}


function inferIngredientMainFromText(text = '') {
  const t = text.toLowerCase();
  if (/\bbabi\b|pork|samcan|kaki babi|lapchiong/.test(t)) return 'Babi';
  if (/\bayam\b|chicken/.test(t)) return 'Ayam';
  if (/\bsapi\b|beef/.test(t)) return 'Sapi';
  if (/udang|ikan|cumi|seafood|kerang/.test(t)) return 'Seafood';
  if (/telur|egg/.test(t)) return 'Telur';
  if (/tahu|tempe/.test(t)) return 'Tahu dan Tempe';
  if (/sayur|kangkung|bayam|wortel|brokoli/.test(t)) return 'Sayur';
  return 'Lainnya';
}

function inferDishTypeFromText(text = '') {
  const t = text.toLowerCase();
  if (/goreng|fried/.test(t)) return 'Goreng';
  if (/tumis|oseng|saute/.test(t)) return 'Tumis';
  if (/panggang|bakar|oven|roast|grill/.test(t)) return 'Panggang';
  if (/sup|sop|kuah|soto/.test(t)) return 'Sup dan Kuah';
  if (/mie|noodle/.test(t)) return 'Mie';
  if (/nasi|rice/.test(t)) return 'Nasi';
  if (/cemilan|snack|bakso|ball|perkedel/.test(t)) return 'Cemilan';
  if (/dessert|puding|cake|kue|bolu/.test(t)) return 'Dessert';
  if (/saus|sambal|bumbu/.test(t)) return 'Saus dan Bumbu';
  if (/minuman|drink|juice|jus/.test(t)) return 'Minuman';
  return 'Lainnya';
}

function extractTagsFromText(text = '') {
  const tags = new Set();
  for (const m of String(text).matchAll(/#([\p{L}\p{N}_-]+)/gu)) tags.add(m[1]);
  const lower = text.toLowerCase();
  ['youtube','warisan','keluarga','goreng','tumis','panggang','cemilan','ayam','babi','sapi','seafood'].forEach(t => { if (lower.includes(t)) tags.add(t); });
  return [...tags].slice(0, 8);
}

function buildFallbackRecipeFromSource(sourceText = '', url = '') {
  const title = extractTitleFromSourceText(sourceText) || 'Resep dari Link';
  const parsed = fallbackParseRecipeFromSource(sourceText);
  const imageUrl = extractImageUrlFromSourceText(sourceText) || null;
  const joined = `${title}\n${sourceText}`;
  return {
    nama_resep: title,
    bahan_utama: inferIngredientMainFromText(joined),
    jenis_hidangan: inferDishTypeFromText(joined),
    durasi_menit: null,
    porsi: null,
    bahan: parsed.bahan || [],
    cara_memasak: parsed.cara_memasak || [],
    tag: extractTagsFromText(joined),
    foto_url: imageUrl,
    link_sumber: url || ''
  };
}

function mergeRecipeWithFallback(recipe = {}, fallback = {}) {
  const out = { ...fallback, ...recipe };
  if (!out.nama_resep || out.nama_resep === '-' || /^resep dari link$/i.test(out.nama_resep)) out.nama_resep = fallback.nama_resep || out.nama_resep;
  if (!hasUsableIngredients(out.bahan) && hasUsableIngredients(fallback.bahan)) out.bahan = fallback.bahan;
  if (!hasUsableSteps(out.cara_memasak) && hasUsableSteps(fallback.cara_memasak)) out.cara_memasak = fallback.cara_memasak;
  if (!out.foto_url && fallback.foto_url) out.foto_url = fallback.foto_url;
  if (!out.bahan_utama || out.bahan_utama === 'Lainnya') out.bahan_utama = fallback.bahan_utama || out.bahan_utama || 'Lainnya';
  if (!out.jenis_hidangan || out.jenis_hidangan === 'Lainnya') out.jenis_hidangan = fallback.jenis_hidangan || out.jenis_hidangan || 'Lainnya';
  if ((!Array.isArray(out.tag) || !out.tag.length) && Array.isArray(fallback.tag)) out.tag = fallback.tag;
  return out;
}

function enhanceRecipeWithFallback(recipe = {}, sourceText = '') {
  const fallback = fallbackParseRecipeFromSource(sourceText);
  if (!hasUsableIngredients(recipe.bahan) && fallback.bahan.length) {
    recipe.bahan = fallback.bahan;
  }
  if (!hasUsableSteps(recipe.cara_memasak) && fallback.cara_memasak.length) {
    recipe.cara_memasak = fallback.cara_memasak;
  }
  return recipe;
}


async function fetchYoutubeGetVideoInfo(videoId) {
  if (!videoId) return null;
  const urls = [
    `https://www.youtube.com/get_video_info?video_id=${encodeURIComponent(videoId)}&html5=1&c=WEB&cver=2.20240304.00.00&hl=id&gl=ID`,
    `https://www.youtube.com/get_video_info?video_id=${encodeURIComponent(videoId)}&html5=1&c=ANDROID&cver=19.09.37&hl=id&gl=ID`
  ];
  for (const u of urls) {
    try {
      const resp = await fetch(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      if (!resp.ok) continue;
      const text = await resp.text();
      const params = new URLSearchParams(text);
      const playerRaw = params.get('player_response');
      if (!playerRaw) continue;
      const player = JSON.parse(playerRaw);
      const vd = player.videoDetails || {};
      return {
        title: vd.title || '',
        channel: vd.author || '',
        description: vd.shortDescription || '',
        thumbnail: pickBestYoutubeThumbnail(vd.thumbnail?.thumbnails) || ''
      };
    } catch(e) { /* next */ }
  }
  return null;
}

async function fetchYoutubePublicSnippet(videoId) {
  if (!videoId) return null;
  const endpoints = [
    `https://yt.lemnoslife.com/videos?part=snippet&id=${encodeURIComponent(videoId)}`,
    `https://piped.video/api/v1/watch?v=${encodeURIComponent(videoId)}`
  ];
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 ResepKeluargaBot/1.0' } });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (Array.isArray(data.items) && data.items[0]?.snippet) {
        const sn = data.items[0].snippet;
        return {
          title: sn.title || '',
          channel: sn.channelTitle || sn.channelId || '',
          description: sn.description || '',
          thumbnail: sn.thumbnails?.maxres?.url || sn.thumbnails?.standard?.url || sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || ''
        };
      }
      if (data && (data.description || data.title || data.thumbnailUrl)) {
        return {
          title: data.title || '',
          channel: data.uploader || data.uploaderName || '',
          description: data.description || '',
          thumbnail: data.thumbnailUrl || data.thumbnail || ''
        };
      }
    } catch(e) { /* next */ }
  }
  return null;
}

async function fetchYoutubeDataApi(videoId) {
  const key = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_YOUTUBE_API_KEY || '';
  if (!key || !videoId) return null;
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`;
  const resp = await fetch(apiUrl, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) return null;
  const data = await resp.json();
  const item = data.items?.[0];
  if (!item) return null;
  const sn = item.snippet || {};
  return {
    title: sn.title || '',
    channel: sn.channelTitle || '',
    description: sn.description || '',
    thumbnail: sn.thumbnails?.maxres?.url || sn.thumbnails?.standard?.url || sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || ''
  };
}

async function fetchYoutubeInnertube(videoId) {
  if (!videoId) return null;
  const keys = [
    process.env.YOUTUBE_INNERTUBE_KEY,
    'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
  ].filter(Boolean);
  const clients = [
    { clientName: 'WEB', clientVersion: '2.20240304.00.00' },
    { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30 }
  ];
  for (const key of keys) {
    for (const client of clients) {
      try {
        const resp = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'User-Agent': client.clientName === 'ANDROID'
              ? 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'
              : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            'Origin': 'https://www.youtube.com',
            'Referer': `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
          },
          body: JSON.stringify({
            context: { client },
            videoId,
            contentCheckOk: true,
            racyCheckOk: true
          })
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        const vd = data.videoDetails || {};
        const micro = data.microformat?.playerMicroformatRenderer || {};
        const description = vd.shortDescription || getTextFromYoutubeRuns(micro.description) || '';
        const title = vd.title || getTextFromYoutubeRuns(micro.title) || '';
        const channel = vd.author || micro.ownerChannelName || '';
        const thumbnail = pickBestYoutubeThumbnail(vd.thumbnail?.thumbnails) || pickBestYoutubeThumbnail(micro.thumbnail?.thumbnails) || '';
        if (title || description || thumbnail) return { title, channel, description, thumbnail };
      } catch(e) { /* try next */ }
    }
  }
  return null;
}

async function fetchYoutubeRichSource(parsed) {
  const videoId = extractYoutubeVideoId(parsed);
  let title = '';
  let channel = '';
  let description = '';
  let thumbnail = '';
  let pageHints = '';

  try {
    const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(parsed.href)}`, { headers: { 'User-Agent': 'Mozilla/5.0 ResepKeluargaBot/1.0' } });
    if (oembed.ok) {
      const data = await oembed.json();
      title = data.title || title;
      channel = data.author_name || channel;
      thumbnail = data.thumbnail_url || thumbnail;
    }
  } catch(e) { /* optional */ }

  // Best path for YouTube: use official API if key is available, then Innertube fallback.
  // This is required because the normal watch HTML often hides the full expanded description.
  try {
    const apiData = await fetchYoutubeDataApi(videoId);
    if (apiData) {
      title = apiData.title || title;
      channel = apiData.channel || channel;
      thumbnail = apiData.thumbnail || thumbnail;
      description = mergeLongestText(description, apiData.description);
    }
  } catch(e) { pageHints += `\nCatatan YouTube Data API: ${e.message}`; }

  try {
    const infoData = await fetchYoutubeGetVideoInfo(videoId);
    if (infoData) {
      title = infoData.title || title;
      channel = infoData.channel || channel;
      thumbnail = infoData.thumbnail || thumbnail;
      description = mergeLongestText(description, infoData.description);
    }
  } catch(e) { pageHints += `\nCatatan YouTube get_video_info: ${e.message}`; }

  try {
    const publicData = await fetchYoutubePublicSnippet(videoId);
    if (publicData) {
      title = publicData.title || title;
      channel = publicData.channel || channel;
      thumbnail = publicData.thumbnail || thumbnail;
      description = mergeLongestText(description, publicData.description);
    }
  } catch(e) { pageHints += `\nCatatan YouTube public snippet: ${e.message}`; }

  try {
    const innerData = await fetchYoutubeInnertube(videoId);
    if (innerData) {
      title = innerData.title || title;
      channel = innerData.channel || channel;
      thumbnail = innerData.thumbnail || thumbnail;
      description = mergeLongestText(description, innerData.description);
    }
  } catch(e) { pageHints += `\nCatatan YouTube Innertube: ${e.message}`; }

  try {
    const nextData = await fetchYoutubeNext(videoId);
    if (nextData?.description) {
      description = mergeLongestText(description, nextData.description);
    }
  } catch(e) { pageHints += `\nCatatan YouTube Next API: ${e.message}`; }

  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : parsed.href;
  try {
    const resp = await fetch(watchUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (resp.ok) {
      const html = (await resp.text()).slice(0, 900000);
      const htmlDescription = extractYoutubeDescriptionFromHtml(html);
      if (htmlDescription) description = mergeLongestText(description, htmlDescription);
      const metaThumb = pickMeta(html, 'og:image') || pickMeta(html, 'twitter:image');
      if (metaThumb) thumbnail = metaThumb || thumbnail;
      const metaTitle = pickMeta(html, 'og:title') || pickMeta(html, 'twitter:title');
      if (metaTitle) title = title || metaTitle;
      const marker = 'ytInitialPlayerResponse';
      const markerIndex = html.indexOf(marker);
      if (markerIndex >= 0) {
        const rawObj = extractBalancedObject(html, markerIndex);
        const player = safeJsonParseLoose(rawObj);
        const vd = player?.videoDetails || {};
        title = vd.title || title;
        channel = vd.author || channel;
        description = mergeLongestText(description, vd.shortDescription || "");
        thumbnail = pickBestYoutubeThumbnail(vd.thumbnail?.thumbnails) || thumbnail;
        const captions = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        if (captions.length) pageHints += `\nCaption tracks tersedia: ${captions.map(c => c.languageCode || c.name?.simpleText).filter(Boolean).join(', ')}`;
      }

      // Fallback for rich description text that sometimes appears outside playerResponse.
      if (!description || description.length < 200) {
        const descMatch = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
        if (descMatch) {
          try { description = JSON.parse(`"${descMatch[1]}"`); } catch(e) {}
        }
      }
      if (!description || description.length < 200) {
        const initialDataIndex = html.indexOf('ytInitialData');
        const rawData = extractBalancedObject(html, initialDataIndex);
        const initialData = safeJsonParseLoose(rawData);
        const texts = collectTextRuns(initialData, []).join('\n');
        const possibleLines = texts.split('\n').map(x => x.trim()).filter(Boolean);
        const recipeish = possibleLines.filter(x => /(bahan|resep|sdt|sdm|gram|gr\b|kg\b|cara|masak|goreng|kukus|panggang|minutes|ingredient|recipe)/i.test(x)).join('\n');
        if (recipeTextScore(recipeish) > recipeTextScore(description)) description = recipeish.slice(0, 12000);
      }
    }
  } catch(e) {
    pageHints += `\nCatatan fetch YouTube: ${e.message}`;
  }

  if (!description || description.length < 80) {
    pageHints += '\nDeskripsi YouTube belum berhasil dibaca penuh. Untuk hasil stabil di production, set YOUTUBE_API_KEY di Vercel Environment Variables.';
  }

  return [
    `URL: ${parsed.href}`,
    'Jenis sumber: YouTube/video.',
    videoId ? `Video ID: ${videoId}` : '',
    `Judul: ${title || '-'}`,
    `Channel: ${channel || '-'}`,
    thumbnail ? `Thumbnail: ${thumbnail}` : '',
    description ? `DESKRIPSI/CAPTION YOUTUBE LENGKAP:\n${description}` : 'DESKRIPSI/CAPTION YOUTUBE LENGKAP: -',
    pageHints.trim()
  ].filter(Boolean).join('\n\n');
}

async function fetchUrlSource(sourceUrl) {
  let parsed;
  try { parsed = new URL(sourceUrl); } catch(e) { throw new Error('URL tidak valid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL harus http atau https.');
  if (isBlockedHost(parsed.hostname)) throw new Error('URL ini tidak bisa diakses demi keamanan.');

  const isYoutube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(parsed.hostname);
  if (isYoutube) {
    return await fetchYoutubeRichSource(parsed);
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
      'Jenis sumber: website/web page.',
      `Judul: ${ogTitle || title || '-'}`,
      `Deskripsi: ${metaDescription || '-'}`,
      (pickMeta(html, 'og:image') || pickMeta(html, 'twitter:image')) ? `Gambar utama: ${pickMeta(html, 'og:image') || pickMeta(html, 'twitter:image')}` : '',
      schemaRecipes ? `Recipe schema terdeteksi:\n${schemaRecipes}` : '',
      `Teks halaman:\n${bodyText}`
    ].filter(Boolean).join('\n\n');
  } catch (e) {
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
      const cleanUrl = String(url).trim();
      const sourceText = await fetchUrlSource(cleanUrl);
      const fallbackRecipe = buildFallbackRecipeFromSource(sourceText, cleanUrl);

      model = 'qwen-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        { role: 'user', content: `Ekstrak resep dari sumber web/link berikut. Untuk YouTube, fokus utama adalah bagian DESKRIPSI/CAPTION YOUTUBE LENGKAP karena biasanya berisi bahan dan cara memasak. Ambil judul, bahan-bahan, takaran, langkah memasak, porsi, durasi, foto/thumbnail jika tersedia, dan tag dari teks yang benar-benar tersedia. Jika bagian DESKRIPSI/CAPTION YOUTUBE LENGKAP berisi daftar bahan dan cara memasak, pindahkan semuanya ke field bahan dan cara_memasak. Jika ada timecode, abaikan sebagai resep kecuali membantu urutan langkah. Jangan hanya mengambil judul. Jangan mengarang bahan atau langkah yang tidak ada. Kembalikan JSON resep sesuai skema:

${sourceText.slice(0, 22000)}` }
      ];

      try {
        const raw = await callQwen({ model, messages });
        const aiRecipe = extractJson(raw);
        const recipe = mergeRecipeWithFallback(aiRecipe, fallbackRecipe);
        recipe.link_sumber = cleanUrl;
        res.status(200).json({ recipe });
        return;
      } catch (aiErr) {
        if (fallbackRecipe.nama_resep || hasUsableIngredients(fallbackRecipe.bahan) || hasUsableSteps(fallbackRecipe.cara_memasak) || fallbackRecipe.foto_url) {
          fallbackRecipe.link_sumber = cleanUrl;
          res.status(200).json({ recipe: fallbackRecipe, warning: `AI belum aktif: ${aiErr.message}` });
          return;
        }
        throw aiErr;
      }
    } else {
      throw new Error('Mode tidak dikenali. Gunakan: photo, text, atau url.');
    }

    const raw = await callQwen({ model, messages });
    const recipe = extractJson(raw);
    res.status(200).json({ recipe });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Terjadi kesalahan.' });
  }
}
