const SUPABASE_URL = 'https://eswokjdhyktikcxranpo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pV3wADDW91aY_0fbOSS39g_cUt39Cnu';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let recipes = [];
let pantry = [];
let activeFilter = '';

const $ = (id) => document.getElementById(id);
const lineArray = (v) => (v || '').split('\n').map(x => x.trim()).filter(Boolean);
const csvArray = (v) => (v || '').split(',').map(x => x.trim()).filter(Boolean);

function go(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  $(page).classList.add('active');
  document.querySelectorAll('[data-go]').forEach(b=>b.classList.toggle('active', b.dataset.go===page));
}

document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('refreshBtn').onclick = loadAll;
$('cancelEdit').onclick = resetForm;

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
  return `<div class="item"><h3>${r.nama_resep}</h3><p>${r.bahan_utama || '-'} · ${r.jenis_hidangan || '-'} · ${r.status || '-'}</p><p>${bahan}</p><div class="actions"><button class="secondary" onclick='editRecipe("${r.id}")'>Edit</button><button class="danger" onclick='deleteRecipe("${r.id}")'>Hapus</button></div></div>`;
}

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
  const payload = {
    nama_resep: $('nama_resep').value.trim(),
    bahan_utama: $('bahan_utama').value.trim(),
    jenis_hidangan: $('jenis_hidangan').value.trim(),
    durasi_menit: $('durasi_menit').value ? Number($('durasi_menit').value) : null,
    porsi: $('porsi').value ? Number($('porsi').value) : null,
    status: $('status').value,
    rating_keluarga: Number($('rating_keluarga').value || 0),
    bahan: lineArray($('bahan').value),
    cara_memasak: lineArray($('cara_memasak').value),
    tag: csvArray($('tag').value),
    catatan_yonarta: $('catatan_yonarta').value.trim(),
    link_sumber: $('link_sumber').value.trim()
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
  go('add');
};

window.deleteRecipe = async (id)=>{ if(!confirm('Hapus resep ini?')) return; const {error}=await db.from('recipes').delete().eq('id',id); if(error) alert(error.message); await loadAll(); };
function resetForm(){ $('recipeForm').reset(); $('recipeId').value=''; $('formTitle').textContent='Tambah Resep'; $('rating_keluarga').value=0; }

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
