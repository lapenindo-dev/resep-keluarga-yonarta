/* =====================================================
   Resep Keluarga Yonarta v2.1.1
   Login Email + Share Aplikasi + AI Menu Generator + Backup + Koleksi + Print/PDF
   AI Extract (Qwen): Foto dan Teks/Caption Manual
   ===================================================== */
const SUPABASE_URL = 'https://eswokjdhyktikcxranpo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pV3wADDW91aY_0fbOSS39g_cUt39Cnu';
let db;
try { db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); }
catch(e){ console.error('Supabase init gagal:', e); }
const PHOTO_BUCKET = 'recipe-photos';
let currentUser = null;


let recipes = [];
let masterIngredients = [];
let masterUnits = [];
let cookLog = [];
let activeFilter = '';
let ingredientGroupsState = [];
let extraPhotosState = []; // urls for current form (existing + newly uploaded)
let mealPlan = [];
let recipeHistory = [];
try { recipeHistory = JSON.parse(localStorage.getItem('recipeHistory')||'[]'); } catch(e){}
try { mealPlan = JSON.parse(localStorage.getItem('mealPlanV210') || localStorage.getItem('mealPlanV200') || localStorage.getItem('mealPlanV190') || '[]'); } catch(e){ mealPlan = []; }
let recipeCollections = {};
try { recipeCollections = JSON.parse(localStorage.getItem('recipeCollectionsV210') || '{}'); } catch(e){ recipeCollections = {}; }
const DEFAULT_COLLECTIONS = ['Menu Harian','Menu Anak','Natal','Imlek','BBQ','Favorit Mama'];

const DEFAULT_UNITS = ['gr','kg','ml','liter','butir','buah','siung','ikat','lembar','sdm','sdt','cup','pcs'];
const DEFAULT_GROUPS = ['Bahan Utama','Marinasi','Saus','Pelengkap','Bumbu Halus','Bumbu Tumis','Kuah','Topping','Lainnya'];
const MEAL_LABELS = ['Siang','Malam'];
// v2.1.0: YouTube otomatis tetap dihapus; tambah backup, koleksi, print/PDF
mealPlan = (mealPlan || []).map(d => ({ ...d, meals: Array.isArray(d.meals) ? d.meals.slice(0, 2) : [] }));

const $ = (id) => document.getElementById(id);
const lineArray = (v) => (v || '').split('\n').map(x => x.trim()).filter(Boolean);
const csvArray = (v) => (v || '').split(',').map(x => x.trim()).filter(Boolean);
const stars = (n) => n > 0 ? '⭐'.repeat(Math.min(Number(n)||0, 5)) : 'Belum ada rating';
const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const displayIngredient = (it) => `${it.nama_bahan || ''}${it.jumlah ? ' - ' + it.jumlah : ''}${it.satuan ? ' ' + it.satuan : ''}`.trim();

/* ---------- Auth helpers ---------- */

function setAuthStatus(message, type='loading'){
  const el = $('authStatus');
  if(!el) return;
  if(!message){ el.style.display='none'; el.textContent=''; el.className='ai-status'; return; }
  el.style.display='block';
  el.className='ai-status ' + type;
  el.textContent = message;
}

function renderAuthState(){
  const locked = !currentUser;
  document.body.classList.toggle('auth-locked', locked);
  const authScreen = $('authScreen');
  if(authScreen) authScreen.style.display = locked ? 'flex' : 'none';
  const titleWrap = document.querySelector('.topbar-left > div');
  let mini = $('userMini');
  if(!mini && titleWrap){
    mini = document.createElement('p');
    mini.id = 'userMini';
    mini.className = 'user-mini';
    titleWrap.appendChild(mini);
  }
  if(mini) mini.textContent = currentUser?.email ? 'Login: ' + currentUser.email : '';
}

async function initAuth(){
  if(!db){
    setAuthStatus('Database belum siap. Refresh halaman.', 'error');
    return;
  }
  try{
    const { data } = await db.auth.getSession();
    currentUser = data?.session?.user || null;
    renderAuthState();
    db.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session?.user || null;
      renderAuthState();
      if(currentUser){
        setAuthStatus(null);
        await loadAll();
      }
    });
    if(currentUser){
      await loadAll();
    } else {
      setAuthStatus('Silakan login dulu untuk membuka resep keluarga.', 'loading');
    }
  } catch(e){
    console.error('Auth init gagal:', e);
    setAuthStatus('Auth gagal dimuat: ' + e.message, 'error');
  }
}

async function sendLoginEmail(){
  const email = ($('loginEmail')?.value || '').trim();
  if(!email) return setAuthStatus('Masukkan email dulu.', 'error');
  setAuthStatus('Mengirim link login ke email...', 'loading');
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false }
  });
  if(error){
    setAuthStatus('Gagal kirim link login: ' + error.message, 'error');
    return;
  }
  setAuthStatus('✅ Link login sudah dikirim. Buka email, klik link login, lalu kembali ke aplikasi.', 'success');
}

async function logout(){
  if(!db) return;
  await db.auth.signOut();
  currentUser = null;
  recipes = []; masterIngredients = []; masterUnits = []; cookLog = [];
  renderAuthState();
  setAuthStatus('Anda sudah logout.', 'success');
}

function requireLogin(){
  if(currentUser) return true;
  renderAuthState();
  setAuthStatus('Silakan login dulu.', 'error');
  return false;
}

async function shareApp(){
  const url = window.location.origin + window.location.pathname;
  const text = `🍳 Resep Keluarga Yonarta\nBuka aplikasi resep keluarga di sini:\n${url}`;
  if(navigator.share){
    try{ await navigator.share({ title:'Resep Keluarga Yonarta', text, url }); return; }
    catch(e){ if(e.name === 'AbortError') return; }
  }
  try{
    await navigator.clipboard.writeText(text);
    alert('Link aplikasi sudah disalin. Tinggal paste ke WhatsApp keluarga.');
  } catch(e){
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
}

/* ---------- Ingredient helpers ---------- */

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

/* ---------- Photo upload ---------- */

async function uploadRecipePhoto(file){
  if(!file) return null;
  if(!requireLogin()) throw new Error('Silakan login dulu.');
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

function renderExtraPhotosPreview(){
  const el = $('extraPhotosPreview');
  if(!el) return;
  el.innerHTML = extraPhotosState.map((url, i) => `
    <div class="extra-thumb">
      <img src="${url}" alt="Foto tambahan ${i+1}" />
      <button type="button" class="thumb-remove" onclick="removeExtraPhoto(${i})">×</button>
    </div>`).join('');
}

window.removeExtraPhoto = (i) => {
  extraPhotosState.splice(i, 1);
  renderExtraPhotosPreview();
};

/* ---------- Navigation ---------- */

let navHistory = ['home'];

function go(page, opts={}){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el = $(page);
  if(el) el.classList.add('active');
  document.querySelectorAll('[data-go]').forEach(b=>b.classList.toggle('active', b.dataset.go===page));
  if(page === 'add' && !opts.keepAiPanel) clearAiPanel();
  if(!opts.skipHistory && navHistory[navHistory.length-1] !== page){
    navHistory.push(page);
  }
  updateBackButton();
}

function goBack(){
  if(navHistory.length > 1){
    navHistory.pop();
    const prev = navHistory[navHistory.length-1];
    go(prev, { skipHistory: true });
  } else {
    go('home', { skipHistory: true });
  }
}

function updateBackButton(){
  const btn = $('backBtn');
  if(!btn) return;
  btn.style.display = navHistory.length > 1 ? 'flex' : 'none';
}

/* ---------- Data loading ---------- */

async function loadAll(){
  if(!db){ alert('Koneksi database belum siap. Coba refresh halaman.'); return; }
  if(!requireLogin()) return;
  const {data: r, error: er} = await db.from('recipes').select('*').order('created_at',{ascending:false});
  if(er){ alert('Gagal ambil resep: ' + er.message); return; }
  recipes = r || [];

  const mi = await db.from('master_ingredients').select('*').order('nama_bahan',{ascending:true});
  if(!mi.error) masterIngredients = mi.data || [];
  const mu = await db.from('master_units').select('*').order('nama_satuan',{ascending:true});
  masterUnits = mu.error ? DEFAULT_UNITS.map(x=>({nama_satuan:x})) : (mu.data || []);
  if(!masterUnits.length) masterUnits = DEFAULT_UNITS.map(x=>({nama_satuan:x}));

  const cl = await db.from('cook_log').select('*').order('cooked_at',{ascending:false});
  cookLog = cl.error ? [] : (cl.data || []);
  if(cl.error) console.warn('cook_log belum tersedia (jalankan migrasi SQL):', cl.error.message);

  render();
}

/* ---------- Render orchestration ---------- */

function render(){
  $('totalResep').textContent = recipes.length;
  $('totalFavorit').textContent = recipes.filter(r=>['Favorit Keluarga','Resep Andalan'].includes(r.status)).length;
  renderRecipes(); renderLatest(); renderMasterIngredients(); renderMasterUnits(); renderIngredientOptions();
  renderCookNameOptions(); renderDashboard(); renderGallery(); renderHistory(); renderMealPlan(); renderCollections();
}

function renderCookNameOptions(){
  const names = [...new Set(recipes.map(r=>r.dimasak_oleh).filter(Boolean))];
  const el = $('cookNameOptions');
  if(el) el.innerHTML = names.map(n=>`<option value="${escapeHtml(n)}"></option>`).join('');
}

/* ---------- Recipe card ---------- */

function isFavoriteRecipe(r){
  return ['Favorit Keluarga','Resep Andalan'].includes(r.status) || Number(r.rating_keluarga) === 5;
}

function sourceIcon(src){
  return src === 'YouTube' ? '📺' : src === 'AI' ? '🤖' : '✍️';
}

function recipeCard(r){
  const ribbon = isFavoriteRecipe(r) ? '<div class="ribbon" title="Favorit Keluarga"></div>' : '';
  const photoStyle = r.foto_url ? `<img src="${r.foto_url}" alt="Foto ${escapeHtml(r.nama_resep)}" loading="lazy" />` : '';
  return `<div class="recipe-card" onclick='viewRecipe("${r.id}")' role="button" tabindex="0" onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();viewRecipe("${r.id}");}'>
    <div class="recipe-photo-wrap">
      ${ribbon}
      <button class="share-btn" onclick='event.stopPropagation();shareRecipe("${r.id}")' title="Bagikan resep">📤</button>
      ${photoStyle}
      <span class="source-stamp">${sourceIcon(r.sumber_resep)} ${escapeHtml(r.sumber_resep || 'Manual')}</span>
    </div>
    <div class="recipe-info">
      <h3>${escapeHtml(r.nama_resep)}</h3>
      <p class="recipe-meta">${escapeHtml(r.bahan_utama || '-')} · ${escapeHtml(r.jenis_hidangan || '-')}${r.durasi_menit ? ' · ' + escapeHtml(r.durasi_menit) + ' menit' : ''}</p>
      ${r.dimasak_oleh ? `<p class="cook-by">👤 Dimasak oleh ${escapeHtml(r.dimasak_oleh)}</p>` : ''}
      <div class="stars">${stars(r.rating_keluarga)}</div>
      ${collectionPillsHtml(r.id)}
      <div class="card-actions" onclick="event.stopPropagation()">
        <button class="secondary" onclick='editRecipe("${r.id}")'>Edit</button>
        <button class="danger" onclick='deleteRecipe("${r.id}")'>Hapus</button>
      </div>
    </div>
  </div>`;
}

/* ---------- Share recipe ---------- */

function buildRecipeShareText(r){
  const bahan = flatIngredients(r.bahan);
  let text = `🍳 ${r.nama_resep}\n`;
  text += `${r.bahan_utama || ''}${r.jenis_hidangan ? ' · ' + r.jenis_hidangan : ''}${r.durasi_menit ? ' · ' + r.durasi_menit + ' menit' : ''}\n\n`;
  if(bahan.length){
    text += `Bahan:\n${bahan.map(b=>'• '+b).join('\n')}\n\n`;
  }
  if(Array.isArray(r.cara_memasak) && r.cara_memasak.length){
    text += `Cara Memasak:\n${r.cara_memasak.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\n`;
  }
  if(r.link_sumber) text += `Sumber: ${r.link_sumber}\n`;
  text += '\n— Resep Keluarga Yonarta';
  return text;
}

window.shareRecipe = async (id) => {
  const r = recipes.find(x=>x.id===id);
  if(!r) return;
  const text = buildRecipeShareText(r);
  if(navigator.share){
    try {
      await navigator.share({ title: r.nama_resep, text });
      return;
    } catch(e){ if(e.name === 'AbortError') return; }
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    alert('Resep disalin! Siap dibagikan ke WhatsApp atau lainnya.');
  } catch(e){
    const url = 'https://wa.me/?text=' + encodeURIComponent(text);
    window.open(url, '_blank');
  }
};

/* ---------- Recipe detail ---------- */

window.viewRecipe = (id) => {
  const r = recipes.find(x=>x.id===id);
  if(!r) return alert('Resep tidak ditemukan.');
  recipeHistory = [id, ...recipeHistory.filter(x=>x!==id)].slice(0,10);
  try { localStorage.setItem('recipeHistory', JSON.stringify(recipeHistory)); } catch(e){}

  const allPhotos = [r.foto_url, ...(Array.isArray(r.foto_urls) ? r.foto_urls : [])].filter(Boolean);
  let photoBlock = '';
  if(allPhotos.length){
    photoBlock = `<div class="detail-photo-wrap">
      <img id="detailMainPhoto" src="${allPhotos[0]}" alt="Foto ${escapeHtml(r.nama_resep)}" />
      <button class="detail-share-btn" onclick='shareRecipe("${r.id}")' title="Bagikan resep">📤</button>
    </div>`;
    if(allPhotos.length > 1){
      photoBlock += `<div class="photo-thumbs">${allPhotos.map((url,i)=>`<img src="${url}" class="thumb${i===0?' active':''}" onclick="document.getElementById('detailMainPhoto').src='${url}';this.parentElement.querySelectorAll('.thumb').forEach(t=>t.classList.remove('active'));this.classList.add('active')" />`).join('')}</div>`;
    }
  } else {
    photoBlock = `<div class="actions" style="margin-top:0"><button class="secondary wide" onclick='shareRecipe("${r.id}")'>📤 Bagikan Resep</button></div>`;
  }

  const cookCount = cookLog.filter(c=>c.recipe_id===r.id).length;
  const lastCooked = cookLog.filter(c=>c.recipe_id===r.id)[0];
  const cookInfo = cookCount > 0
    ? `<span class="cook-count-badge">🔥 Dimasak ${cookCount}x${lastCooked ? ' · terakhir ' + new Date(lastCooked.cooked_at).toLocaleDateString('id-ID',{day:'numeric',month:'short'}) : ''}</span>`
    : '<span class="muted">Belum pernah ditandai dimasak</span>';

  const tags = Array.isArray(r.tag) && r.tag.length ? r.tag.map(t=>`<span class="tag-pill">${escapeHtml(t)}</span>`).join('') : '<span class="muted">Belum ada tag</span>';
  $('recipeDetail').innerHTML = `
    ${photoBlock}
    <div class="detail-card">
      <h2>${escapeHtml(r.nama_resep)}</h2>
      <p class="rating-line">${stars(r.rating_keluarga)}</p>
      <div class="cook-track-row">
        ${cookInfo}
        <button class="primary small" onclick='markAsCooked("${r.id}")'>✅ Tandai Sudah Dimasak</button>
      </div>
      <div class="collection-control">
        <b>📁 Koleksi</b>
        <div>${collectionPillsHtml(r.id) || '<span class="muted">Belum masuk koleksi</span>'}</div>
        <select id="detailCollectionSelect">${collectionSelectOptions(r.id)}</select>
        <button class="secondary small" onclick='addRecipeToCollectionFromDetail("${r.id}")'>+ Masukkan Koleksi</button>
      </div>
      <div class="meta-grid">
        <div><b>Bahan Utama</b><span>${escapeHtml(r.bahan_utama || '-')}</span></div>
        <div><b>Jenis Hidangan</b><span>${escapeHtml(r.jenis_hidangan || '-')}</span></div>
        <div><b>Durasi</b><span>${r.durasi_menit ? escapeHtml(r.durasi_menit + ' menit') : '-'}</span></div>
        <div><b>Porsi</b><span>${r.porsi ? escapeHtml(r.porsi + ' porsi') : '-'}</span></div>
        <div><b>Dimasak Oleh</b><span>${escapeHtml(r.dimasak_oleh || '-')}</span></div>
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
        <button class="secondary" onclick='printRecipe("${r.id}")'>🖨️ Print / PDF</button>
        <button class="secondary" onclick='editRecipe("${r.id}")'>Edit Resep</button>
        <button class="danger" onclick='deleteRecipe("${r.id}")'>Hapus Resep</button>
      </div>
    </div>`;
  go('detail');
  window.scrollTo({top:0, behavior:'smooth'});
  renderHistory();
};

window.markAsCooked = async (id) => {
  if(!db || !requireLogin()) return;
  const { error } = await db.from('cook_log').insert({ recipe_id: id });
  if(error){
    alert('Gagal menandai. Pastikan migrasi SQL cook_log sudah dijalankan.\n' + error.message);
    return;
  }
  const cl = await db.from('cook_log').select('*').order('cooked_at',{ascending:false});
  if(!cl.error) cookLog = cl.data || [];
  renderDashboard();
  viewRecipe(id);
};

/* ---------- Recipe list / search / filter ---------- */

function renderLatest(){ $('latestList').innerHTML = recipes.slice(0,5).map(recipeCard).join('') || '<p class="muted">Belum ada resep.</p>'; }

function renderRecipes(){
  const q = ($('searchInput').value || '').toLowerCase();
  const filtered = recipes.filter(r => {
    const hay = (JSON.stringify(r) + ' ' + flatIngredients(r.bahan).join(' ')).toLowerCase();
    const okSearch = !q || hay.includes(q);
    const sourceFilters=['Manual','YouTube','AI'];
    const okFilter = !activeFilter || (sourceFilters.includes(activeFilter) ? (r.sumber_resep||'Manual')===activeFilter : r.bahan_utama===activeFilter);
    return okSearch && okFilter;
  });
  $('recipeList').innerHTML = filtered.map(recipeCard).join('') || '<p class="muted">Tidak ada resep.</p>';
}

/* ---------- Ingredient editor ---------- */

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

/* ---------- Recipe form submit ---------- */

async function handleRecipeSubmit(e){
  e.preventDefault();
  if(!requireLogin()) return;
  const id = $('recipeId').value;
  syncIngredientGroupsFromDom();
  let uploadedPhotoUrl = null;
  const selectedPhoto = $('foto_file').files?.[0];
  try { if(selectedPhoto) uploadedPhotoUrl = await uploadRecipePhoto(selectedPhoto); } catch(err){ return alert(err.message); }

  // Upload any newly selected extra photos
  const extraFiles = Array.from($('foto_files_extra').files || []);
  if(extraFiles.length){
    try {
      for(const f of extraFiles){
        const url = await uploadRecipePhoto(f);
        if(url) extraPhotosState.push(url);
      }
    } catch(err){ return alert(err.message); }
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
    bahan: ingredientGroupsState,
    cara_memasak: lineArray($('cara_memasak').value),
    tag: csvArray($('tag').value),
    catatan_yonarta: $('catatan_yonarta').value.trim(),
    link_sumber: $('link_sumber').value.trim(),
    foto_url: uploadedPhotoUrl || existing?.foto_url || null,
    foto_urls: extraPhotosState,
    dimasak_oleh: $('dimasak_oleh').value.trim(),
    sumber_resep: $('sumber_resep') ? $('sumber_resep').value : 'Manual'
  };
  const res = id ? await db.from('recipes').update(payload).eq('id', id) : await db.from('recipes').insert(payload);
  if(res.error) return alert('Gagal simpan: ' + res.error.message);
  resetForm(); await loadAll(); go('recipes');
}

window.editRecipe = (id)=>{
  const r = recipes.find(x=>x.id===id); if(!r) return;
  $('formTitle').textContent='Edit Resep'; $('recipeId').value=r.id;
  ['nama_resep','bahan_utama','jenis_hidangan','status','catatan_yonarta','link_sumber','sumber_resep','dimasak_oleh'].forEach(k=>$(k).value=r[k]||'');
  $('durasi_menit').value=r.durasi_menit||''; $('porsi').value=r.porsi||''; $('rating_keluarga').value=r.rating_keluarga||0;
  ingredientGroupsState = normalizeIngredientGroups(r.bahan);
  renderIngredientGroups();
  $('cara_memasak').value=(r.cara_memasak||[]).join('\n'); $('tag').value=(r.tag||[]).join(', ');
  setPhotoPreview(r.foto_url || null);
  $('foto_file').value = '';
  $('foto_files_extra').value = '';
  extraPhotosState = Array.isArray(r.foto_urls) ? [...r.foto_urls] : [];
  renderExtraPhotosPreview();
  go('add');
  window.scrollTo({top:0, behavior:'smooth'});
};

window.deleteRecipe = async (id)=>{
  if(!requireLogin()) return;
  if(!confirm('Hapus resep ini?')) return;
  const {error}=await db.from('recipes').delete().eq('id',id);
  if(error) alert(error.message);
  Object.keys(recipeCollections).forEach(name => { recipeCollections[name] = (recipeCollections[name]||[]).filter(x=>x!==id); });
  saveCollections();
  await loadAll(); go('recipes');
};

function resetForm(){
  $('recipeForm').reset();
  $('recipeId').value='';
  $('formTitle').textContent='Tambah Resep';
  $('rating_keluarga').value=0;
  setPhotoPreview(null);
  extraPhotosState = [];
  renderExtraPhotosPreview();
  ingredientGroupsState = [{ nama_grup:'Bahan Utama', items:[{nama_bahan:'', jumlah:'', satuan:''}] }];
  renderIngredientGroups();
}

/* ========== MEAL PLANNER ========== */

function getFilteredPool(){
  const mode = $('modeRandom').value;
  let pool = [...recipes];
  if(mode==='fav') pool = pool.filter(r=>['Favorit Keluarga','Resep Andalan'].includes(r.status));
  if(mode==='fast') pool = pool.filter(r=>(r.durasi_menit||999)<=30);
  return pool;
}

function pickRandom(pool, exclude=[]){
  const available = pool.filter(r=>!exclude.includes(r.id));
  const src = available.length ? available : pool;
  return src[Math.floor(Math.random()*src.length)];
}

function formatPlanDate(dateObj){
  return dateObj.toLocaleDateString('id-ID', { weekday:'short', day:'numeric', month:'short' });
}

function saveMealPlan(){
  try { localStorage.setItem('mealPlanV210', JSON.stringify(mealPlan)); } catch(e){}
}

function buildPlanText(){
  if(!mealPlan.length) return '';
  let text = '📅 JADWAL MENU KELUARGA\n\n';
  mealPlan.forEach(d => {
    const dateLabel = d.date ? formatPlanDate(new Date(d.date)) : `Hari ${d.day}`;
    text += `${dateLabel}\n`;
    d.meals.forEach((m,i) => {
      const r = recipes.find(x=>x.id===m.recipeId);
      text += `- ${MEAL_LABELS[i] || 'Menu'}: ${r ? r.nama_resep : '?'}\n`;
    });
    text += '\n';
  });
  return text.trim();
}

window.copyMealPlan = (evt) => {
  const text = buildPlanText();
  if(!text) return;
  navigator.clipboard.writeText(text).then(()=>{
    const btn = evt?.target;
    if(btn){ const orig = btn.textContent; btn.textContent = '✅ Jadwal tersalin!'; setTimeout(()=>btn.textContent=orig, 1500); }
  }).catch(()=>alert('Gagal copy jadwal.'));
};

window.clearMealPlan = () => {
  if(!mealPlan.length) return;
  if(!confirm('Hapus jadwal menu yang sedang tampil?')) return;
  mealPlan = [];
  saveMealPlan();
  renderMealPlan();
};

function setPlanAiStatus(message, type){
  const el = $('planAiStatus');
  if(!el) return;
  if(!message){ el.style.display = 'none'; el.textContent = ''; el.className = 'ai-status'; return; }
  el.style.display = 'block';
  el.textContent = message;
  el.className = `ai-status ${type||''}`;
}

function clampPlanDays(value){
  const n = Number(value || 7);
  return Math.max(1, Math.min(n, 7));
}

function buildRandomPlan({ startDate, days, meals, pool }){
  const newPlan = [];
  const usedIds = [];
  for(let d=1; d<=days; d++){
    const thisDate = new Date(startDate);
    thisDate.setDate(startDate.getDate() + (d-1));
    const dateKey = thisDate.toISOString().slice(0,10);
    const existingDay = mealPlan.find(x=>x.dateKey===dateKey);
    const dayMeals = [];
    for(let m=0; m<meals; m++){
      const existingMeal = existingDay?.meals?.[m];
      if(existingMeal?.locked){
        dayMeals.push({...existingMeal});
        usedIds.push(existingMeal.recipeId);
      } else {
        const usedInDay = dayMeals.map(x=>x.recipeId);
        const pick = pickRandom(pool, [...usedIds, ...usedInDay]);
        dayMeals.push({ recipeId: pick.id, locked: false, source: 'random' });
        usedIds.push(pick.id);
      }
    }
    newPlan.push({ day: d, date: thisDate, dateKey, meals: dayMeals });
  }
  return newPlan;
}

function normalizeAiPlan(aiPlan, { startDate, days, meals, pool }){
  if(!Array.isArray(aiPlan)) throw new Error('Format jadwal AI tidak valid.');
  const poolIds = new Set(pool.map(r=>String(r.id)));
  const newPlan = [];
  for(let d=1; d<=days; d++){
    const thisDate = new Date(startDate);
    thisDate.setDate(startDate.getDate() + (d-1));
    const dateKey = thisDate.toISOString().slice(0,10);
    const existingDay = mealPlan.find(x=>x.dateKey===dateKey);
    const aiDay = aiPlan[d-1] || {};
    const srcMeals = Array.isArray(aiDay.meals) ? aiDay.meals : [];
    const dayMeals = [];
    for(let m=0; m<meals; m++){
      const existingMeal = existingDay?.meals?.[m];
      if(existingMeal?.locked){
        dayMeals.push({...existingMeal});
        continue;
      }
      const wantedLabel = MEAL_LABELS[m];
      const aiMeal = srcMeals.find(x=>String(x.label||'').toLowerCase()===wantedLabel.toLowerCase()) || srcMeals[m] || {};
      const recipeId = String(aiMeal.recipeId || aiMeal.recipe_id || '');
      if(poolIds.has(recipeId)){
        dayMeals.push({ recipeId, locked: false, reason: aiMeal.reason || '', source: 'ai' });
      }
    }
    while(dayMeals.length < meals){
      const pick = pickRandom(pool, dayMeals.map(x=>x.recipeId));
      dayMeals.push({ recipeId: pick.id, locked: false, source: 'fallback' });
    }
    newPlan.push({ day: d, date: thisDate, dateKey, meals: dayMeals.slice(0, meals) });
  }
  return newPlan;
}

async function callGenerateMenuApi(payload){
  const resp = await fetch('/api/generate-menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await resp.json().catch(()=>({}));
  if(!resp.ok) throw new Error(data.error || 'AI Menu Generator gagal.');
  return data.plan;
}

async function generatePlan(){
  const startVal = $('planStartDate').value;
  const startDate = startVal ? new Date(startVal + 'T00:00:00') : new Date();
  const days = clampPlanDays($('jumlahHari').value);
  const meals = 2;
  const mode = $('modeRandom').value;
  const pool = getFilteredPool();
  if(!pool.length) return alert('Belum ada resep yang cocok dengan mode ini.');

  // Pastikan UI tetap sesuai keputusan: maksimum 7 hari, tanpa slot Pagi.
  $('jumlahHari').value = String(days);
  setPlanAiStatus(`⏳ AI sedang menyusun menu ${days} hari (${days*meals} menu)...`, 'loading');

  try {
    const recipesForAi = pool.slice(0, 120).map(r => ({
      id: String(r.id),
      nama_resep: r.nama_resep,
      bahan_utama: r.bahan_utama || '',
      jenis_hidangan: r.jenis_hidangan || '',
      durasi_menit: r.durasi_menit || null,
      status: r.status || '',
      rating_keluarga: r.rating_keluarga || 0,
      tag: Array.isArray(r.tag) ? r.tag : []
    }));
    const lockedMeals = mealPlan.flatMap(d => (d.meals||[]).map((m,i)=>({ dateKey:d.dateKey, label:MEAL_LABELS[i], recipeId:m.recipeId, locked:!!m.locked })).filter(x=>x.locked));
    const aiPlan = await callGenerateMenuApi({
      days, meals, mode, startDate: startDate.toISOString().slice(0,10), labels: MEAL_LABELS.slice(0, meals), recipes: recipesForAi, lockedMeals
    });
    mealPlan = normalizeAiPlan(aiPlan, { startDate, days, meals, pool });
    saveMealPlan();
    renderMealPlan();
    setPlanAiStatus(`✅ Menu ${days} hari berhasil dibuat dengan AI.`, 'success');
  } catch(err) {
    console.warn('AI menu generator fallback:', err);
    mealPlan = buildRandomPlan({ startDate, days, meals, pool });
    saveMealPlan();
    renderMealPlan();
    setPlanAiStatus(`⚠️ AI belum aktif/gagal (${err.message}). Jadwal tetap dibuat otomatis tanpa AI.`, 'error');
  }
}

window.toggleLockMeal = (day, mealIdx) => {
  const d = mealPlan.find(x=>x.day===day);
  if(!d || !d.meals[mealIdx]) return;
  d.meals[mealIdx].locked = !d.meals[mealIdx].locked;
  saveMealPlan();
  renderMealPlan();
};

window.randomizeDayMeal = (day, mealIdx) => {
  const d = mealPlan.find(x=>x.day===day);
  if(!d || !d.meals[mealIdx] || d.meals[mealIdx].locked) return;
  const pool = getFilteredPool();
  if(!pool.length) return;
  const usedInDay = d.meals.filter((_,i)=>i!==mealIdx).map(m=>m.recipeId);
  const pick = pickRandom(pool, usedInDay);
  d.meals[mealIdx].recipeId = pick.id;
  saveMealPlan();
  renderMealPlan();
};

window.randomizeDay = (day) => {
  const d = mealPlan.find(x=>x.day===day);
  if(!d) return;
  const pool = getFilteredPool();
  if(!pool.length) return;
  const usedIds = [];
  d.meals.forEach((meal) => {
    if(!meal.locked){
      const pick = pickRandom(pool, usedIds);
      meal.recipeId = pick.id;
    }
    usedIds.push(meal.recipeId);
  });
  saveMealPlan();
  renderMealPlan();
};

function renderMealPlan(){
  if(!mealPlan.length){
    $('planResult').innerHTML = '';
    $('planActions').style.display = 'none';
    $('shoppingListResult').innerHTML = '';
    return;
  }

  const totalMenus = mealPlan.reduce((s,d)=>s+d.meals.length,0);
  let html = `<div class="plan-summary">✅ ${mealPlan.length} hari · ${totalMenus} menu · otomatis tersimpan di HP/browser ini</div>`;
  html += '<div class="plan-grid">';
  mealPlan.forEach(d => {
    const dateLabel = d.date ? formatPlanDate(new Date(d.date)) : `Hari ${d.day}`;
    html += `<div class="plan-day">
      <div class="plan-day-header">
        <h3>${dateLabel}</h3>
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

/* ========== SHOPPING LIST ========== */

function generateShoppingList(){
  if(!mealPlan.length) return;

  const recipeCounts = {};
  mealPlan.forEach(d => d.meals.forEach(m => {
    recipeCounts[m.recipeId] = (recipeCounts[m.recipeId] || 0) + 1;
  }));
  const recipeIds = Object.keys(recipeCounts);

  const ingredientMap = {};
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
          const master = masterIngredients.find(mi => mi.nama_bahan.toLowerCase() === item.nama_bahan.toLowerCase());
          ingredientMap[key] = {
            nama_bahan: item.nama_bahan,
            jumlah: 0,
            satuan: item.satuan || '',
            kategori: master?.kategori_bahan || 'Lainnya'
          };
        }
        if (item.jumlah) ingredientMap[key].jumlah += Number(item.jumlah) * multiplier;
      });
    });
  });

  const items = Object.values(ingredientMap).sort((a,b) => a.kategori.localeCompare(b.kategori) || a.nama_bahan.localeCompare(b.nama_bahan));

  if (!items.length) {
    $('shoppingListResult').innerHTML = '<p class="muted">Resep dalam jadwal belum memiliki bahan terstruktur.</p>';
    return;
  }

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
  html += '<div class="shop-actions">';
  html += '<button class="secondary wide" onclick="copyShoppingList(event)">📋 Copy Teks</button>';
  html += '<button class="primary wide" onclick="shareShoppingListWA()">💬 Kirim ke WhatsApp</button>';
  html += '</div>';
  html += '</div>';
  $('shoppingListResult').innerHTML = html;
  $('shoppingListResult').scrollIntoView({ behavior: 'smooth' });
}

function buildShoppingText(){
  if(!mealPlan.length) return '';
  const recipeCounts = {};
  mealPlan.forEach(d => d.meals.forEach(m => { recipeCounts[m.recipeId] = (recipeCounts[m.recipeId]||0)+1; }));
  const recipeIds = Object.keys(recipeCounts);
  const ingredientMap = {};
  recipeIds.forEach(id => {
    const r = recipes.find(x=>x.id===id);
    if(!r||!r.bahan) return;
    const groups = normalizeIngredientGroups(r.bahan);
    const mult = recipeCounts[id]||1;
    groups.forEach(g => (g.items||[]).forEach(item => {
      if(!item.nama_bahan) return;
      const key = (item.nama_bahan+'|'+(item.satuan||'')).toLowerCase();
      if(!ingredientMap[key]){
        const master = masterIngredients.find(mi=>mi.nama_bahan.toLowerCase()===item.nama_bahan.toLowerCase());
        ingredientMap[key] = { nama_bahan:item.nama_bahan, jumlah:0, satuan:item.satuan||'', kategori:master?.kategori_bahan||'Lainnya' };
      }
      if(item.jumlah) ingredientMap[key].jumlah += Number(item.jumlah)*mult;
    }));
  });
  const items = Object.values(ingredientMap).sort((a,b)=>a.kategori.localeCompare(b.kategori)||a.nama_bahan.localeCompare(b.nama_bahan));
  const byCategory = {};
  items.forEach(it => { if(!byCategory[it.kategori]) byCategory[it.kategori]=[]; byCategory[it.kategori].push(it); });

  let text = `🛒 DAFTAR BELANJA\n${mealPlan.length} hari · ${mealPlan.reduce((s,d)=>s+d.meals.length,0)} menu\n\n`;
  // add menu summary with real dates
  mealPlan.forEach(d => {
    const dateLabel = d.date ? formatPlanDate(new Date(d.date)) : `Hari ${d.day}`;
    text += `📅 ${dateLabel}: `;
    text += d.meals.map((m,i) => {
      const r = recipes.find(x=>x.id===m.recipeId);
      return `${MEAL_LABELS[i]||'Menu'} - ${r?r.nama_resep:'?'}`;
    }).join(', ') + '\n';
  });
  text += '\n';
  Object.entries(byCategory).forEach(([cat, catItems]) => {
    text += `── ${cat} ──\n`;
    catItems.forEach(it => {
      const qty = it.jumlah ? `${Number.isInteger(it.jumlah)?it.jumlah:it.jumlah.toFixed(1)} ${it.satuan}` : (it.satuan||'secukupnya');
      text += `☐ ${it.nama_bahan} — ${qty}\n`;
    });
    text += '\n';
  });
  return text.trim();
}

window.copyShoppingList = (evt) => {
  const text = buildShoppingText();
  navigator.clipboard.writeText(text).then(()=>{
    const btn = evt?.target;
    if(btn){
      const orig = btn.textContent;
      btn.textContent = '✅ Tersalin!';
      setTimeout(()=>{ btn.textContent = orig; }, 1500);
    }
  }).catch(()=>alert('Gagal copy. Coba manual.'));
};

window.shareShoppingListWA = () => {
  const text = buildShoppingText();
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
};

/* ========== AI RECIPE EXTRACTION (Qwen via Vercel Function) ========== */

function setAiStatus(message, type){
  const el = $('aiExtractStatus');
  if(!el) return;
  if(!message){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.className = `ai-status ${type||''}`;
  el.textContent = message;
}

function clearAiPanel(){
  if($('aiPhotoInput')) $('aiPhotoInput').value = '';
  if($('aiPhotoPreview')) $('aiPhotoPreview').innerHTML = '';
  if($('aiTextInput')) $('aiTextInput').value = '';
  setAiStatus(null);
}

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Kompres & resize gambar di browser sebelum dikirim ke server.
 * Mengecilkan dimensi maksimum dan re-encode sebagai JPEG kualitas sedang —
 * mengurangi ukuran payload (hindari limit Vercel) dan biaya token Qwen.
 */
function compressImageFile(file, { maxDimension = 1600, quality = 0.75 } = {}){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDimension || height > maxDimension){
          if(width > height){
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          } else {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Gagal membaca gambar.'));
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function estimateBase64SizeKB(dataUrl){
  // Rough estimate: base64 length * 0.75 = byte size
  const base64Part = dataUrl.split(',')[1] || '';
  return Math.round((base64Part.length * 0.75) / 1024);
}

async function callExtractRecipeApi(payload){
  const resp = await fetch('/api/extract-recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await resp.json();
  if(!resp.ok) throw new Error(data.error || 'Gagal mengekstrak resep.');
  return data.recipe;
}

function applyExtractedRecipe(recipe, sourceLabel){
  if(!recipe) return;
  if(recipe.nama_resep) $('nama_resep').value = recipe.nama_resep;
  if(recipe.bahan_utama) $('bahan_utama').value = recipe.bahan_utama;
  if(recipe.jenis_hidangan) $('jenis_hidangan').value = recipe.jenis_hidangan;
  if(recipe.durasi_menit) $('durasi_menit').value = recipe.durasi_menit;
  if(recipe.porsi) $('porsi').value = recipe.porsi;
  if(Array.isArray(recipe.cara_memasak) && recipe.cara_memasak.length){
    $('cara_memasak').value = recipe.cara_memasak.join('\n');
  }
  if(Array.isArray(recipe.tag) && recipe.tag.length){
    $('tag').value = recipe.tag.join(', ');
  }
  if(Array.isArray(recipe.bahan) && recipe.bahan.length){
    ingredientGroupsState = normalizeIngredientGroups(recipe.bahan);
    renderIngredientGroups();
  }
  if(sourceLabel && $('sumber_resep')) $('sumber_resep').value = sourceLabel;
  setAiStatus('✅ Resep berhasil diisi otomatis! Silakan periksa & lengkapi sebelum simpan.', 'success');
  window.scrollTo({top:0, behavior:'smooth'});
}

async function handleAiExtractPhoto(){
  const files = Array.from($('aiPhotoInput').files || []);
  if(!files.length) return setAiStatus('Pilih minimal 1 foto dulu.', 'error');
  setAiStatus(`⏳ Mengompres ${files.length} foto...`, 'loading');
  try {
    const images = await Promise.all(files.map(f => compressImageFile(f)));
    const totalKB = images.reduce((sum, img) => sum + estimateBase64SizeKB(img), 0);
    setAiStatus(`⏳ Membaca ${files.length} foto (~${totalKB} KB) dengan AI...`, 'loading');
    const recipe = await callExtractRecipeApi({ mode: 'photo', imagesBase64: images });
    applyExtractedRecipe(recipe, 'AI');
  } catch(err){
    setAiStatus('❌ ' + err.message, 'error');
  }
}

async function handleAiExtractText(){
  const text = $('aiTextInput').value.trim();
  const source = $('aiTextSource')?.value || 'AI';
  if(!text) return setAiStatus('Tulis atau paste teks dulu.', 'error');
  setAiStatus('⏳ Merapikan teks dengan AI...', 'loading');
  try {
    const recipe = await callExtractRecipeApi({ mode: 'text', rawText: text });
    applyExtractedRecipe(recipe, source);
  } catch(err){
    setAiStatus('❌ ' + err.message, 'error');
  }
}

function setupAiTabs(){
  document.querySelectorAll('.ai-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ai-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.ai-panel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.ai-panel[data-aipanel="${tab.dataset.aitab}"]`).classList.add('active');
      setAiStatus(null);
    });
  });
}

function countRecipesUsingIngredient(name){
  const lower = name.toLowerCase();
  return recipes.filter(r => {
    const groups = normalizeIngredientGroups(r.bahan);
    return groups.some(g => (g.items||[]).some(i => (i.nama_bahan||'').toLowerCase() === lower));
  }).length;
}

async function handleMasterIngredientSubmit(e){
  e.preventDefault();
  if(!requireLogin()) return;
  const payload = { nama_bahan: $('masterIngredientName').value.trim(), kategori_bahan: $('masterIngredientCategory').value };
  if(!payload.nama_bahan) return;
  const { error } = await db.from('master_ingredients').insert(payload);
  if(error) return alert('Gagal tambah master bahan: ' + error.message);
  $('masterIngredientForm').reset(); await loadAll();
}

window.deleteMasterIngredient = async (id)=>{
  if(!requireLogin()) return;
  if(!confirm('Hapus master bahan ini?')) return;
  const {error}=await db.from('master_ingredients').delete().eq('id',id);
  if(error) alert(error.message);
  await loadAll();
};

window.editMasterIngredient = async (id)=>{
  if(!requireLogin()) return;
  const item = masterIngredients.find(i=>i.id===id);
  if(!item) return;
  const newName = prompt('Nama bahan:', item.nama_bahan);
  if(newName === null) return;
  const trimmed = newName.trim();
  if(!trimmed) return alert('Nama tidak boleh kosong.');
  const cats = ['Bumbu','Daging','Sayur','Karbohidrat','Buah','Lainnya'];
  const catIdx = prompt('Kategori:\n' + cats.map((c,i)=>`${i+1}. ${c}`).join('\n') + '\n\nPilih nomor (1-6):', String(cats.indexOf(item.kategori_bahan)+1));
  if(catIdx === null) return;
  const cat = cats[Number(catIdx)-1] || item.kategori_bahan;
  const {error} = await db.from('master_ingredients').update({ nama_bahan: trimmed, kategori_bahan: cat }).eq('id', id);
  if(error) return alert('Gagal update: ' + error.message);
  await loadAll();
};

function renderMasterIngredients(){
  if(!masterIngredients.length){
    $('masterIngredientList').innerHTML = '<p class="muted">Belum ada master bahan.</p>';
    return;
  }
  $('masterIngredientList').innerHTML = masterIngredients.map(i=>{
    const count = countRecipesUsingIngredient(i.nama_bahan);
    const badge = count > 0 ? `<span class="use-count">${count} resep</span>` : '<span class="use-count zero">belum dipakai</span>';
    return `<div class="item compact">
      <div>
        <h3>${escapeHtml(i.nama_bahan)}</h3>
        <p>${escapeHtml(i.kategori_bahan||'')} · ${badge}</p>
      </div>
      <div class="master-actions">
        <button class="secondary small" onclick='editMasterIngredient("${i.id}")'>Edit</button>
        <button class="danger small" onclick='deleteMasterIngredient("${i.id}")'>Hapus</button>
      </div>
    </div>`;
  }).join('');
}

/* ========== MASTER SATUAN ========== */

async function handleMasterUnitSubmit(e){
  e.preventDefault();
  if(!requireLogin()) return;
  const val = $('masterUnitName').value.trim();
  if(!val) return;
  const { error } = await db.from('master_units').insert({ nama_satuan: val });
  if(error) return alert('Gagal tambah satuan: ' + error.message);
  $('masterUnitForm').reset(); await loadAll();
}

window.deleteMasterUnit = async (id)=>{
  if(!requireLogin()) return;
  if(!confirm('Hapus satuan ini?')) return;
  const {error}=await db.from('master_units').delete().eq('id',id);
  if(error) alert(error.message);
  await loadAll();
};

window.editMasterUnit = async (id)=>{
  if(!requireLogin()) return;
  const item = masterUnits.find(u=>u.id===id);
  if(!item) return;
  const newName = prompt('Nama satuan:', item.nama_satuan);
  if(newName === null) return;
  const trimmed = newName.trim();
  if(!trimmed) return alert('Nama tidak boleh kosong.');
  const {error} = await db.from('master_units').update({ nama_satuan: trimmed }).eq('id', id);
  if(error) return alert('Gagal update: ' + error.message);
  await loadAll();
};

function renderMasterUnits(){
  $('masterUnitList').innerHTML = masterUnits.map(u=> u.id
    ? `<span class="tag-pill">${escapeHtml(u.nama_satuan)} <button class="mini-x" onclick='editMasterUnit("${u.id}")' title="Edit">✏️</button><button class="mini-x" onclick='deleteMasterUnit("${u.id}")' title="Hapus">×</button></span>`
    : `<span class="tag-pill">${escapeHtml(u.nama_satuan)}</span>`
  ).join('');
}

/* ========== DASHBOARD / GALLERY / HISTORY ========== */

function mostCommonValue(list, fallback='-'){
  const counts = {};
  list.filter(Boolean).forEach(v => { counts[v] = (counts[v]||0) + 1; });
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return top ? `${top[0]} (${top[1]})` : fallback;
}

function renderDashboard(){
  if($('dash5star')) $('dash5star').textContent = recipes.filter(r=>Number(r.rating_keluarga)===5).length;
  if($('dashTotalCooked')) $('dashTotalCooked').textContent = cookLog.length;
  if($('dashJenisTerbanyak')) $('dashJenisTerbanyak').textContent = mostCommonValue(recipes.map(r=>r.jenis_hidangan));
  if($('dashSumberTerbanyak')) $('dashSumberTerbanyak').textContent = mostCommonValue(recipes.map(r=>r.sumber_resep));
  renderCollectionStats();
  renderTopCooked();
  renderWeeklyChart();
}

function renderCollectionStats(){
  const el = $('collectionStats'); if(!el) return;
  if(!recipes.length){ el.innerHTML = '<p class="muted">Belum ada resep.</p>'; return; }
  const groups = [
    ['Bahan utama', recipes.map(r=>r.bahan_utama)],
    ['Jenis hidangan', recipes.map(r=>r.jenis_hidangan)],
    ['Sumber resep', recipes.map(r=>r.sumber_resep)],
    ['Siapa masak', recipes.map(r=>r.dimasak_oleh)]
  ];
  el.innerHTML = groups.map(([label, values]) => {
    const counts = {};
    values.filter(Boolean).forEach(v => counts[v] = (counts[v]||0)+1);
    const top3 = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3);
    return `<div class="collection-stat-row"><b>${label}</b><span>${top3.length ? top3.map(([k,v])=>`${escapeHtml(k)} ${v}`).join(' · ') : '-'}</span></div>`;
  }).join('');
}

function renderTopCooked(){
  const el = $('topCookedList'); if(!el) return;
  if(!cookLog.length){ el.innerHTML = '<p class="muted">Belum ada data. Tandai resep "Sudah Dimasak" untuk mulai mencatat.</p>'; return; }
  const counts = {};
  cookLog.forEach(c => { counts[c.recipe_id] = (counts[c.recipe_id]||0) + 1; });
  const ranked = Object.entries(counts)
    .map(([id, count]) => ({ recipe: recipes.find(r=>r.id===id), count }))
    .filter(x => x.recipe)
    .sort((a,b) => b.count - a.count)
    .slice(0, 5);
  if(!ranked.length){ el.innerHTML = '<p class="muted">Belum ada data.</p>'; return; }
  const maxCount = ranked[0].count;
  el.innerHTML = ranked.map(({recipe, count}) => `
    <div class="top-cooked-row" onclick='viewRecipe("${recipe.id}")'>
      <span class="top-cooked-name">${escapeHtml(recipe.nama_resep)}</span>
      <div class="top-cooked-bar-wrap"><div class="top-cooked-bar" style="width:${Math.max(12, (count/maxCount)*100)}%"></div></div>
      <span class="top-cooked-count">${count}x</span>
    </div>`).join('');
}

function renderWeeklyChart(){
  const el = $('weeklyChart'); if(!el) return;
  const days = [];
  const today = new Date();
  for(let i=6; i>=0; i--){
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push({ key: d.toISOString().slice(0,10), label: d.toLocaleDateString('id-ID',{weekday:'short'}), count: 0 });
  }
  cookLog.forEach(c => {
    const key = new Date(c.cooked_at).toISOString().slice(0,10);
    const match = days.find(d => d.key === key);
    if(match) match.count++;
  });
  const maxCount = Math.max(1, ...days.map(d=>d.count));
  el.innerHTML = days.map(d => `
    <div class="week-bar-col">
      <div class="week-bar" style="height:${Math.max(4,(d.count/maxCount)*60)}px"></div>
      <span class="week-bar-count">${d.count||''}</span>
      <span class="week-bar-label">${d.label}</span>
    </div>`).join('');
}

function renderGallery(){
  const el=$('galleryGrid'); if(!el) return;
  const withPhotos = recipes.filter(r=>r.foto_url);
  el.innerHTML = withPhotos.length
    ? withPhotos.map(r=>`<div class="gallery-card clickable-card" onclick='viewRecipe("${r.id}")'><img src="${r.foto_url}" alt="${escapeHtml(r.nama_resep)}" loading="lazy"><span>${escapeHtml(r.nama_resep)}</span></div>`).join('')
    : '<p class="muted">Belum ada foto resep.</p>';
}

function renderHistory(){
  const el=$('historyList'); if(!el) return;
  const data=recipeHistory.map(id=>recipes.find(r=>r.id===id)).filter(Boolean);
  el.innerHTML=data.map(r=>`<div class="item clickable-card" onclick='viewRecipe("${r.id}")'><h3>${r.nama_resep}</h3><p>${escapeHtml(r.bahan_utama||'')} · ${escapeHtml(r.jenis_hidangan||'')}</p></div>`).join('')||'<p class="muted">Belum ada riwayat.</p>';
}



/* ========== BACKUP / COLLECTIONS / PRINT ========== */

function saveCollections(){
  try { localStorage.setItem('recipeCollectionsV210', JSON.stringify(recipeCollections)); } catch(e){}
}

function ensureDefaultCollections(){
  DEFAULT_COLLECTIONS.forEach(name => {
    if(!Array.isArray(recipeCollections[name])) recipeCollections[name] = [];
  });
  saveCollections();
}

function collectionNamesForRecipe(recipeId){
  return Object.entries(recipeCollections)
    .filter(([_, ids]) => Array.isArray(ids) && ids.includes(recipeId))
    .map(([name]) => name);
}

function collectionPillsHtml(recipeId){
  const names = collectionNamesForRecipe(recipeId);
  return names.length ? `<div class="collection-pills">${names.map(n=>`<span class="tag-pill mini">📁 ${escapeHtml(n)}</span>`).join('')}</div>` : '';
}

function collectionSelectOptions(recipeId){
  const names = Object.keys(recipeCollections).sort((a,b)=>a.localeCompare(b));
  const unused = names.filter(n => !(recipeCollections[n]||[]).includes(recipeId));
  if(!unused.length) return '<option value="">Semua koleksi sudah dipakai</option>';
  return unused.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}

window.addRecipeToCollectionFromDetail = (recipeId) => {
  const sel = $('detailCollectionSelect');
  const name = sel?.value;
  if(!name) return alert('Pilih koleksi dulu.');
  if(!recipeCollections[name]) recipeCollections[name] = [];
  if(!recipeCollections[name].includes(recipeId)) recipeCollections[name].push(recipeId);
  saveCollections();
  renderCollections();
  renderRecipes();
  viewRecipe(recipeId);
};

window.removeRecipeFromCollection = (collectionName, recipeId) => {
  recipeCollections[collectionName] = (recipeCollections[collectionName] || []).filter(id => id !== recipeId);
  saveCollections();
  renderCollections();
  renderRecipes();
};

window.deleteCollection = (collectionName) => {
  if(!confirm(`Hapus koleksi "${collectionName}"? Resep tidak ikut terhapus.`)) return;
  delete recipeCollections[collectionName];
  saveCollections();
  renderCollections();
  renderDashboard();
};

function renderCollections(){
  ensureDefaultCollections();
  const el = $('collectionList');
  if(!el) return;
  const names = Object.keys(recipeCollections).sort((a,b)=>a.localeCompare(b));
  if(!names.length){ el.innerHTML = '<p class="muted">Belum ada koleksi.</p>'; return; }
  el.innerHTML = names.map(name => {
    const ids = recipeCollections[name] || [];
    const rows = ids.map(id => recipes.find(r=>r.id===id)).filter(Boolean).map(r => `
      <div class="collection-recipe-row">
        <span onclick='viewRecipe("${r.id}")'>${escapeHtml(r.nama_resep)}</span>
        <button class="ghost small" onclick='removeRecipeFromCollection("${escapeHtml(name)}","${r.id}")'>×</button>
      </div>`).join('');
    return `<div class="item compact collection-card">
      <div class="collection-head">
        <div><h3>📁 ${escapeHtml(name)}</h3><p>${ids.length} resep</p></div>
        <button class="danger small" onclick='deleteCollection("${escapeHtml(name)}")'>Hapus</button>
      </div>
      <div class="collection-recipe-list">${rows || '<p class="muted">Belum ada resep. Buka detail resep untuk memasukkan ke koleksi ini.</p>'}</div>
    </div>`;
  }).join('');
}

function setBackupStatus(message, type){
  const el = $('backupStatus');
  if(!el) return;
  if(!message){ el.style.display='none'; el.textContent=''; return; }
  el.style.display='block';
  el.className = `ai-status ${type||''}`;
  el.textContent = message;
}

function downloadTextFile(filename, text, mime='application/json'){
  const blob = new Blob([text], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

window.exportDataBackup = () => {
  if(!requireLogin()) return;
  const payload = {
    app: 'Resep Keluarga Yonarta',
    version: '2.1.1',
    exported_at: new Date().toISOString(),
    recipes,
    masterIngredients,
    masterUnits,
    cookLog,
    mealPlan,
    recipeHistory,
    recipeCollections
  };
  const date = new Date().toISOString().slice(0,10);
  downloadTextFile(`resep-keluarga-yonarta-backup-${date}.json`, JSON.stringify(payload, null, 2));
  setBackupStatus('✅ Backup JSON berhasil dibuat.', 'success');
};

async function insertRecipesFromBackup(items){
  if(!Array.isArray(items) || !items.length) return { inserted:0, skipped:0, idMap:{} };
  let inserted = 0, skipped = 0;
  const idMap = {};
  for(const r of items){
    if(!r?.nama_resep){ skipped++; continue; }
    const payload = {
      nama_resep: r.nama_resep,
      bahan_utama: r.bahan_utama || null,
      jenis_hidangan: r.jenis_hidangan || null,
      durasi_menit: r.durasi_menit || null,
      porsi: r.porsi || null,
      status: r.status || 'Belum Dicoba',
      rating_keluarga: Number(r.rating_keluarga || 0),
      bahan: r.bahan || [],
      cara_memasak: Array.isArray(r.cara_memasak) ? r.cara_memasak : [],
      tag: Array.isArray(r.tag) ? r.tag : [],
      catatan_yonarta: r.catatan_yonarta || '',
      link_sumber: r.link_sumber || '',
      foto_url: r.foto_url || null,
      foto_urls: Array.isArray(r.foto_urls) ? r.foto_urls : [],
      dimasak_oleh: r.dimasak_oleh || '',
      sumber_resep: r.sumber_resep || 'Manual'
    };
    const duplicate = recipes.find(x => (x.nama_resep||'').toLowerCase() === payload.nama_resep.toLowerCase());
    if(duplicate){ if(r.id) idMap[String(r.id)] = String(duplicate.id); skipped++; continue; }
    const { data, error } = await db.from('recipes').insert(payload).select('id').single();
    if(error){ console.warn('Gagal import resep:', payload.nama_resep, error.message); skipped++; }
    else { inserted++; if(r.id && data?.id) idMap[String(r.id)] = String(data.id); }
  }
  return { inserted, skipped, idMap };
}

window.importDataBackup = async () => {
  if(!requireLogin()) return;
  const file = $('importDataFile')?.files?.[0];
  if(!file) return setBackupStatus('Pilih file backup JSON dulu.', 'error');
  if(!confirm('Import backup akan menambahkan resep yang belum ada dan mengganti data lokal seperti koleksi/jadwal. Lanjut?')) return;
  try {
    setBackupStatus('⏳ Membaca file backup...', 'loading');
    const text = await file.text();
    const data = JSON.parse(text);
    const result = await insertRecipesFromBackup(data.recipes || []);
    const mapId = (id) => result.idMap?.[String(id)] || String(id);
    if(Array.isArray(data.mealPlan)){
      mealPlan = data.mealPlan.map(d => ({...d, meals:(d.meals||[]).map(m => ({...m, recipeId: mapId(m.recipeId)}))}));
      saveMealPlan();
    }
    if(Array.isArray(data.recipeHistory)){ recipeHistory = data.recipeHistory.map(mapId); localStorage.setItem('recipeHistory', JSON.stringify(recipeHistory)); }
    if(data.recipeCollections && typeof data.recipeCollections === 'object'){
      recipeCollections = {};
      Object.entries(data.recipeCollections).forEach(([name, ids]) => {
        recipeCollections[name] = Array.isArray(ids) ? ids.map(mapId) : [];
      });
      saveCollections();
    }
    await loadAll();
    setBackupStatus(`✅ Import selesai. Resep masuk: ${result.inserted}. Dilewati: ${result.skipped}.`, 'success');
  } catch(err){
    setBackupStatus('❌ Import gagal: ' + err.message, 'error');
  }
};

function buildPrintableRecipeHtml(r){
  const bahan = ingredientsDetailHtml(r.bahan);
  const steps = listStepsHtml(r.cara_memasak);
  const tags = Array.isArray(r.tag) ? r.tag.join(', ') : '';
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(r.nama_resep)}</title>
  <style>body{font-family:Arial,sans-serif;color:#222;padding:28px;line-height:1.5}h1{margin:0 0 6px}h2{margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:6px}.meta{color:#666;margin-bottom:18px}.box{border:1px solid #ddd;border-radius:10px;padding:14px;margin:12px 0}ul,ol{padding-left:22px}.note{white-space:pre-wrap;background:#fafafa;padding:12px;border-radius:8px}.footer{margin-top:28px;color:#777;font-size:12px}@media print{button{display:none}}</style></head><body>
  <button onclick="window.print()">Print / Save PDF</button>
  <h1>${escapeHtml(r.nama_resep)}</h1>
  <div class="meta">${escapeHtml(r.bahan_utama||'-')} · ${escapeHtml(r.jenis_hidangan||'-')} · ${r.durasi_menit?escapeHtml(r.durasi_menit+' menit'):'-'} · ${r.porsi?escapeHtml(r.porsi+' porsi'):'-'}</div>
  <div class="box"><b>Rating:</b> ${stars(r.rating_keluarga)}<br><b>Sumber:</b> ${escapeHtml(r.sumber_resep||'Manual')}<br><b>Dimasak oleh:</b> ${escapeHtml(r.dimasak_oleh||'-')}<br><b>Koleksi:</b> ${escapeHtml(collectionNamesForRecipe(r.id).join(', ')||'-')}</div>
  <h2>Bahan</h2>${bahan}
  <h2>Cara Memasak</h2>${steps}
  <h2>Catatan</h2><div class="note">${escapeHtml(r.catatan_yonarta||'-')}</div>
  <div class="footer">Tag: ${escapeHtml(tags || '-')}<br>Dibuat dari Resep Keluarga Yonarta v2.1.0</div>
  <script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
}

window.printRecipe = (id) => {
  const r = recipes.find(x=>x.id===id);
  if(!r) return alert('Resep tidak ditemukan.');
  const w = window.open('', '_blank');
  if(!w) return alert('Popup diblokir browser. Izinkan popup untuk print/PDF.');
  w.document.open();
  w.document.write(buildPrintableRecipeHtml(r));
  w.document.close();
};

/* ========== INIT — all event handlers ========== */

document.addEventListener('DOMContentLoaded', () => {
  if($('loginBtn')) $('loginBtn').addEventListener('click', sendLoginEmail);
  if($('loginEmail')) $('loginEmail').addEventListener('keydown', (e)=>{ if(e.key==='Enter') sendLoginEmail(); });
  if($('logoutBtn')) $('logoutBtn').addEventListener('click', logout);
  if($('shareAppBtn')) $('shareAppBtn').addEventListener('click', shareApp);
  if($('shareAppHomeBtn')) $('shareAppHomeBtn').addEventListener('click', shareApp);

  // Navigation
  document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));

  // Refresh button — with visual feedback
  $('refreshBtn').addEventListener('click', async () => {
    const btn = $('refreshBtn');
    const origText = btn.textContent;
    btn.textContent = '⏳ ...';
    btn.disabled = true;
    try {
      await loadAll();
      btn.textContent = '✅ OK';
    } catch(e) {
      btn.textContent = '❌ Gagal';
      console.error('Refresh error:', e);
    }
    setTimeout(()=>{ btn.textContent = origText; btn.disabled = false; }, 1000);
  });

  // Back navigation (top of app)
  $('backBtn').addEventListener('click', goBack);

  // Back & Cancel
  $('backToRecipes').addEventListener('click', goBack);
  $('cancelEdit').addEventListener('click', () => { resetForm(); goBack(); window.scrollTo({top:0, behavior:'smooth'}); });

  // Photo preview
  $('foto_file').addEventListener('change', () => {
    const f = $('foto_file').files?.[0];
    if(!f) return setPhotoPreview(null);
    setPhotoPreview(URL.createObjectURL(f));
  });

  // Extra photos local preview (before upload)
  $('foto_files_extra').addEventListener('change', () => {
    const files = Array.from($('foto_files_extra').files || []);
    const el = $('extraPhotosPreview');
    const pendingHtml = files.map(f => `<div class="extra-thumb pending"><img src="${URL.createObjectURL(f)}" alt="Baru" /><span class="pending-badge">Baru</span></div>`).join('');
    el.innerHTML = extraPhotosState.map((url, i) => `
      <div class="extra-thumb">
        <img src="${url}" alt="Foto tambahan ${i+1}" />
        <button type="button" class="thumb-remove" onclick="removeExtraPhoto(${i})">×</button>
      </div>`).join('') + pendingHtml;
  });

  // Ingredient group add
  $('addIngredientGroup').addEventListener('click', () => {
    ingredientGroupsState.push({ nama_grup:'Bahan Utama', items:[{nama_bahan:'', jumlah:'', satuan:''}] });
    renderIngredientGroups();
  });

  // Recipe form
  $('recipeForm').addEventListener('submit', handleRecipeSubmit);

  // Search & filter
  $('searchInput').addEventListener('input', renderRecipes);
  document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click', ()=>{
    document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');
    activeFilter=c.dataset.filter;
    renderRecipes();
  }));

  // Meal planner
  $('generatePlan').addEventListener('click', generatePlan);
  $('generateShoppingList').addEventListener('click', generateShoppingList);
  if($('copyPlanBtn')) $('copyPlanBtn').addEventListener('click', copyMealPlan);
  if($('clearPlanBtn')) $('clearPlanBtn').addEventListener('click', clearMealPlan);

  // Master forms
  $('masterIngredientForm').addEventListener('submit', handleMasterIngredientSubmit);
  $('masterUnitForm').addEventListener('submit', handleMasterUnitSubmit);

  // Backup / collections / print tools
  if($('exportDataBtn')) $('exportDataBtn').addEventListener('click', exportDataBackup);
  if($('importDataBtn')) $('importDataBtn').addEventListener('click', importDataBackup);
  if($('collectionForm')) $('collectionForm').addEventListener('submit', (e)=>{ e.preventDefault(); const name=$('collectionName').value.trim(); if(!name) return; if(!recipeCollections[name]) recipeCollections[name]=[]; saveCollections(); $('collectionForm').reset(); renderCollections(); renderDashboard(); });

  // Random recipe
  $('randomRecipeBtn').addEventListener('click', ()=>{
    if(!recipes.length) return;
    const r=recipes[Math.floor(Math.random()*recipes.length)];
    $('randomResult').innerHTML=`<div class="item"><h3>${escapeHtml(r.nama_resep)}</h3><p>${escapeHtml(r.jenis_hidangan||'')} · ${escapeHtml(r.bahan_utama||'')}</p><button class="primary" onclick='viewRecipe("${r.id}")'>Lihat Resep</button></div>`;
  });

  // PWA install prompt
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = $('installBanner');
    if(banner) banner.style.display = 'flex';
  });

  const installBtn = $('installBtn');
  const installDismiss = $('installDismiss');
  if(installBtn) installBtn.addEventListener('click', async () => {
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('Install:', outcome);
    deferredPrompt = null;
    $('installBanner').style.display = 'none';
  });
  if(installDismiss) installDismiss.addEventListener('click', () => {
    $('installBanner').style.display = 'none';
    deferredPrompt = null;
  });

  // Voice search (Web Speech API)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceBtn = $('voiceSearchBtn');
  if(SpeechRecognition && voiceBtn){
    voiceBtn.style.display = 'flex';
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    voiceBtn.addEventListener('click', () => {
      voiceBtn.textContent = '🔴';
      voiceBtn.disabled = true;
      try { recognition.start(); } catch(e){ console.warn('Speech recognition error:', e); }
    });
    recognition.addEventListener('result', (e) => {
      const transcript = e.results[0][0].transcript;
      $('searchInput').value = transcript;
      renderRecipes();
    });
    const resetVoiceBtn = () => { voiceBtn.textContent = '🎤'; voiceBtn.disabled = false; };
    recognition.addEventListener('end', resetVoiceBtn);
    recognition.addEventListener('error', resetVoiceBtn);
  }

  // AI Recipe Extraction
  setupAiTabs();
  $('aiExtractPhotoBtn').addEventListener('click', handleAiExtractPhoto);
  $('aiExtractTextBtn').addEventListener('click', handleAiExtractText);
  $('aiPhotoInput').addEventListener('change', () => {
    const files = Array.from($('aiPhotoInput').files || []);
    $('aiPhotoPreview').innerHTML = files.map(f => `<div class="extra-thumb"><img src="${URL.createObjectURL(f)}" alt="Foto AI" /></div>`).join('');
    setAiStatus(files.length ? `${files.length} foto siap diekstrak.` : null, 'loading');
  });

  // Default collections
  ensureDefaultCollections();

  // Default plan start date = today
  if($('planStartDate')) $('planStartDate').value = new Date().toISOString().slice(0,10);

  // Init
  resetForm();
  updateBackButton();
  renderAuthState();
  initAuth();

  console.log('✅ Resep Keluarga Yonarta v2.1.1 loaded');
});
