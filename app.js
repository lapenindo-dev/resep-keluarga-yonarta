const SUPABASE_URL = 'https://eswokjdhyktikcxranpo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pV3wADDW91aY_0fbOSS39g_cUt39Cnu';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const PHOTO_BUCKET = 'recipe-photos';

let recipes = [];
let pantry = [];
let masterIngredients = [];
let masterUnits = [];
let activeFilter = '';
let ingredientGroupsState = [];

const DEFAULT_UNITS = ['gr','kg','ml','liter','butir','buah','siung','ikat','lembar','sdm','sdt','cup','pcs'];
const DEFAULT_GROUPS = ['Bahan Utama','Marinasi','Saus','Pelengkap','Bumbu Halus','Bumbu Tumis','Kuah','Topping','Lainnya'];

const $ = (id) => document.getElementById(id);
const lineArray = (v) => (v || '').split('\n').map(x => x.trim()).filter(Boolean);
const csvArray = (v) => (v || '').split(',').map(x => x.trim()).filter(Boolean);
const stars = (n) => n > 0 ? '⭐'.repeat(Math.min(Number(n)||0, 5)) : 'Belum ada rating';
const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const displayIngredient = (it) => `${it.nama_bahan || ''}${it.jumlah ? ' - ' + it.jumlah : ''}${it.satuan ? ' ' + it.satuan : ''}`.trim();

function normalizeIngredientGroups(value){
  if(!Array.isArray(value) || !value.length) return [{ nama_grup: 'Bahan Utama', items: [{ nama_bahan:'', jumlah:'', satuan:'' }] }];
  if(typeof value[0] === 'string') {
    return [{ nama_grup: 'Bahan Utama', items: value.map(x => ({ nama_bahan: x, jumlah:'', satuan:'' })) }];
  }
  return value.map(g => ({
    nama_grup: g.nama_grup || g.group || 'Bahan Utama',
    items: Array.isArray(g.items) ? g.items.map(i => ({ nama_bahan: i.nama_bahan || i.name || '', jumlah: i.jumlah ?? i.qty ?? '', satuan: i.satuan || i.unit || '' })) : []
  })).filter(g => g.items.length || g.nama_grup);
}

function flatIngredients(value){
  const groups = normalizeIngredientGroups(value);
  return groups.flatMap(g => (g.items||[]).filter(i=>i.nama_bahan).map(displayIngredient));
}

function listStepsHtml(arr){
  const a = Array.isArray(arr) ? arr : [];
  if(!a.length) return '<p class="muted">Belum diisi.</p>';
  return `<ol>${a.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ol>`;
}

function ingredientsDetailHtml(value){
  const groups = normalizeIngredientGroups(value).filter(g => (g.items||[]).some(i=>i.nama_bahan));
  if(!groups.length) return '<p class="muted">Belum diisi.</p>';
  return groups.map(g => `
    <div class="ingredient-group-detail">
      <h4>${escapeHtml(g.nama_grup || 'Bahan')}</h4>
      <ul>${g.items.filter(i=>i.nama_bahan).map(i => `<li><span>${escapeHtml(i.nama_bahan)}</span><b>${escapeHtml(i.jumlah || '')} ${escapeHtml(i.satuan || '')}</b></li>`).join('')}</ul>
    </div>`).join('');
}

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
$('refreshBtn').onclick = async () => {
  const btn = $('refreshBtn');
  const original = btn.textContent;
  try {
    btn.disabled = true;
    btn.textContent = '⏳ Memuat...';
    await loadAll();
    btn.textContent = '✅ Selesai';
  } catch(err){
    console.error(err);
    btn.textContent = '❌ Gagal';
  }
  setTimeout(()=>{
    btn.textContent = original;
    btn.disabled = false;
  },1200);
};
$('backToRecipes').onclick = () => go('recipes');
$('cancelEdit').onclick = () => { resetForm(); go('home'); window.scrollTo({top:0, behavior:'smooth'}); };
$('foto_file').addEventListener('change', () => {
  const f = $('foto_file').files?.[0];
  if(!f) return setPhotoPreview(null);
  setPhotoPreview(URL.createObjectURL(f));
});
$('addIngredientGroup').onclick = () => { ingredientGroupsState.push({ nama_grup:'Bahan Utama', items:[{nama_bahan:'', jumlah:'', satuan:''}] }); renderIngredientGroups(); };

async function loadAll(){
  const {data: r, error: er} = await db.from('recipes').select('*').order('created_at',{ascending:false});
  if(er) return alert('Gagal ambil resep: ' + er.message);
  recipes = r || [];
  const {data: p} = await db.from('pantry_items').select('*').order('created_at',{ascending:false});
  pantry = p || [];

  const mi = await db.from('master_ingredients').select('*').order('nama_bahan',{ascending:true});
  if(!mi.error) masterIngredients = mi.data || [];
  const mu = await db.from('master_units').select('*').order('nama_satuan',{ascending:true});
  masterUnits = mu.error ? DEFAULT_UNITS.map(x=>({nama_satuan:x})) : (mu.data || []);
  if(!masterUnits.length) masterUnits = DEFAULT_UNITS.map(x=>({nama_satuan:x}));
  render();
  const syncEl = $('lastSync'); if(syncEl) syncEl.textContent = 'Update: ' + new Date().toLocaleTimeString('id-ID');
}

function render(){
  $('totalResep').textContent = recipes.length;
  $('totalFavorit').textContent = recipes.filter(r=>['Favorit Keluarga','Resep Andalan'].includes(r.status)).length;
  renderRecipes(); renderLatest(); renderPantry(); renderMasterIngredients(); renderMasterUnits(); renderIngredientOptions();
}

function recipeCard(r){
  const bahan = flatIngredients(r.bahan).slice(0,3).join(', ');
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
      <div class="recipe-content grouped-ingredients">${ingredientsDetailHtml(r.bahan)}</div>
      <h3>👨‍🍳 Cara Memasak</h3>
      <div class="recipe-content steps">${listStepsHtml(r.cara_memasak)}</div>
      <h3>🏷 Tag</h3>
      <div class="tags">${tags}</div>
      <h3>📝 Catatan Yonarta</h3>
      <p class="note-box">${escapeHtml(r.catatan_yonarta || 'Belum ada catatan.')}</p>
      <div class="actions detail-actions">
        <button class="secondary" onclick='editRecipe("${r.id}")'>Edit Resep</button>
        <button class="danger" onclick='deleteRecipe("${r.id}")'>Hapus Resep</button>
      </div>
    </div>`;
  go('detail');
  window.scrollTo({top:0, behavior:'smooth'});
};

function renderLatest(){ $('latestList').innerHTML = recipes.slice(0,5).map(recipeCard).join('') || '<p class="muted">Belum ada resep.</p>'; }
function renderRecipes(){
  const q = $('searchInput').value.toLowerCase();
  const filtered = recipes.filter(r => {
    const hay = (JSON.stringify(r) + ' ' + flatIngredients(r.bahan).join(' ')).toLowerCase();
    const okSearch = !q || hay.includes(q);
    const okFilter = !activeFilter || r.bahan_utama === activeFilter;
    return okSearch && okFilter;
  });
  $('recipeList').innerHTML = filtered.map(recipeCard).join('') || '<p class="muted">Tidak ada resep.</p>';
}
$('searchInput').addEventListener('input', renderRecipes);
document.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');activeFilter=c.dataset.filter;renderRecipes();});

function renderIngredientOptions(){
  $('ingredientOptions').innerHTML = masterIngredients.map(i=>`<option value="${escapeHtml(i.nama_bahan)}"></option>`).join('');
}
function unitSelectHtml(value=''){
  const opts = masterUnits.map(u => u.nama_satuan || u).filter(Boolean);
  return `<select class="ing-unit"><option value="">Satuan</option>${opts.map(u=>`<option ${u===value?'selected':''}>${escapeHtml(u)}</option>`).join('')}</select>`;
}
function groupSelectHtml(value=''){
  const custom = value && !DEFAULT_GROUPS.includes(value) ? [value] : [];
  return `<select class="group-name">${[...custom, ...DEFAULT_GROUPS].map(g=>`<option ${g===value?'selected':''}>${escapeHtml(g)}</option>`).join('')}</select>`;
}
function renderIngredientGroups(){
  const wrap = $('ingredientGroups');
  if(!ingredientGroupsState.length) ingredientGroupsState = [{ nama_grup:'Bahan Utama', items:[{nama_bahan:'', jumlah:'', satuan:''}] }];
  wrap.innerHTML = ingredientGroupsState.map((g, gi)=>`
    <div class="ingredient-group" data-gi="${gi}">
      <div class="ingredient-group-head">
        ${groupSelectHtml(g.nama_grup)}
        <button type="button" class="ghost small" onclick="addIngredientRow(${gi})">+ Bahan</button>
        <button type="button" class="danger small" onclick="removeIngredientGroup(${gi})">Hapus Grup</button>
      </div>
      <div class="ingredient-rows">
        ${(g.items||[]).map((it, ii)=>`
          <div class="ingredient-row" data-ii="${ii}">
            <input class="ing-name" list="ingredientOptions" placeholder="Nama bahan" value="${escapeHtml(it.nama_bahan||'')}" />
            <input class="ing-qty" type="number" step="0.01" placeholder="Jumlah" value="${escapeHtml(it.jumlah||'')}" />
            ${unitSelectHtml(it.satuan||'')}
            <button type="button" class="ghost small" onclick="removeIngredientRow(${gi},${ii})">×</button>
          </div>`).join('')}
      </div>
    </div>`).join('');
}
function syncIngredientGroupsFromDom(){
  ingredientGroupsState = Array.from(document.querySelectorAll('.ingredient-group')).map(g => ({
    nama_grup: g.querySelector('.group-name').value,
    items: Array.from(g.querySelectorAll('.ingredient-row')).map(r => ({
      nama_bahan: r.querySelector('.ing-name').value.trim(),
      jumlah: r.querySelector('.ing-qty').value ? Number(r.querySelector('.ing-qty').value) : '',
      satuan: r.querySelector('.ing-unit').value
    })).filter(i => i.nama_bahan)
  })).filter(g => g.items.length);
}
window.addIngredientRow = (gi)=>{ syncIngredientGroupsFromDom(); ingredientGroupsState[gi].items.push({nama_bahan:'', jumlah:'', satuan:''}); renderIngredientGroups(); };
window.removeIngredientRow = (gi,ii)=>{ syncIngredientGroupsFromDom(); ingredientGroupsState[gi].items.splice(ii,1); if(!ingredientGroupsState[gi].items.length) ingredientGroupsState[gi].items.push({nama_bahan:'', jumlah:'', satuan:''}); renderIngredientGroups(); };
window.removeIngredientGroup = (gi)=>{ syncIngredientGroupsFromDom(); ingredientGroupsState.splice(gi,1); renderIngredientGroups(); };

$('recipeForm').onsubmit = async (e)=>{
  e.preventDefault();
  const id = $('recipeId').value;
  syncIngredientGroupsFromDom();
  let uploadedPhotoUrl = null;
  const selectedPhoto = $('foto_file').files?.[0];
  try { if(selectedPhoto) uploadedPhotoUrl = await uploadRecipePhoto(selectedPhoto); } catch(err){ return alert(err.message); }
  const existing = id ? recipes.find(r=>r.id===id) : null;
  const payload = {
    nama_resep: $('nama_resep').value.trim(),
    bahan_utama: $('bahan_utama').value.trim(),
    jenis_hidangan: $('jenis_hidangan').value.trim(),
    durasi_menit: $('durasi_menit').value ? Number($('durasi_menit').value) : null,
    porsi: $('porsi').value ? Number($('porsi').value) : null,
    status: $('status').value,
    rating_keluarga: Math.min(Number($('rating_keluarga').value || 0), 5),
    bahan: ingredientGroupsState,
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
  ingredientGroupsState = normalizeIngredientGroups(r.bahan);
  renderIngredientGroups();
  $('cara_memasak').value=(r.cara_memasak||[]).join('\n'); $('tag').value=(r.tag||[]).join(', ');
  setPhotoPreview(r.foto_url || null);
  $('foto_file').value = '';
  go('add');
  window.scrollTo({top:0, behavior:'smooth'});
};

window.deleteRecipe = async (id)=>{ if(!confirm('Hapus resep ini?')) return; const {error}=await db.from('recipes').delete().eq('id',id); if(error) alert(error.message); await loadAll(); go('recipes'); };
function resetForm(){ $('recipeForm').reset(); $('recipeId').value=''; $('formTitle').textContent='Tambah Resep'; $('rating_keluarga').value=0; setPhotoPreview(null); ingredientGroupsState = [{ nama_grup:'Bahan Utama', items:[{nama_bahan:'', jumlah:'', satuan:''}] }]; renderIngredientGroups(); }

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
function renderPantry(){ $('pantryList').innerHTML = pantry.map(p=>`<div class="item"><h3>${escapeHtml(p.nama_bahan)}</h3><p>${p.jumlah||''} ${escapeHtml(p.satuan||'')}</p></div>`).join('') || '<p class="muted">Belum ada stok dapur.</p>'; }

$('masterIngredientForm').onsubmit = async (e)=>{
  e.preventDefault();
  const payload = { nama_bahan: $('masterIngredientName').value.trim(), kategori_bahan: $('masterIngredientCategory').value };
  const { error } = await db.from('master_ingredients').insert(payload);
  if(error) return alert('Gagal tambah master bahan: ' + error.message);
  $('masterIngredientForm').reset(); await loadAll();
};
window.deleteMasterIngredient = async (id)=>{ if(!confirm('Hapus master bahan ini?')) return; const {error}=await db.from('master_ingredients').delete().eq('id',id); if(error) alert(error.message); await loadAll(); };
function renderMasterIngredients(){
  $('masterIngredientList').innerHTML = masterIngredients.map(i=>`<div class="item compact"><div><h3>${escapeHtml(i.nama_bahan)}</h3><p>${escapeHtml(i.kategori_bahan||'')}</p></div><button class="danger small" onclick='deleteMasterIngredient("${i.id}")'>Hapus</button></div>`).join('') || '<p class="muted">Belum ada master bahan.</p>';
}
$('masterUnitForm').onsubmit = async (e)=>{
  e.preventDefault();
  const { error } = await db.from('master_units').insert({ nama_satuan: $('masterUnitName').value.trim() });
  if(error) return alert('Gagal tambah satuan: ' + error.message);
  $('masterUnitForm').reset(); await loadAll(); renderIngredientGroups();
};
window.deleteMasterUnit = async (id)=>{ if(!confirm('Hapus satuan ini?')) return; const {error}=await db.from('master_units').delete().eq('id',id); if(error) alert(error.message); await loadAll(); renderIngredientGroups(); };
function renderMasterUnits(){
  $('masterUnitList').innerHTML = masterUnits.map(u=> u.id ? `<span class="tag-pill">${escapeHtml(u.nama_satuan)} <button class="mini-x" onclick='deleteMasterUnit("${u.id}")'>×</button></span>` : `<span class="tag-pill">${escapeHtml(u.nama_satuan)}</span>`).join('');
}

resetForm();
loadAll();

let recipeHistory = JSON.parse(localStorage.getItem('recipeHistory')||'[]');
function renderHistory(){
 const el=document.getElementById('historyList'); if(!el) return;
 el.innerHTML=recipeHistory.map(id=>{const r=recipes.find(x=>x.id===id); return r?`<div class="item" onclick='viewRecipe("${r.id}")'><h3>${r.nama_resep}</h3></div>`:''}).join('')||'<p class="muted">Belum ada.</p>';
}
document.getElementById('randomRecipeBtn')?.addEventListener('click',()=>{
 if(!recipes.length) return;
 const r=recipes[Math.floor(Math.random()*recipes.length)];
 document.getElementById('randomResult').innerHTML=`<div class="item"><h3>${r.nama_resep}</h3><p>${r.durasi_menit||'-'} menit</p></div>`;
});
const _oldView=window.viewRecipe;
window.viewRecipe=(id)=>{
 recipeHistory=[id,...recipeHistory.filter(x=>x!==id)].slice(0,10);
 localStorage.setItem('recipeHistory',JSON.stringify(recipeHistory));
 _oldView(id); renderHistory();
}
setTimeout(renderHistory,500);
