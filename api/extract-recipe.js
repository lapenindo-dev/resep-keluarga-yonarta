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

function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchYouTubeTranscript(videoUrl) {
  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) throw new Error('Link YouTube tidak valid.');

  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' }
  });
  const html = await pageResp.text();

  const match = html.match(/"captionTracks":(\[.*?\])/);
  if (!match) throw new Error('Video ini tidak memiliki transcript/caption. Coba paste manual deskripsi atau langkahnya.');

  let tracks;
  try {
    const jsonStr = match[1].replace(/\\u0026/g, '&');
    tracks = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Gagal membaca daftar caption video.');
  }
  if (!tracks.length) throw new Error('Tidak ada caption tersedia untuk video ini.');

  const preferred = tracks.find(t => t.languageCode === 'id') || tracks.find(t => t.languageCode === 'en') || tracks[0];
  const captionResp = await fetch(preferred.baseUrl + '&fmt=json3');
  const captionData = await captionResp.json();

  const text = (captionData.events || [])
    .flatMap(e => (e.segs || []).map(s => s.utf8))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) throw new Error('Transcript kosong.');
  return text;
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
      if (!imageBase64) throw new Error('Foto tidak ditemukan.');
      model = 'qwen3-vl-plus';
      messages = [
        { role: 'system', content: RECIPE_SCHEMA_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Ini adalah foto resep masakan (bisa tulisan tangan, cetak, atau foto hidangan). Ekstrak resepnya menjadi JSON sesuai skema.' },
            { type: 'image_url', image_url: { url: imageBase64 } }
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
