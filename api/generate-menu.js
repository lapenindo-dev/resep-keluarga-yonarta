// /api/generate-menu.js
// Vercel Serverless Function — AI Menu Generator fleksibel (Qwen/DashScope)

const DASHSCOPE_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

function extractJson(text) {
  let cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  try { return JSON.parse(cleaned); } catch (e) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Gagal parsing JSON dari respons AI');
  }
}

async function callQwen({ messages }) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY belum diset di Environment Variables Vercel.');

  const resp = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages,
      temperature: 0.45,
      max_tokens: 2200
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

function safeInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const days = safeInt(body.days, 1, 7, 7);
    const meals = safeInt(body.meals, 1, 2, 2);
    const labels = Array.isArray(body.labels) && body.labels.length ? body.labels.slice(0, meals) : ['Siang', 'Malam'].slice(0, meals);
    const recipes = Array.isArray(body.recipes) ? body.recipes.slice(0, 120) : [];
    const mode = body.mode || 'all';
    const startDate = body.startDate || '';
    const lockedMeals = Array.isArray(body.lockedMeals) ? body.lockedMeals : [];

    if (!recipes.length) throw new Error('Daftar resep kosong.');

    const system = `Kamu adalah AI Menu Planner keluarga Indonesia. Tugasmu memilih menu dari daftar resep yang tersedia.
Keluarkan HANYA JSON valid tanpa markdown, tanpa komentar, dengan skema:
{
  "plan": [
    { "day": 1, "meals": [ { "label": "Siang", "recipeId": "id_resep", "reason": "alasan singkat" } ] }
  ]
}
Aturan:
- Buat persis ${days} hari.
- Tiap hari berisi persis ${meals} slot: ${labels.join(', ')}.
- Gunakan HANYA recipeId dari daftar resep.
- Jangan memakai slot Pagi.
- Hindari resep yang sama terlalu berdekatan jika pilihan cukup.
- Seimbangkan bahan utama dan jenis hidangan.
- Mode all = seimbang umum.
- Mode fav = utamakan status Favorit Keluarga/Resep Andalan atau rating tinggi.
- Mode fast = utamakan durasi_menit <= 30.
- Mode hemat = utamakan tag hemat dan kombinasi belanja efisien.
- Jika ada lockedMeals, pertahankan recipeId yang locked pada dateKey/label terkait.
- Reason singkat maksimal 8 kata dalam Bahasa Indonesia.`;

    const user = {
      days,
      meals,
      labels,
      mode,
      startDate,
      lockedMeals,
      recipes
    };

    const raw = await callQwen({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(user) }
      ]
    });

    const json = extractJson(raw);
    if (!Array.isArray(json.plan)) throw new Error('Respons AI tidak memiliki field plan.');

    res.status(200).json({ plan: json.plan });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Terjadi kesalahan.' });
  }
}
