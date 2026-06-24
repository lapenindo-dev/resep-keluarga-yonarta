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

function extractYouTubeId(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();

  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null;
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const watchId = url.searchParams.get('v');
      if (/^[a-zA-Z0-9_-]{11}$/.test(watchId || '')) return watchId;

      const parts = url.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex(x => ['shorts', 'embed', 'live', 'v'].includes(x));
      if (idx !== -1 && /^[a-zA-Z0-9_-]{11}$/.test(parts[idx + 1] || '')) return parts[idx + 1];
    }
  } catch (e) {
    // fallback regex below
  }

  const m = raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function findBalancedJsonAfter(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = html.indexOf('{', markerIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function getCaptionTracksFromHtml(html) {
  // Cara 1: parse object resmi player response. Lebih tahan dibanding regex captionTracks lama.
  const jsonText = findBalancedJsonAfter(html, 'ytInitialPlayerResponse');
  if (jsonText) {
    try {
      const player = JSON.parse(jsonText);
      const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length) return tracks;
    } catch (e) {
      // lanjut fallback regex
    }
  }

  // Cara 2: fallback regex, dengan batas yang lebih aman.
  const match = html.match(/"captionTracks":(\[.*?\])(?:,"audioTracks"|,"translationLanguages"|,"defaultAudioTrackIndex"|})/);
  if (match) {
    try {
      const jsonStr = match[1].replace(/\\u0026/g, '&');
      const tracks = JSON.parse(jsonStr);
      if (Array.isArray(tracks) && tracks.length) return tracks;
    } catch (e) {
      // lanjut fallback endpoint timedtext
    }
  }

  return [];
}

async function readCaptionTrack(baseUrl) {
  const url = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  if (!resp.ok) throw new Error(`Caption HTTP ${resp.status}`);

  const body = await resp.text();
  try {
    const data = JSON.parse(body);
    return (data.events || [])
      .flatMap(e => (e.segs || []).map(s => s.utf8 || ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) {
    // Kadang YouTube mengembalikan XML; baca seadanya.
    return decodeHtmlEntities(
      body
        .replace(/<\/?[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }
}

async function tryDirectTimedText(videoId) {
  const candidates = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&kind=asr&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=json3`
  ];

  for (const url of candidates) {
    try {
      const text = await readCaptionTrack(url);
      if (text && text.length > 30) return text;
    } catch (e) {
      // coba kandidat berikutnya
    }
  }
  return '';
}

async function fetchYouTubeTranscript(videoUrl) {
  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) {
    throw new Error('Link YouTube tidak valid. Pastikan link berisi video ID 11 karakter, contoh: https://youtu.be/xxxxxxxxxxx');
  }

  const pageUrl = `https://www.youtube.com/watch?v=${videoId}&hl=id&persist_hl=1&bpctr=9999999999&has_verified=1`;
  const pageResp = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cookie': 'CONSENT=YES+1; SOCS=CAI'
    }
  });

  if (pageResp.status === 429 || pageResp.status === 403) {
    const directText = await tryDirectTimedText(videoId);
    if (directText) return directText;
    throw new Error('YouTube menolak akses server. Solusi cepat: buka video di YouTube → klik deskripsi/“...Selengkapnya” → “Tampilkan transcript” → copy teksnya → paste di tab “TikTok/Teks”.');
  }

  const html = await pageResp.text();
  const tracks = getCaptionTracksFromHtml(html);

  if (tracks.length) {
    const preferred =
      tracks.find(t => t.languageCode === 'id') ||
      tracks.find(t => String(t.languageCode || '').startsWith('id')) ||
      tracks.find(t => t.languageCode === 'en') ||
      tracks.find(t => String(t.kind || '').toLowerCase() === 'asr') ||
      tracks[0];

    const text = await readCaptionTrack(preferred.baseUrl.replace(/\\u0026/g, '&'));
    if (text && text.length > 30) return text;
  }

  const directText = await tryDirectTimedText(videoId);
  if (directText) return directText;

  throw new Error('Transcript/caption tidak berhasil dibaca otomatis. Ini sering terjadi karena YouTube memblokir server Vercel atau video tidak menyediakan transcript publik. Solusi: buka video di YouTube → “Tampilkan transcript” → copy teksnya → paste di tab “TikTok/Teks”.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { mode, imageBase64, youtubeUrl, rawText } = req.body || {};

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
    } else if (mode === 'youtube') {
      if (!youtubeUrl) throw new Error('Link YouTube tidak ditemukan.');
      const transcript = await fetchYouTubeTranscript(youtubeUrl);
      model = 'qwen-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        { role: 'user', content: `Berikut transcript video resep masakan dari YouTube. Ubah menjadi resep terstruktur JSON sesuai skema:\n\n${transcript.slice(0, 8000)}` }
      ];
    } else if (mode === 'text') {
      if (!rawText || !rawText.trim()) throw new Error('Teks tidak boleh kosong.');
      model = 'qwen-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        { role: 'user', content: `Berikut caption/teks/catatan resep masakan. Ubah menjadi resep terstruktur JSON sesuai skema:\n\n${rawText.slice(0, 8000)}` }
      ];
    } else {
      throw new Error('Mode tidak dikenali. Gunakan: photo, youtube, atau text.');
    }

    const raw = await callQwen({ model, messages });
    const recipe = extractJson(raw);
    res.status(200).json({ recipe });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Terjadi kesalahan.' });
  }
}
