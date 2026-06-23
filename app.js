const SUPABASE_URL = 'https://eswokjdhyktikcxranpo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pV3wADDW91aY_0fbOSS39g_cUt39Cnu';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const PHOTO_BUCKET = 'recipe-photos';

let recipes = [];
let pantry = [];
let activeFilter = '';

const $ = (id) => document.getElementById(id);
const lineArray = (v) => (v || '').split('\n').map(x => x.trim()).filter(Boolean);
const csvArray = (v) => (v || '').split(',').map(x => x.trim()).filter(Boolean);
const stars = (n) => n > 0 ? '⭐'.repeat(Math.min(Number(n)||0, 5)) : 'Belum ada rating';
const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const listHtml = (arr, type='ul') => {
  const a = Array.isArray(arr) ? arr : [];
  if(!a.length) return '<p class="muted">Belum diisi.</p>';
  const items = a.map(x => `<li>${escapeHtml(x)}</li>`).join('');
  return `<${type}>${items}</${type}>`;
};

async function uploadRecipePhoto(file){
  if(!file) return null;
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const safeExt = ['jpg','jpeg','png','webp','gif'].includes(ext) ? ext : 'jpg';
  const path = `resep-${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if(error) throw new Error('Upload foto gagal: ' + error.message);
  const { data } = db.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function setPhotoPreview(url){
  const img = $('foto_preview');
  if(url){ img.src = url; img.style.display = 'block'; }
  else { img.removeAttribute('src'); img.style.display = 'none'; }
}

function go(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  $(page).classList.add('active');
  document.querySelectorAll('[data-go]').forEach(b=>b.classList.toggle('active', b.dataset.go===page));
}

document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('refreshBtn').onclick = loadAll;
$('backToRecipes').onclick = () => go('recipes');
$('cancelEdit').onclick = () => { resetForm(); go('home'); window.scrollTo({top:0, behavior:'smooth'}); };
$('foto_file').addEventListener('change', () => {
  const f = $('foto_file').files?.[0];
  if(!f) return setPhotoPreview(null);
  setPhotoPreview(URL.createObjectURL(f));
});

async function loadAll(){
  const {data: r, error: er} = await db.from('recipes').select('*').order('created_at',{ascending:false});
  if(er) return alert('Gagal ambil resep: ' + er.message);
  recipes = r || [];
  const {data: p} = await db.from('pantry_items').select('*').order('created_at',{ascending:false});
  pantry = p || [];
  render();
}

function render(){
  $('totalResep').textContent = recipes.length;
  $('totalFavorit').textContent = recipes.filter(r=>['Favorit Keluarga','Resep Andalan'].includes(r.status)).length;
  renderRecipes(); renderLatest(); renderPantry();
}

function recipeCard(r){
  const bahan = Array.isArray(r.bahan) ? r.bahan.slice(0,3).join(', ') : '';
  const photo = r.foto_url ? `<img class="recipe-photo" src="${r.foto_url}" alt="Foto ${escapeHtml(r.nama_resep)}" loading="lazy" />` : '';
  return `<div class="item clickable-card" onclick='viewRecipe("${r.id}")' role="button" tabindex="0" onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();viewRecipe("${r.id}");}'>${photo}<h3>${escapeHtml(r.nama_resep)}</h3><p>${escapeHtml(r.bahan_utama || '-')} · ${escapeHtml(r.jenis_hidangan || '-')} · ${escapeHtml(r.status || '-')}</p><p>${stars(r.rating_keluarga)}</p><p>${escapeHtml(bahan)}</p><div class="actions" onclick="event.stopPropagation()"><button class="secondary" onclick='editRecipe("${r.id}")'>Edit</button><button class="danger" onclick='deleteRecipe("${r.id}")'>Hapus</button></div></div>`;
}

window.viewRecipe = (id) => {
  const r = recipes.find(x=>x.id===id);
  if(!r) return alert('Resep tidak ditemukan.');
  const photo = r.foto_url ? `<img class="detail-photo" src="${r.foto_url}" alt="Foto ${escapeHtml(r.nama_resep)}" />` : '';
  const tags = Array.isArray(r.tag) && r.tag.length ? r.tag.map(t=>`<span class="tag-pill">${escapeHtml(t)}</span>`).join('') : '<span class="muted">Belum ada tag</span>';
  $('recipeDetail').innerHTML = `
    ${photo}
    <div class="detail-card">
      <h2>${escapeHtml(r.nama_resep)}</h2>
      <p class="rating-line">${stars(r.rating_keluarga)}</p>
      <div class="meta-grid">
        <div><b>Bahan Utama</b><span>${escapeHtml(r.bahan_utama || '-')}</span></div>
        <div><b>Jenis Hidangan</b><span>${escapeHtml(r.jenis_hidangan || '-')}</span></div>
        <div><b>Durasi</b><span>${r.durasi_menit ? escapeHtml(r.durasi_menit + ' menit') : '-'}</span></div>
        <div><b>Porsi</b><span>${r.porsi ? escapeHtml(r.porsi + ' porsi') : '-'}</span></div>
        <div><b>Status</b><span>${escapeHtml(r.status || '-')}</span></div>
        <div><b>Sumber</b><span>${r.link_sumber ? `<a href="${escapeHtml(r.link_sumber)}" target="_blank" rel="noopener">Buka link</a>` : '-'}</span></div>
      </div>
      <h3>🧂 Bahan</h3>
      <div class="recipe-content checklist">${listHtml(r.bahan, 'ul')}</div>
      <h3>👨‍🍳 Cara Memasak</h3>
      <div class="recipe-content steps">${listHtml(r.cara_memasak, 'ol')}</div>
      <h3>🏷 Tag</h3>
      <div class="tags">${tags}</div>
      <h3>📝 Catatan Yonarta</h3>
      <p class="note-box">${escapeHtml(r.catatan_yonarta || 'Belum ada catatan.')}</p>
      <div class="actions detail-actions">
        <button class="secondary" onclick='editRecipe("${r.id}")'>Edit Resep</button>
        <button class="danger" onclick='deleteRecipe("${r.id}")'>Hapus Resep</button>
      </div>
    </div>
  `;
  go('detail');
  window.scrollTo({top:0, behavior:'smooth'});
};

function renderLatest(){ $('latestList').innerHTML = recipes.slice(0,5).map(recipeCard).join('') || '<p class="muted">Belum ada resep.</p>'; }
function renderRecipes(){
  const q = $('searchInput').value.toLowerCase();
  const filtered = recipes.filter(r => {
    const hay = JSON.stringify(r).toLowerCase();
    const okSearch = !q || hay.includes(q);
    const okFilter = !activeFilter || r.bahan_utama === activeFilter;
    return okSearch && okFilter;
  });
  $('recipeList').innerHTML = filtered.map(recipeCard).join('') || '<p class="muted">Tidak ada resep.</p>';
}

$('searchInput').addEventListener('input', renderRecipes);
document.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');activeFilter=c.dataset.filter;renderRecipes();});

$('recipeForm').onsubmit = async (e)=>{
  e.preventDefault();
  const id = $('recipeId').value;
  let uploadedPhotoUrl = null;
  const selectedPhoto = $('foto_file').files?.[0];
  try {
    if(selectedPhoto) uploadedPhotoUrl = await uploadRecipePhoto(selectedPhoto);
  } catch(err){
    return alert(err.message);
  }
  const existing = id ? recipes.find(r=>r.id===id) : null;
  const payload = {
    nama_resep: $('nama_resep').value.trim(),
    bahan_utama: $('bahan_utama').value.trim(),
    jenis_hidangan: $('jenis_hidangan').value.trim(),
    durasi_menit: $('durasi_menit').value ? Number($('durasi_menit').value) : null,
    porsi: $('porsi').value ? Number($('porsi').value) : null,
    status: $('status').value,
    rating_keluarga: Math.min(Number($('rating_keluarga').value || 0), 5),
    bahan: lineArray($('bahan').value),
    cara_memasak: lineArray($('cara_memasak').value),
    tag: csvArray($('tag').value),
    catatan_yonarta: $('catatan_yonarta').value.trim(),
    link_sumber: $('link_sumber').value.trim(),
    foto_url: uploadedPhotoUrl || existing?.foto_url || null
  };
  const res = id ? await db.from('recipes').update(payload).eq('id', id) : await db.from('recipes').insert(payload);
  if(res.error) return alert('Gagal simpan: ' + res.error.message);
  resetForm(); await loadAll(); go('recipes');
};

window.editRecipe = (id)=>{
  const r = recipes.find(x=>x.id===id); if(!r) return;
  $('formTitle').textContent='Edit Resep'; $('recipeId').value=r.id;
  ['nama_resep','bahan_utama','jenis_hidangan','status','catatan_yonarta','link_sumber'].forEach(k=>$(k).value=r[k]||'');
  $('durasi_menit').value=r.durasi_menit||''; $('porsi').value=r.porsi||''; $('rating_keluarga').value=r.rating_keluarga||0;
  $('bahan').value=(r.bahan||[]).join('\n'); $('cara_memasak').value=(r.cara_memasak||[]).join('\n'); $('tag').value=(r.tag||[]).join(', ');
  setPhotoPreview(r.foto_url || null);
  $('foto_file').value = '';
  go('add');
};

window.deleteRecipe = async (id)=>{ if(!confirm('Hapus resep ini?')) return; const {error}=await db.from('recipes').delete().eq('id',id); if(error) alert(error.message); await loadAll(); };
function resetForm(){ $('recipeForm').reset(); $('recipeId').value=''; $('formTitle').textContent='Tambah Resep'; $('rating_keluarga').value=0; setPhotoPreview(null); }

$('generatePlan').onclick = ()=>{
  const days = Number($('jumlahHari').value || 7), meals = Number($('menuPerHari').value || 1), mode = $('modeRandom').value;
  let pool = [...recipes];
  if(mode==='Favorit Keluarga') pool = pool.filter(r=>['Favorit Keluarga','Resep Andalan'].includes(r.status));
  if(mode==='Menu Cepat') pool = pool.filter(r=>(r.durasi_menit||999)<=30);
  if(mode==='Menu Hemat') pool = pool.filter(r=>(r.tag||[]).includes('hemat'));
  if(pool.length===0) return alert('Belum ada resep yang cocok.');
  const times=['Pagi','Siang','Malam']; let html='';
  for(let d=1; d<=days; d++){ html += `<div class="item"><h3>Hari ${d}</h3>`; for(let m=0;m<meals;m++){ const pick=pool[Math.floor(Math.random()*pool.length)]; html += `<p>${times[m]||'Menu'}: <b>${pick.nama_resep}</b></p>`;} html+='</div>'; }
  $('planResult').innerHTML=html;
};

$('pantryForm').onsubmit = async (e)=>{e.preventDefault(); const payload={nama_bahan:$('pantryName').value.trim(), jumlah:$('pantryQty').value?Number($('pantryQty').value):null, satuan:$('pantryUnit').value.trim()}; const {error}=await db.from('pantry_items').insert(payload); if(error) return alert(error.message); $('pantryForm').reset(); await loadAll();};
function renderPantry(){ $('pantryList').innerHTML = pantry.map(p=>`<div class="item"><h3>${p.nama_bahan}</h3><p>${p.jumlah||''} ${p.satuan||''}</p></div>`).join('') || '<p class="muted">Belum ada stok dapur.</p>'; }

loadAll();
