# 📺 Eventitos TV

App web minimalista para saber **cuándo juegan tus equipos y dónde verlos en España**. Sin instalar nada, sin cuentas, sin backend.

Sigue a la selección, a tu club, a un equipo NBA, a la Fórmula 1 o a MotoGP, y la app te muestra los próximos eventos con su hora (en horario español) y el canal donde verlos.

## ✨ Qué hace

- **Fútbol y baloncesto** — busca cualquier equipo o selección y añádelo. Horarios + canal exacto.
- **Distingue DAZN de Movistar+** en LaLiga partido a partido (vía futbolenlatv.es), que es lo único que no se puede deducir por competición.
- **Fórmula 1** — calendario completo de cada Gran Premio: prácticas, clasificación, sprint y carrera. Canal: DAZN.
- **MotoGP** — sesiones del fin de semana (solo MotoGP, sin Moto2/Moto3). Canal: DAZN.
- **Resultados recientes** — los partidos que ya se jugaron aparecen con el marcador.
- **Rango configurable** — 3, 7 o 14 días vista.
- **Todo en hora española**, sin importar la zona horaria de tu equipo.
- **Exportar / importar** tu lista de equipos como `.json` para llevarla a otro navegador o hacer copia.

## 🗂️ Fuentes de datos

| Dato | Fuente | Coste |
|------|--------|-------|
| Calendario fútbol/baloncesto | [TheSportsDB](https://www.thesportsdb.com/) (tier gratuito) | Gratis |
| Calendario F1 (todas las sesiones) | [Jolpica / Ergast](https://github.com/jolpica/jolpica-f1) | Gratis |
| Sesiones MotoGP | [futbolenlatv.es](https://www.futbolenlatv.es/) | Gratis |
| Canal exacto en España (fútbol) | [futbolenlatv.es](https://www.futbolenlatv.es/) | Gratis |

> Los canales de fútbol se leen de futbolenlatv.es a través de un proxy CORS público
> (`allorigins.win` / `corsproxy.io`). Es la parte más frágil: si el proxy cae o la web
> cambia su HTML, la app sigue funcionando pero muestra "canales estimados" por competición.

## 🚀 Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (p. ej. `eventitos-tv`).
2. Sube todos estos archivos manteniendo la estructura:
   ```
   index.html
   css/styles.css
   js/config.js
   js/sources.js
   js/app.js
   .nojekyll
   README.md
   ```
3. En el repo: **Settings → Pages → Build and deployment**.
4. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guarda.
5. Espera 1-2 min. Tu app estará en `https://TU-USUARIO.github.io/eventitos-tv/`.

El archivo `.nojekyll` evita que GitHub Pages procese el sitio con Jekyll (innecesario aquí).

## 💻 Uso en local

Por las restricciones de CORS del navegador con `file://`, lo ideal es servirlo por HTTP.
Desde la carpeta del proyecto:

```bash
# Python
python3 -m http.server 8000
# luego abre http://localhost:8000
```

Abrirlo con doble clic (`file://`) también funciona para casi todo, salvo que algún
navegador bloquee `localStorage` o las llamadas en ese modo.

## 🧠 Cómo guarda los datos

- **Tus equipos y preferencias** → `localStorage` del navegador (persisten entre visitas).
- **Caché de resultados de las APIs** → `localStorage` con caducidad: fixtures 2 h,
  resultados 30 min, calendario F1 12 h. Esto evita saturar las APIs gratuitas
  (TheSportsDB bloquea por IP si recibe muchas peticiones seguidas).
- El botón **↻** fuerza una descarga nueva ignorando la caché.
- Para mover tu configuración entre dispositivos: menú **⋮ → Exportar / Importar**.

## ⚠️ Limitaciones conocidas

- **No hay API gratuita de derechos de TV en España.** Los canales de fútbol se obtienen
  raspando futbolenlatv.es; lo demás (F1/MotoGP siempre DAZN, Champions en Movistar, etc.)
  es un mapeo fijo porque esos derechos no cambian semana a semana.
- **Series de playoffs** (p. ej. Finales NBA): TheSportsDB añade los partidos según se
  confirman, así que puede que no estén todos cargados con antelación.
- Es un proyecto personal, **sin afiliación** con TheSportsDB, Jolpica, futbolenlatv,
  DAZN, Movistar+ ni RTVE.

## 📁 Estructura del código

```
index.html        → maquetación y carga de scripts
css/styles.css    → estilos (tema oscuro, responsive)
js/config.js      → constantes, caché, fechas, traducciones, emisión por competición
js/sources.js     → fetchers: TheSportsDB, Jolpica (F1), futbolenlatv (MotoGP + canales)
js/app.js         → estado, render, buscar/añadir, exportar/importar, init
```

---

Hecho con cariño para no tener que buscar nunca más "dónde ver el [equipo]" en Google.
