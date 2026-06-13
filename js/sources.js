/* ════════════════════════════════════════════════════════════════════
   sources.js — fuentes de datos
   · Fútbol           → API-Football vía tu Worker  (arregla el Mundial)
                        (si no hay Worker → TheSportsDB, modo limitado)
   · F1               → Jolpica (Ergast)  [todas las sesiones]  — directo
   · MotoGP           → futbolenlatv.es vía Worker (o proxy público)
   · Canales fútbol   → futbolenlatv.es vía Worker (o proxy público)
   · Baloncesto/NBA   → TheSportsDB — directo (modo limitado: próximo partido)
   ════════════════════════════════════════════════════════════════════ */

const TSDB = 'https://www.thesportsdb.com/api/v1/json/3';

/* ─────────────── Proxy de futbolenlatv (Worker o público) ─────────────── */
const PUBLIC_PROXIES = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];
async function fetchFutbolenlatv(which){   /* which: 'channels' | 'motogp' */
  if (WORKER_URL) {
    const r = await fetch(`${WORKER_URL}?fn=${which}`);
    if (!r.ok) throw new Error('worker ' + r.status);
    const t = await r.text();
    if (t && t.length > 500) return t;
    throw new Error('worker html vacío');
  }
  const target = which === 'motogp'
    ? 'https://www.futbolenlatv.es/deporte/motociclismo'
    : 'https://www.futbolenlatv.es/';
  for (const p of PUBLIC_PROXIES) {
    try { const r = await fetch(p(target)); if (r.ok) { const t = await r.text(); if (t && t.length > 500) return t; } } catch {}
  }
  throw new Error('proxy no disponible');
}

/* ─────────────── AGENDA futbolenlatv (canales de fútbol) ─────────────── */
let AGENDA = null;
function parseChannels(t){
  const out=[]; const add=x=>{ if(!out.includes(x)) out.push(x); };
  if(/dazn ?laliga/i.test(t)) add('DAZN LaLiga'); else if(/dazn/i.test(t)) add('DAZN');
  if(/m\+ ?laliga|movistar ?laliga|laliga tv/i.test(t)) add('M+ LaLiga');
  if(/m\+ ?liga de campeones|movistar liga de campeones/i.test(t)) add('M+ Liga Campeones');
  if(/fanzone/i.test(t)) add('M+ FanZone');
  if(/(la ?1|rtve|tve|teledeporte)/i.test(t)) add('La 1 / RTVE');
  if(/\bgol\b/i.test(t)) add('GOL');
  if(/uefa tv/i.test(t)) add('UEFA TV');
  if(/movistar\+|m\+/i.test(t) && !out.some(o=>/M\+/.test(o))) add('Movistar+');
  return out;
}
function styleChannel(n){
  if(/dazn/i.test(n)) return {cls:'b-dazn',url:URL_DAZN};
  if(/m\+|movistar/i.test(n)) return {cls:'b-movistar',url:URL_MOVISTAR};
  if(/la ?1|rtve|tve|teledeporte/i.test(n)) return {cls:'b-tve',url:URL_RTVE};
  return {cls:'b-default',url:URL_GUIA};
}
async function loadAgenda(){
  if(AGENDA) return AGENDA;
  const cached = CACHE.get('agenda_futbol', TTL.AGENDA);
  if(cached){ AGENDA = cached; return AGENDA; }
  AGENDA = [];
  try{
    const html = await fetchFutbolenlatv('channels');
    const doc = new DOMParser().parseFromString(html,'text/html');
    let cur=null;
    doc.querySelectorAll('tr').forEach(row=>{
      const txt=row.textContent.replace(/\s+/g,' ').trim();
      const dm=txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const hasTime=/\b\d{1,2}:\d{2}\b/.test(txt);
      if(dm && !hasTime){ cur=`${dm[3]}-${dm[2]}-${dm[1]}`; return; }
      if(!cur || !hasTime) return;
      const names=new Set();
      row.querySelectorAll('a[href*="/equipo/"]').forEach(a=>{const n=a.textContent.trim();if(n)names.add(n);});
      row.querySelectorAll('img[alt]').forEach(i=>{const n=i.getAttribute('alt').trim();if(n)names.add(n);});
      if(!names.size) return;
      const cells=row.querySelectorAll('td');
      const chanText=cells.length?cells[cells.length-1].textContent:'';
      AGENDA.push({date:cur, teams:[...names].map(norm), channels:parseChannels(chanText)});
    });
    CACHE.set('agenda_futbol', AGENDA);
  }catch(e){ console.warn('Agenda fútbol:', e.message); }
  return AGENDA;
}
function findChannels(home, away, date){
  if(!AGENDA || !AGENDA.length) return null;
  const h=norm(tr(home)), a=norm(tr(away));
  const row=AGENDA.find(r=> r.date===date
    && r.teams.some(t=>t.includes(h)||h.includes(t))
    && r.teams.some(t=>t.includes(a)||a.includes(t)));
  if(!row || !row.channels.length) return null;
  const primary=row.channels[0], st=styleChannel(primary), rest=row.channels.slice(1);
  return {name:primary, detail:(rest.length?rest.join(' · '):'futbolenlatv.es')+' →', cls:st.cls, url:st.url, real:true};
}

/* ─────────────── Búsqueda de equipos (UI) — TheSportsDB ─────────────── */
async function searchTeams(q){
  const {data} = await cfetch(`${TSDB}/searchteams.php?t=${encodeURIComponent(q)}`, TTL.TEAMID);
  return (data.teams||[]).slice(0,12);
}

/* ─────────────── FÚTBOL ─────────────── */
/* Fuente: football-data.org vía Worker. Una sola llamada trae todos los
   partidos del rango (Mundial, La Liga, Champions…) y filtramos por equipo. */

/* ¿Coincide un nombre de equipo con el que sigue el usuario? (difuso) */
function teamMatches(name, item){
  const n = norm(name);
  const targets = [item.searchName, item.label].filter(Boolean).map(norm);
  return targets.some(t => t && (n===t || n.includes(t) || t.includes(n)));
}
/* Convierte un partido de football-data.org a nuestro formato */
function mapFdMatch(m, item, meIsHome){
  const iso = m.utcDate || '';                       /* "2026-06-15T16:00:00Z" */
  const { time, date } = utcToSpain(iso.slice(0,10), iso.slice(11,19));
  const league = (m.competition && m.competition.name) || item.label;
  const status = m.status;
  const finished = status === 'FINISHED';
  const ft = (m.score && m.score.fullTime) || {};
  const hasScore = ft.home != null;
  const score = hasScore ? `${ft.home} – ${ft.away}` : '';
  const home = (m.homeTeam && m.homeTeam.name) || '';
  const away = (m.awayTeam && m.awayTeam.name) || '';
  const real = findChannels(home, away, date);
  const fb = fallbackBroadcast(item, item.sport, league);
  return {
    date, time, league, sport:item.sport, teamLabel:item.label, finished, score, solo:false, meIsHome,
    homeName: tr(home), awayName: tr(away),
    venueTag: m.venue ? (meIsHome ? 'local' : 'visitante') : '',
    broadcast: real || fb || {name:'No televisado', detail:'en España →', cls:'b-none', url:URL_GUIA},
  };
}
async function fetchFootballViaWorker(item){
  const today=spainDateStr(), yesterday=spainDateStr(-1), cutDate=spainDateStr(STATE.days);
  /* Una sola llamada compartida por todos los equipos (se cachea por URL) */
  const {data} = await cfetch(`${WORKER_URL}?fn=football&from=${yesterday}&to=${cutDate}`, TTL.FIXTURES);
  if(data.error || data.errorCode){ throw new Error(data.error || data.message || 'football-data error'); }
  const matches = data.matches || [];
  const out = [];
  for(const m of matches){
    const home=(m.homeTeam&&m.homeTeam.name)||'', away=(m.awayTeam&&m.awayTeam.name)||'';
    const isHome = teamMatches(home, item), isAway = teamMatches(away, item);
    if(!isHome && !isAway) continue;
    out.push(mapFdMatch(m, item, isHome));
  }
  /* dentro de ventana; pasados solo con resultado */
  const seen=new Set();
  return out.filter(e=>{
    const okDate = e.finished ? (e.date>=yesterday && e.date<today) : (e.date>=today && e.date<=cutDate);
    if(!okDate) return false;
    if(e.finished && !e.score) return false;
    const k=e.date+e.homeName+e.awayName; if(seen.has(k)) return false; seen.add(k); return true;
  });
}

/* Fallback (sin Worker): TheSportsDB — solo devuelve el próximo partido en gratis */
function mapTsdbEvent(e, item, forceFinished=false){
  const {time,date}=utcToSpain(e.dateEvent, e.strTime);
  const league=e.strLeague||item.label;
  const hasScore=e.intHomeScore!=null && e.intHomeScore!=='';
  const fin=forceFinished||hasScore;
  const score=hasScore?`${e.intHomeScore} – ${e.intAwayScore}`:'';
  const base={date,time,league,sport:item.sport,teamLabel:item.label,finished:fin,score};
  if(!e.strAwayTeam || !e.strHomeTeam){
    const bc=fallbackBroadcast(item,item.sport,league)||{name:'Ver guía',detail:'futbolenlatv.es →',cls:'b-default',url:URL_GUIA};
    return {...base, solo:true, title:tr(e.strEvent||league), broadcast:bc};
  }
  const meIsHome=e.strHomeTeam.toLowerCase()===(item.searchName||'').toLowerCase();
  const real=findChannels(e.strHomeTeam, e.strAwayTeam, date);
  const fb=fallbackBroadcast(item,item.sport,league);
  return {...base, solo:false, meIsHome, homeName:tr(e.strHomeTeam), awayName:tr(e.strAwayTeam),
    venueTag: e.strVenue ? (meIsHome?'local':'visitante') : '',
    broadcast: real || fb || {name:'No televisado',detail:'en España →',cls:'b-none',url:URL_GUIA}};
}
async function fetchFootballTeamViaTSDB(item){
  if(!item.id){
    const {data}=await cfetch(`${TSDB}/searchteams.php?t=${encodeURIComponent(item.searchName)}`, TTL.TEAMID);
    const tm=(data.teams||[]).find(t=>t.strSport===(item.sport||'Soccer') && t.strTeam.toLowerCase()===item.searchName.toLowerCase());
    if(!tm) throw new Error(`No encontrado: ${item.searchName}`);
    item.id=tm.idTeam; if(!item.badge) item.badge=tm.strBadge||''; saveState();
  }
  const today=spainDateStr(), yesterday=spainDateStr(-1), cutDate=spainDateStr(STATE.days);
  const {data:dn}=await cfetch(`${TSDB}/eventsnext.php?id=${item.id}`, TTL.FIXTURES);
  const future=(dn.events||[]).map(e=>mapTsdbEvent(e,item,false)).filter(e=>e.date>=today && e.date<=cutDate);
  let past=[];
  try{
    const {data:dp}=await cfetch(`${TSDB}/eventslast.php?id=${item.id}`, TTL.RESULTS);
    const raw=dp.results||dp.events||[];
    past=raw.slice(-5).map(e=>mapTsdbEvent(e,item,true)).filter(e=>e.date>=yesterday && e.date<today && (e.score||e.finished));
  }catch{}
  const seen=new Set();
  return [...future,...past].filter(e=>{ const k=e.date+(e.homeName||'')+(e.awayName||'')+(e.title||''); if(seen.has(k)) return false; seen.add(k); return true; });
}

/* Punto de entrada fútbol/baloncesto */
async function fetchFootballTeam(item){
  /* Baloncesto siempre por TheSportsDB (football-data.org es solo fútbol) */
  if((item.sport||'').toLowerCase().includes('basketball')) return fetchFootballTeamViaTSDB(item);
  if(WORKER_URL) return fetchFootballViaWorker(item);
  return fetchFootballTeamViaTSDB(item);
}

/* ─────────────── DETALLE DE UN EQUIPO (último + próximos) ─────────────── */
async function fetchTeamDetail(item){
  if(!WORKER_URL) throw new Error('Configura el Worker');
  const today=spainDateStr();
  const {data}=await cfetch(`${WORKER_URL}?fn=football&from=${spainDateStr(-14)}&to=${spainDateStr(30)}`, TTL.FIXTURES);
  if(data.error) throw new Error(data.error);
  const mine=(data.matches||[]).filter(m=>{
    const h=(m.homeTeam&&m.homeTeam.name)||'', a=(m.awayTeam&&m.awayTeam.name)||'';
    return teamMatches(h,item)||teamMatches(a,item);
  }).map(m=>mapFdMatch(m,item, teamMatches((m.homeTeam&&m.homeTeam.name)||'',item)));
  const sortKey=e=>e.date+(e.time==='TBD'?'99:99':e.time);
  const finished=mine.filter(e=>e.finished && e.date<=today).sort((a,b)=>sortKey(a).localeCompare(sortKey(b)));
  const upcoming=mine.filter(e=>!e.finished && e.date>=today).sort((a,b)=>sortKey(a).localeCompare(sortKey(b)));
  return { ultimo: finished[finished.length-1]||null, proximos: upcoming.slice(0,6) };
}

/* ─────────────── MUNDIAL (ayer / hoy / mañana) ─────────────── */
function mapMundialMatch(m){
  const iso=m.utcDate||'';
  const {time,date}=utcToSpain(iso.slice(0,10), iso.slice(11,19));
  const status=m.status;
  const finished=status==='FINISHED';
  const live=status==='IN_PLAY'||status==='PAUSED';
  const ft=(m.score&&m.score.fullTime)||{};
  const score=(ft.home!=null)?`${ft.home} – ${ft.away}`:'';
  const home=(m.homeTeam&&m.homeTeam.name)||'', away=(m.awayTeam&&m.awayTeam.name)||'';
  const grp=m.group?m.group.replace('GROUP_','Grupo '):(m.stage?m.stage.replace(/_/g,' ').toLowerCase():'');
  const real=findChannels(home,away,date);
  return {
    date, time, league:'FIFA World Cup', sport:'Soccer', teamLabel:grp,
    finished, live, score, solo:false, neutral:true,
    homeName:tr(home), awayName:tr(away), venueTag:'',
    broadcast: real || {name:'Ver guía', detail:'futbolenlatv.es →', cls:'b-default', url:URL_GUIA},
  };
}
async function fetchMundial(){
  if(!WORKER_URL) throw new Error('Configura el Worker para ver el Mundial');
  const ayer=spainDateStr(-1), manana=spainDateStr(1);
  const {data}=await cfetch(`${WORKER_URL}?fn=football&from=${ayer}&to=${manana}`, TTL.FIXTURES);
  if(data.error) throw new Error(data.error);
  return (data.matches||[])
    .filter(m=>(m.competition&&m.competition.code)==='WC')
    .map(mapMundialMatch)
    .filter(e=> e.date>=ayer && e.date<=manana);
}

/* ─────────────── MOTOR (canal fijo: DAZN) ─────────────── */
function makeMotorEvent(date, time, league, title, detail){
  return {date, time, league, sport:'Motorsport', teamLabel:league, finished:false, score:'',
    solo:true, title,
    broadcast:{name:'DAZN', detail:(detail||'DAZN')+' →', cls:'b-dazn', url:URL_DAZN}};
}

/* F1 — Jolpica (Ergast). Todas las sesiones del fin de semana. Directo. */
async function fetchF1(){
  const year=new Date().getFullYear();
  const {data}=await cfetch(`https://api.jolpi.ca/ergast/f1/${year}.json`, TTL.F1);
  const races=data?.MRData?.RaceTable?.Races || [];
  const today=spainDateStr(), cutDate=spainDateStr(STATE.days);
  const defs=[['FirstPractice','Práctica 1'],['SecondPractice','Práctica 2'],['ThirdPractice','Práctica 3'],
    ['SprintQualifying','Clasif. Sprint'],['SprintShootout','Clasif. Sprint'],['Sprint','Sprint'],['Qualifying','Clasificación']];
  const out=[];
  for(const race of races){
    const gp=(race.raceName||'GP').replace(/grand prix/i,'GP');
    for(const [key,label] of defs){
      const s=race[key];
      if(s && s.date){ const {time,date}=utcToSpain(s.date,s.time); out.push(makeMotorEvent(date,time,'Formula 1',`${gp} · ${label}`,'DAZN F1')); }
    }
    if(race.date){ const {time,date}=utcToSpain(race.date,race.time); out.push(makeMotorEvent(date,time,'Formula 1',`${gp} · Carrera`,'DAZN F1')); }
  }
  return out.filter(e=>e.date>=today && e.date<=cutDate);
}

/* MotoGP — futbolenlatv.es/deporte/motociclismo (vía Worker), solo MotoGP */
async function fetchMotoGP(){
  const today=spainDateStr(), cutDate=spainDateStr(STATE.days);
  let rows = CACHE.get('agenda_motogp', TTL.AGENDA);
  if(!rows){
    rows=[];
    try{
      const html=await fetchFutbolenlatv('motogp');
      const doc=new DOMParser().parseFromString(html,'text/html');
      let cur=null;
      doc.querySelectorAll('tr').forEach(row=>{
        const txt=row.textContent.replace(/\s+/g,' ').trim();
        const dm=txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        const tm=txt.match(/\b(\d{1,2}:\d{2})\b/);
        if(dm && !tm){ cur=`${dm[3]}-${dm[2]}-${dm[1]}`; return; }
        if(!cur || !tm) return;
        if(!/motogp/i.test(txt)) return;       /* solo MotoGP, fuera Moto2/Moto3/MotoE */
        rows.push({date:cur, time:tm[1], text:txt});
      });
      CACHE.set('agenda_motogp', rows);
    }catch(e){ console.warn('MotoGP:', e.message); }
  }
  return rows.map(r=>{
    let label='MotoGP';
    if(/carrera|\brace\b/i.test(r.text)) label='MotoGP · Carrera';
    else if(/sprint/i.test(r.text)) label='MotoGP · Sprint';
    else if(/clasif|qualy|qualifying|\bq1\b|\bq2\b/i.test(r.text)) label='MotoGP · Clasificación';
    else if(/libre|practice|entrenamient|\bfp\d|warm ?up/i.test(r.text)) label='MotoGP · Libres';
    return makeMotorEvent(r.date, r.time, 'MotoGP', label, 'DAZN MotoGP');
  }).filter(e=>e.date>=today && e.date<=cutDate);
}
