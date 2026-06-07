/* ════════════════════════════════════════════════════════════════════
   app.js — estado, render, interacción e inicialización
   ════════════════════════════════════════════════════════════════════ */

/* ─────────────── ESTADO PERSISTENTE ─────────────── */
const STORE_KEY='eventitos_tv_v5';
const SEED={type:'team', id:null, searchName:'Spain', label:'España', sport:'Soccer', badge:''};
let STATE={days:3, teams:[]};

function loadState(){
  try{ const r=localStorage.getItem(STORE_KEY); STATE=r?JSON.parse(r):{days:3,teams:[SEED]}; if(!r) saveState(); }
  catch{ STATE={days:3,teams:[SEED]}; }
  if(!STATE.days) STATE.days=3;
  if(!Array.isArray(STATE.teams)) STATE.teams=[];
}
function saveState(){ try{ localStorage.setItem(STORE_KEY,JSON.stringify(STATE)); }catch{} }

/* ─────────────── HELPERS DE CHIP ─────────────── */
function sportIcon(s,type){
  if(type==='f1'||type==='motogp'||(s||'').toLowerCase().includes('motorsport')) return type==='motogp'?'ti-motorbike':'ti-steering-wheel';
  const x=(s||'').toLowerCase();
  if(x.includes('basketball')) return 'ti-ball-basketball';
  return 'ti-ball-football';
}
function chipColors(t){
  const isMotor = t.type==='f1'||t.type==='motogp'||(t.sport||'').toLowerCase().includes('motorsport');
  if(isMotor) return {bg:'rgba(168,85,247,.15)', fg:'#c084fc'};
  if((t.sport||'').toLowerCase().includes('basketball')) return {bg:'rgba(59,130,246,.15)', fg:'#60a5fa'};
  return {bg:'rgba(239,68,68,.13)', fg:'#f87171'};
}
function renderChips(){
  const el=document.getElementById('chips');
  el.innerHTML = STATE.teams.map((t,i)=>{
    const c=chipColors(t);
    return `<span class="chip" style="background:${c.bg};color:${c.fg}">
      <i class="ti ${sportIcon(t.sport,t.type)}" style="font-size:13px"></i>${t.label}
      <span class="rm" data-i="${i}" title="Quitar"><i class="ti ti-x"></i></span></span>`;
  }).join('') || '<span style="color:var(--text3);font-size:12px">Nada todavía — pulsa "Añadir".</span>';
  el.querySelectorAll('.rm').forEach(b=>b.onclick=()=>{ STATE.teams.splice(+b.dataset.i,1); saveState(); renderChips(); loadAll(); });
}

/* ─────────────── RENDER DE EVENTOS ─────────────── */
function renderMatches(matches){
  const el=document.getElementById('content');
  if(!STATE.teams.length){ el.innerHTML=`<div class="state"><i class="ti ti-plus"></i><div class="title">No sigues nada todavía</div><div class="sub">Pulsa "Añadir" para empezar</div></div>`; return; }
  if(!matches.length){ el.innerHTML=`<div class="state"><i class="ti ti-calendar-off"></i><div class="title">Sin eventos en los próximos ${STATE.days} días</div><div class="sub">Prueba a ampliar el rango (7d / 14d)</div></div>`; return; }
  const byDate={}; matches.forEach(m=>(byDate[m.date]=byDate[m.date]||[]).push(m));
  el.innerHTML = Object.keys(byDate).sort().map(date=>{
    const {label,today}=dateLabel(date);
    const cards=byDate[date].map(m=>{
      const comp=getComp(m.league,m.sport), b=m.broadcast, fin=m.finished;
      const timeHtml = fin&&m.score
        ? `<div class="fin-label">Finalizado</div><div class="score-display">${m.score}</div>`
        : m.time==='TBD' ? `<div class="time-display time-tbd">TBD</div>` : `<div class="time-display">${m.time}</div>`;
      const fixture = m.solo
        ? `<span class="me">${m.title}</span>`
        : (m.meIsHome
            ? `<span class="me">${m.homeName}</span><span class="vs"> vs </span><span>${m.awayName}</span>`
            : `<span>${m.homeName}</span><span class="vs"> vs </span><span class="me">${m.awayName}</span>`);
      return `<div class="match-card ${comp.cls}${fin?' finished':''} fade-in">
        <div class="time-col">${timeHtml}</div>
        <div class="info-col"><div class="fixture">${fixture}</div><div class="match-meta">
          <span class="comp-badge ${comp.cls}">${comp.short}</span>
          ${m.venueTag?`<span class="tag"><i class="ti ti-${m.meIsHome?'home':'map-pin'}" style="font-size:13px"></i>${m.venueTag}</span>`:''}
          <span class="tag team">${m.teamLabel}</span></div></div>
        <div class="bcast-col"><div class="bcast-label">${b.real?'<span class="live-dot"></span>':''}Ver en</div>
          <a href="${b.url}" target="_blank" rel="noopener" class="bcast-box ${b.cls}"><div class="bcast-name">${b.name}</div><div class="bcast-detail">${b.detail}</div></a>
        </div></div>`;
    }).join('');
    return `<div class="date-section"><div class="date-label ${today?'today':''}">${label}${today?'<span class="today-dot"></span>':''}</div>${cards}</div>`;
  }).join('');
}

/* ─────────────── ORQUESTADOR ─────────────── */
async function fetchItem(item){
  if(item.type==='f1') return fetchF1();
  if(item.type==='motogp') return fetchMotoGP();
  return fetchFootballTeam(item); /* fútbol / baloncesto */
}

async function loadAll(forceRefresh=false){
  if(forceRefresh){ CACHE.clear(); }
  AGENDA=null;
  document.getElementById('content').innerHTML=`<div class="state"><i class="ti ti-loader spin"></i><div class="sub" style="margin-top:10px;letter-spacing:2px">${forceRefresh?'descargando datos frescos…':'cargando…'}</div></div>`;
  try{
    await loadAgenda(); /* canales de fútbol (mejor esfuerzo) */
    const all=[];
    for(const item of STATE.teams){
      try{ all.push(...await fetchItem(item)); }
      catch(e){ console.warn(item.label, e.message); }
    }
    all.sort((a,b)=>{
      if(a.finished!==b.finished) return a.finished?1:-1;
      return (a.date+(a.time==='TBD'?'99:99':a.time)).localeCompare(b.date+(b.time==='TBD'?'99:99':b.time));
    });
    renderMatches(all);
    const agendaOk = AGENDA && AGENDA.length>0;
    const firstTeam = STATE.teams.find(t=>t.type==='team' && t.id);
    const age = firstTeam ? CACHE.age(`${TSDB}/eventsnext.php?id=${firstTeam.id}`) : Infinity;
    const cacheStr = age<TTL.FIXTURES ? `· caché (${Math.round(age/60000)}min)` : '· datos al día';
    document.getElementById('last-updated').textContent = `${spainTimeStr()} ${cacheStr} ${agendaOk?'· canales en directo ✓':'· canales estimados'}`;
  }catch(e){
    document.getElementById('content').innerHTML=`<div class="state"><i class="ti ti-alert-circle" style="color:#ef4444"></i><div class="title">Error al cargar</div><div class="err">${e.message}</div><button onclick="loadAll(true)"><i class="ti ti-refresh"></i> Reintentar</button></div>`;
  }
}

/* ─────────────── AÑADIR / BUSCAR ─────────────── */
function addItem(item){
  if(STATE.teams.some(t=> (t.id&&t.id===item.id&&t.type===item.type) || (t.type===item.type&&['f1','motogp'].includes(t.type)) )) return;
  STATE.teams.push(item); saveState(); renderChips();
  document.getElementById('add-panel').classList.remove('open');
  document.getElementById('search-input').value=''; document.getElementById('results').innerHTML='';
  loadAll();
}
let searchTimer=null;
function setupSearch(){
  const input=document.getElementById('search-input'), results=document.getElementById('results');
  input.addEventListener('input',()=>{
    clearTimeout(searchTimer);
    const q=input.value.trim();
    if(q.length<3){ results.innerHTML=''; return; }
    searchTimer=setTimeout(async()=>{
      results.innerHTML=`<div style="color:var(--text3);font-size:12px;padding:8px">Buscando…</div>`;
      try{
        const teams=await searchTeams(q);
        if(!teams.length){ results.innerHTML=`<div style="color:var(--text3);font-size:12px;padding:8px">Sin resultados</div>`; return; }
        results.innerHTML=teams.map((t,i)=>`<div class="result" data-i="${i}"><img src="${t.strBadge||''}" onerror="this.style.visibility='hidden'"><div><div class="r-name">${t.strTeam}</div><div class="r-meta">${t.strSport} · ${t.strLeague||''}</div></div><span class="r-add"><i class="ti ti-plus"></i> añadir</span></div>`).join('');
        results.querySelectorAll('.result').forEach(el=>el.onclick=()=>{
          const t=teams[+el.dataset.i];
          addItem({type:'team', id:t.idTeam, searchName:t.strTeam, label:tr(t.strTeam), sport:t.strSport, badge:t.strBadge||''});
        });
      }catch{ results.innerHTML=`<div style="color:var(--text3);font-size:12px;padding:8px">Error de búsqueda</div>`; }
    },350);
  });
  document.querySelectorAll('.quick-chip').forEach(el=>el.onclick=()=>{
    const sp=el.dataset.special;
    if(sp==='f1') addItem({type:'f1', label:'Fórmula 1', sport:'Motorsport'});
    if(sp==='motogp') addItem({type:'motogp', label:'MotoGP', sport:'Motorsport'});
  });
}

/* ─────────────── DÍAS ─────────────── */
function setupDays(){
  const sel=document.getElementById('days-sel');
  const paint=()=>sel.querySelectorAll('button').forEach(b=>b.classList.toggle('active',+b.dataset.d===STATE.days));
  sel.querySelectorAll('button').forEach(b=>b.onclick=()=>{ STATE.days=+b.dataset.d; saveState(); paint(); loadAll(); });
  paint();
}

/* ─────────────── EXPORTAR / IMPORTAR CONFIG ─────────────── */
function exportConfig(){
  const blob=new Blob([JSON.stringify(STATE,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='eventitos-tv-config.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importConfig(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const obj=JSON.parse(reader.result);
      if(obj && Array.isArray(obj.teams)){
        STATE={days:obj.days||3, teams:obj.teams};
        saveState(); renderChips(); setupDays(); loadAll(true);
      }else alert('Archivo no válido.');
    }catch{ alert('No se pudo leer el archivo.'); }
  };
  reader.readAsText(file);
}
function setupMenu(){
  const panel=document.getElementById('menu-panel');
  document.getElementById('menu-btn').onclick=()=>panel.classList.toggle('open');
  document.getElementById('export-btn').onclick=()=>{ exportConfig(); panel.classList.remove('open'); };
  document.getElementById('import-btn').onclick=()=>document.getElementById('import-file').click();
  document.getElementById('import-file').onchange=e=>{ if(e.target.files[0]) importConfig(e.target.files[0]); panel.classList.remove('open'); };
}

/* ─────────────── INIT ─────────────── */
loadState();
setupDays();
setupSearch();
setupMenu();
renderChips();
document.getElementById('add-btn').onclick=()=>document.getElementById('add-panel').classList.toggle('open');
document.getElementById('refresh-btn').onclick=()=>loadAll(true);
loadAll();
