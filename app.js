const SUPABASE_URL = 'https://eswokjdhyktikcxranpo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pV3wADDW91aY_0fbOSS39g_cUt39Cnu';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const PHOTO_BUCKET = 'recipe-photos';

let recipes = [];
let masterIngredients = [];
let masterUnits = [];
let activeFilter = '';
let ingredientGroupsState = [];
let mealPlan = []; // [{day:1, meals:[{recipeId, locked},...]}]

const DEFAULT_UNITS = ['gr','kg','ml','liter','butir','buah','siung','ikat','lembar','sdm','sdt','cup','pcs'];
const DEFAULT_GROUPS = ['Bahan Utama','Marinasi','Saus','Pelengkap','Bumbu Halus','Bumbu Tumis','Kuah','Topping','Lainnya'];
const MEAL_LABELS = ['Pagi','Siang','Malam'];

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
$('refreshBtn').onclick = loadAll;
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

  const mi = await db.from('master_ingredients').select('*').order('nama_bahan',{ascending:true});
  if(!mi.error) masterIngredients = mi.data || [];
  const mu = await db.from('master_units').select('*').order('nama_satuan',{ascending:true});
  masterUnits = mu.error ? DEFAULT_UNITS.map(x=>({nama_satuan:x})) : (mu.data || []);
  if(!masterUnits.length) masterUnits = DEFAULT_UNITS.map(x=>({nama_satuan:x}));
  render();
}

function render(){
  $('totalResep').textContent = recipes.length;
  $('totalFavorit').textContent = recipes.filter(r=>['Favorit Keluarga','Resep Andalan'].includes(r.status)).length;
  renderRecipes(); renderLatest(); renderMasterIngredients(); renderMasterUnits(); renderIngredientOptions();
  renderDashboard(); renderGallery(); renderHistory();
}

function recipeCard(r){
  const bahan = flatIngredients(r.bahan).slice(0,3).join(', ');
  const sourceBadge = r.sumber_resep ? `<span class="tag-pill source-badge">${r.sumber_resep==='YouTube'?'📺':r.sumber_resep==='AI'?'🤖':'✍️'} ${r.sumber_resep}</span>`:'';
  const photo = r.foto_url ? `<img class="recipe-photo" src="${r.foto_url}" alt="Foto ${escapeHtml(r.nama_resep)}" loading="lazy" />` : '';
  return `<div class="item clickable-card" onclick='viewRecipe("${r.id}")' role="button" tabindex="0" onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();viewRecipe("${r.id}");}'>${photo}<h3>${escapeHtml(r.nama_resep)}</h3>${sourceBadge}<p>${escapeHtml(r.bahan_utama || '-')} · ${escapeHtml(r.jenis_hidangan || '-')} · ${escapeHtml(r.status || '-')}</p><p>${stars(r.rating_keluarga)}</p><p>${escapeHtml(bahan)}</p><div class="actions" onclick="event.stopPropagation()"><button class="secondary" onclick='editRecipe("${r.id}")'>Edit</button><button class="danger" onclick='deleteRecipe("${r.id}")'>Hapus</button></div></div>`;
}

window.viewRecipe = (id) => {
  const r = recipes.find(x=>x.id===id);
  if(!r) return alert('Resep tidak ditemukan.');
  // track history
  recipeHistory = [id, ...recipeHistory.filter(x=>x!==id)].slice(0,10);
  localStorage.setItem('recipeHistory', JSON.stringify(recipeHistory));

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
        <div><b>Sumber</b><span>${escapeHtml(r.sumber_resep || 'Manual')}</span></div>
        <div><b>Link</b><span>${r.link_sumber ? `<a href="${escapeHtml(r.link_sumber)}" target="_blank" rel="noopener">Buka link</a>` : '-'}</span></div>
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
  renderHistory();
};

function renderLatest(){ $('latestList').innerHTML = recipes.slice(0,5).map(recipeCard).join('') || '<p class="muted">Belum ada resep.</p>'; }
function renderRecipes(){
  const q = $('searchInput').value.toLowerCase();
  const filtered = recipes.filter(r => {
    const hay = (JSON.stringify(r) + ' ' + flatIngredients(r.bahan).join(' ')).toLowerCase();
    const okSearch = !q || hay.includes(q);
    const sourceFilters=['Manual','YouTube','AI'];
    const okFilter = !activeFilter || (sourceFilters.includes(activeFilter) ? (r.sumber_resep||'Manual')===activeFilter : r.bahan_utama===activeFilter);
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
    foto_url: uploadedPhotoUrl || existing?.foto_url || null,
    sumber_resep: $('sumber_resep') ? $('sumber_resep').value : 'Manual'
  };
  const res = id ? await db.from('recipes').update(payload).eq('id', id) : await db.from('recipes').insert(payload);
  if(res.error) return alert('Gagal simpan: ' + res.error.message);
  resetForm(); await loadAll(); go('recipes');
};

window.editRecipe = (id)=>{
  const r = recipes.find(x=>x.id===id); if(!r) return;
  $('formTitle').textContent='Edit Resep'; $('recipeId').value=r.id;
  ['nama_resep','bahan_utama','jenis_hidangan','status','catatan_yonarta','link_sumber','sumber_resep'].forEach(k=>$(k).value=r[k]||'');
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

// ========== MEAL PLANNER ==========

function getFilteredPool(){
  const mode = $('modeRandom').value;
  let pool = [...recipes];
  if(mode==='fav') pool = pool.filter(r=>['Favorit Keluarga','Resep Andalan'].includes(r.status));
  if(mode==='fast') pool = pool.filter(r=>(r.durasi_menit||999)<=30);
  if(mode==='hemat') pool = pool.filter(r=>(r.tag||[]).includes('hemat'));
  return pool;
}

function pickRandom(pool, exclude=[]){
  const available = pool.filter(r=>!exclude.includes(r.id));
  const src = available.length ? available : pool;
  return src[Math.floor(Math.random()*src.length)];
}

$('generatePlan').onclick = ()=>{
  const days = Math.min(Number($('jumlahHari').value || 7), 14);
  const meals = Math.min(Number($('menuPerHari').value || 2), 3);
  const pool = getFilteredPool();
  if(!pool.length) return alert('Belum ada resep yang cocok dengan mode ini.');

  const newPlan = [];
  const usedIds = [];
  for(let d=1; d<=days; d++){
    // preserve locked meals from existing plan
    const existingDay = mealPlan.find(x=>x.day===d);
    const dayMeals = [];
    for(let m=0; m<meals; m++){
      const existingMeal = existingDay?.meals?.[m];
      if(existingMeal?.locked){
        dayMeals.push({...existingMeal});
        usedIds.push(existingMeal.recipeId);
      } else {
        const pick = pickRandom(pool, usedIds);
        dayMeals.push({ recipeId: pick.id, locked: false });
        usedIds.push(pick.id);
      }
    }
    newPlan.push({ day: d, meals: dayMeals });
  }
  mealPlan = newPlan;
  renderMealPlan();
};

window.toggleLockMeal = (day, mealIdx) => {
  const d = mealPlan.find(x=>x.day===day);
  if(!d || !d.meals[mealIdx]) return;
  d.meals[mealIdx].locked = !d.meals[mealIdx].locked;
  renderMealPlan();
};

window.randomizeDayMeal = (day, mealIdx) => {
  const d = mealPlan.find(x=>x.day===day);
  if(!d || !d.meals[mealIdx]) return;
  if(d.meals[mealIdx].locked) return;
  const pool = getFilteredPool();
  if(!pool.length) return;
  const usedInDay = d.meals.filter((_,i)=>i!==mealIdx).map(m=>m.recipeId);
  const pick = pickRandom(pool, usedInDay);
  d.meals[mealIdx].recipeId = pick.id;
  renderMealPlan();
};

window.randomizeDay = (day) => {
  const d = mealPlan.find(x=>x.day===day);
  if(!d) return;
  const pool = getFilteredPool();
  if(!pool.length) return;
  const usedIds = [];
  d.meals.forEach((meal, i) => {
    if(!meal.locked){
      const pick = pickRandom(pool, usedIds);
      meal.recipeId = pick.id;
    }
    usedIds.push(meal.recipeId);
  });
  renderMealPlan();
};

function renderMealPlan(){
  if(!mealPlan.length){
    $('planResult').innerHTML = '';
    $('planActions').style.display = 'none';
    $('shoppingListResult').innerHTML = '';
    return;
  }

  let html = '<div class="plan-grid">';
  mealPlan.forEach(d => {
    html += `<div class="plan-day">
      <div class="plan-day-header">
        <h3>Hari ${d.day}</h3>
        <button class="ghost small" onclick="randomizeDay(${d.day})" title="Acak semua menu hari ini">🔄</button>
      </div>`;
    d.meals.forEach((meal, mi) => {
      const r = recipes.find(x=>x.id===meal.recipeId);
      const name = r ? r.nama_resep : '(resep dihapus)';
      const label = MEAL_LABELS[mi] || 'Menu';
      const lockIcon = meal.locked ? '🔒' : '🔓';
      const lockClass = meal.locked ? 'locked' : '';
      html += `<div class="plan-meal ${lockClass}">
        <div class="plan-meal-label">${label}</div>
        <div class="plan-meal-name" onclick="if(${!!r})viewRecipe('${meal.recipeId}')">${escapeHtml(name)}</div>
        <div class="plan-meal-actions">
          <button class="plan-btn" onclick="toggleLockMeal(${d.day},${mi})" title="${meal.locked?'Unlock':'Lock'}">${lockIcon}</button>
          <button class="plan-btn" onclick="randomizeDayMeal(${d.day},${mi})" title="Ganti menu ini" ${meal.locked?'disabled':''}>🔄</button>
        </div>
      </div>`;
    });
    html += '</div>';
  });
  html += '</div>';
  $('planResult').innerHTML = html;
  $('planActions').style.display = 'block';
  $('shoppingListResult').innerHTML = '';
}

// ========== SHOPPING LIST ==========

$('generateShoppingList').onclick = () => {
  if(!mealPlan.length) return;

  // collect all recipe IDs from the plan
  const recipeIds = [...new Set(mealPlan.flatMap(d => d.meals.map(m => m.recipeId)))];
  // count how many times each recipe appears
  const recipeCounts = {};
  mealPlan.forEach(d => d.meals.forEach(m => {
    recipeCounts[m.recipeId] = (recipeCounts[m.recipeId] || 0) + 1;
  }));

  // aggregate ingredients
  const ingredientMap = {}; // key: "nama_bahan|satuan" => {nama_bahan, jumlah, satuan, kategori}
  recipeIds.forEach(id => {
    const r = recipes.find(x => x.id === id);
    if (!r || !r.bahan) return;
    const groups = normalizeIngredientGroups(r.bahan);
    const multiplier = recipeCounts[id] || 1;
    groups.forEach(g => {
      (g.items || []).forEach(item => {
        if (!item.nama_bahan) return;
        const key = (item.nama_bahan + '|' + (item.satuan || '')).toLowerCase();
        if (!ingredientMap[key]) {
          // find category from master
          const master = masterIngredients.find(mi => mi.nama_bahan.toLowerCase() === item.nama_bahan.toLowerCase());
          ingredientMap[key] = {
            nama_bahan: item.nama_bahan,
            jumlah: 0,
            satuan: item.satuan || '',
            kategori: master?.kategori_bahan || 'Lainnya'
          };
        }
        if (item.jumlah) {
          ingredientMap[key].jumlah += Number(item.jumlah) * multiplier;
        }
      });
    });
  });

  const items = Object.values(ingredientMap).sort((a,b) => a.kategori.localeCompare(b.kategori) || a.nama_bahan.localeCompare(b.nama_bahan));

  if (!items.length) {
    $('shoppingListResult').innerHTML = '<p class="muted">Resep dalam jadwal belum memiliki bahan terstruktur.</p>';
    return;
  }

  // group by category
  const byCategory = {};
  items.forEach(it => {
    if (!byCategory[it.kategori]) byCategory[it.kategori] = [];
    byCategory[it.kategori].push(it);
  });

  const categoryIcons = { 'Bumbu':'🧂', 'Daging':'🥩', 'Sayur':'🥬', 'Karbohidrat':'🍚', 'Buah':'🍎', 'Lainnya':'📦' };

  let html = '<div class="shopping-list">';
  html += '<h3>🛒 Daftar Belanja</h3>';
  html += `<p class="muted">${mealPlan.length} hari · ${mealPlan.reduce((s,d)=>s+d.meals.length,0)} menu · ${items.length} bahan</p>`;

  Object.entries(byCategory).forEach(([cat, catItems]) => {
    const icon = categoryIcons[cat] || '📦';
    html += `<div class="shop-category">
      <h4>${icon} ${escapeHtml(cat)}</h4>
      <ul class="shop-items">`;
    catItems.forEach((it, idx) => {
      const qtyStr = it.jumlah ? `${Number.isInteger(it.jumlah) ? it.jumlah : it.jumlah.toFixed(1)} ${it.satuan}` : (it.satuan || 'secukupnya');
      const checkId = `shop-${cat}-${idx}`;
      html += `<li>
        <label class="shop-item">
          <input type="checkbox" id="${checkId}" onchange="this.closest('li').classList.toggle('checked')">
          <span class="shop-name">${escapeHtml(it.nama_bahan)}</span>
          <span class="shop-qty">${escapeHtml(qtyStr)}</span>
        </label>
      </li>`;
    });
    html += '</ul></div>';
  });
  html += '</div>';
  $('shoppingListResult').innerHTML = html;
  $('shoppingListResult').scrollIntoView({ behavior: 'smooth' });
};

// ========== MASTER BAHAN/SATUAN ==========

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

// ========== DASHBOARD / GALLERY / HISTORY ==========

function renderDashboard(){
  if($('dash5star')) $('dash5star').textContent = recipes.filter(r=>Number(r.rating_keluarga)===5).length;
  if($('dashLatest')) $('dashLatest').textContent = Math.min(recipes.length,5);
}

function renderGallery(){
  const el=$('galleryGrid'); if(!el) return;
  el.innerHTML=recipes.filter(r=>r.foto_url).map(r=>`<div class="item clickable-card" onclick='viewRecipe("${r.id}")'><img class="recipe-photo" src="${r.foto_url}"><h3>${r.nama_resep}</h3></div>`).join('') || '<p class="muted">Belum ada foto resep.</p>';
}

let recipeHistory = JSON.parse(localStorage.getItem('recipeHistory')||'[]');

function renderHistory(){
  const el=$('historyList'); if(!el) return;
  const data=recipeHistory.map(id=>recipes.find(r=>r.id===id)).filter(Boolean);
  el.innerHTML=data.map(r=>`<div class="item clickable-card" onclick='viewRecipe("${r.id}")'><h3>${r.nama_resep}</h3><p>${escapeHtml(r.bahan_utama||'')} · ${escapeHtml(r.jenis_hidangan||'')}</p></div>`).join('')||'<p class="muted">Belum ada riwayat.</p>';
}

// ========== RANDOM RECIPE ==========

$('randomRecipeBtn').onclick = ()=>{
  if(!recipes.length) return;
  const r=recipes[Math.floor(Math.random()*recipes.length)];
  $('randomResult').innerHTML=`<div class="item"><h3>${escapeHtml(r.nama_resep)}</h3><p>${escapeHtml(r.jenis_hidangan||'')} · ${escapeHtml(r.bahan_utama||'')}</p><button class="primary" onclick='viewRecipe("${r.id}")'>Lihat Resep</button></div>`;
};

// ========== INIT ==========

resetForm();
loadAll();
