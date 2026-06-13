/* ════════════════════════════════════════════════════════════════════
   config.js — constantes, caché, traducciones y helpers de emisión
   ════════════════════════════════════════════════════════════════════ */

/* ── TU WORKER DE CLOUDFLARE ──
   Pega aquí la URL que te dé Cloudflare al desplegar el Worker.
   Ejemplo: 'https://eventitos.tu-usuario.workers.dev'
   Si lo dejas vacío, la app usa el modo antiguo (TheSportsDB + proxy público,
   con sus limitaciones: solo 1 partido futuro por equipo). */
const WORKER_URL = 'https://eventitos.lairaragnar.workers.dev';

/* ── Plataformas legales en España ── */
const URL_RTVE     = 'https://www.rtve.es/play/';
const URL_DAZN     = 'https://www.dazn.com/es-ES/home';
const URL_MOVISTAR = 'https://ver.movistarplus.es/';
const URL_GUIA     = 'https://www.futbolenlatv.es/';

/* ── Caché en localStorage (evita rate-limiting) ──
   TTL: fixtures 2h · resultados 30min · agenda 30min · IDs equipo 24h · F1 12h */
const TTL = { FIXTURES:7200000, RESULTS:1800000, AGENDA:1800000, TEAMID:86400000, F1:43200000 };

const CACHE = {
  _k: k => 'evc_' + k.replace(/[^a-z0-9]/gi,'_').slice(0,90),
  get(k, maxMs){
    try{ const r=localStorage.getItem(this._k(k)); if(!r) return null;
      const {v,ts}=JSON.parse(r); if(Date.now()-ts>maxMs) return null; return v; }
    catch{ return null; }
  },
  set(k,v){ try{ localStorage.setItem(this._k(k),JSON.stringify({v,ts:Date.now()})); }catch{} },
  age(k){ try{ const r=localStorage.getItem(this._k(k)); return r?Date.now()-JSON.parse(r).ts:Infinity; }catch{ return Infinity; } },
  clear(){ try{ Object.keys(localStorage).filter(k=>k.startsWith('evc_')).forEach(k=>localStorage.removeItem(k)); }catch{} },
};

/* fetch con caché + pausa de cortesía entre llamadas reales */
async function cfetch(url, ttl){
  const cached = CACHE.get(url, ttl);
  if(cached !== null) return { data: cached, fromCache: true };
  await new Promise(r=>setTimeout(r,300));
  const data = await (await fetch(url)).json();
  CACHE.set(url, data);
  return { data, fromCache: false };
}

/* ── Proxies CORS (para futbolenlatv.es) ── */
const PROXIES = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];
async function proxyFetch(url){
  for(const p of PROXIES){
    try{ const r=await fetch(p(url)); if(r.ok){ const t=await r.text(); if(t&&t.length>500) return t; } }catch{}
  }
  throw new Error('proxy no disponible');
}

/* ── Fechas, siempre en hora de España ── */
function spainDateStr(offsetDays=0){
  return new Date(Date.now()+offsetDays*86400000).toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'});
}
function spainTimeStr(){
  return new Date().toLocaleTimeString('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',hour12:false});
}
/* Convierte fecha+hora UTC (o ISO con Z) a {time,date} en España */
function utcToSpain(dateStr, timeStr){
  if(!timeStr || timeStr==='00:00:00') return { time:'TBD', date:dateStr };
  try{
    const iso = timeStr.endsWith('Z') ? `${dateStr}T${timeStr}` : `${dateStr}T${timeStr}Z`;
    const x = new Date(iso);
    if(isNaN(x)) return { time:'TBD', date:dateStr };
    return {
      time: x.toLocaleTimeString('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',hour12:false}),
      date: x.toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'}),
    };
  }catch{ return { time:'TBD', date:dateStr }; }
}
function dateLabel(ds){
  const t=spainDateStr(), m=spainDateStr(1);
  if(ds===t) return { label:'Hoy', today:true };
  if(ds===m) return { label:'Mañana', today:false };
  const s = new Date(ds+'T12:00:00Z').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
  return { label: s.charAt(0).toUpperCase()+s.slice(1), today:false };
}

/* ── Traducción de nombres EN → ES ── */
const ES_NAMES = {Spain:'España',Portugal:'Portugal',Iraq:'Irak',Chile:'Chile',France:'Francia',Germany:'Alemania',England:'Inglaterra',Italy:'Italia',Brazil:'Brasil',Argentina:'Argentina',Netherlands:'Países Bajos',Croatia:'Croacia',Morocco:'Marruecos','United States':'EE. UU.','USA':'EE. UU.',Mexico:'México',Japan:'Japón','South Korea':'Corea del Sur','Saudi Arabia':'Arabia Saudí',Peru:'Perú',Belgium:'Bélgica',Switzerland:'Suiza',Denmark:'Dinamarca',Sweden:'Suecia',Norway:'Noruega',Poland:'Polonia',Austria:'Austria',Serbia:'Serbia',Egypt:'Egipto',Colombia:'Colombia',Uruguay:'Uruguay',Ecuador:'Ecuador',Andorra:'Andorra',Ireland:'Irlanda',Scotland:'Escocia',Wales:'Gales',Turkey:'Turquía',Greece:'Grecia',Ukraine:'Ucrania',Jordan:'Jordania',Iceland:'Islandia',Australia:'Australia',Tunisia:'Túnez',Honduras:'Honduras',Bolivia:'Bolivia',Canada:'Canadá','Cape Verde':'Cabo Verde','Cabo Verde':'Cabo Verde','Ivory Coast':'Costa de Marfil','Czech Republic':'Chequia','Republic of Ireland':'Irlanda','South Africa':'Sudáfrica','New Zealand':'Nueva Zelanda',Paraguay:'Paraguay',Venezuela:'Venezuela',Nigeria:'Nigeria',Senegal:'Senegal',Cameroon:'Camerún',Ghana:'Ghana',Qatar:'Catar',Panama:'Panamá','Costa Rica':'Costa Rica'};
const tr = n => ES_NAMES[n] || n;
const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');

/* ── Emisión por competición (fallback cuando no hay dato real) ── */
function fallbackBroadcast(item, sport, league){
  const s=(sport||'').toLowerCase(), l=(league||'').toLowerCase();
  if(item.searchName==='Spain'){
    if(/world cup|mundial/.test(l)) return {name:'La 1 / DAZN',detail:'RTVE Play · DAZN →',cls:'b-tve',url:URL_RTVE};
    if(/friendl|amistoso|international|nations|euro|qualif|clasif/.test(l)) return {name:'La 1',detail:'RTVE Play →',cls:'b-tve',url:URL_RTVE};
  }
  if(s.includes('basketball') && /nba/.test(l)) return {name:'Movistar+',detail:'NBA League Pass →',cls:'b-movistar',url:URL_MOVISTAR};
  if(/champions league/.test(l)) return {name:'Movistar+',detail:'M+ Liga Campeones →',cls:'b-movistar',url:URL_MOVISTAR};
  if(/europa league/.test(l))    return {name:'Movistar+',detail:'Movistar LaLiga →',cls:'b-movistar',url:URL_MOVISTAR};
  if(/conference league/.test(l))return {name:'DAZN',detail:'DAZN →',cls:'b-dazn',url:URL_DAZN};
  if(/primera division|laliga|la liga/.test(l)) return {name:'DAZN o M+',detail:'comprueba la guía →',cls:'b-default',url:URL_GUIA};
  if(/copa del rey/.test(l)) return {name:'La 1 / DAZN',detail:'según partido →',cls:'b-tve',url:URL_GUIA};
  return null;
}

/* ── Estilo y nombre corto de competición ── */
function getComp(league, sport){
  const s=(league||'').toLowerCase(), sp=(sport||'').toLowerCase();
  if(/world cup|mundial/.test(s))               return {cls:'c-mundial',short:'Mundial'};
  if(/nations league/.test(s))                  return {cls:'c-nations',short:'Nations'};
  if(/european championship|eurocopa/.test(s))  return {cls:'c-eurocopa',short:'Eurocopa'};
  if(/qualif|clasif/.test(s))                   return {cls:'c-clasif',short:'Clasif.'};
  if(/champions league/.test(s))                return {cls:'c-champions',short:'UCL'};
  if(/europa league/.test(s))                   return {cls:'c-uel',short:'UEL'};
  if(/conference league/.test(s))               return {cls:'c-uecl',short:'UECL'};
  if(/primera division|la liga|laliga/.test(s)) return {cls:'c-liga',short:'Liga'};
  if(/copa del rey/.test(s))                    return {cls:'c-copa',short:'Copa'};
  if(/friendl|amistoso|international/.test(s))   return {cls:'c-amistoso',short:'Amistoso'};
  if(/formula 1|f1/.test(s))                    return {cls:'c-f1',short:'F1'};
  if(/motogp/.test(s))                          return {cls:'c-motogp',short:'MotoGP'};
  if(sp.includes('basketball')||/nba/.test(s))  return {cls:'c-nba',short:(league||'NBA').slice(0,10)};
  return {cls:'c-default',short:(league||'—').slice(0,14)};
}
