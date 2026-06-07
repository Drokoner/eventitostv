# 🔧 Cómo montar el Worker (clave oculta + sin proxies frágiles)

Crea un "mini-servidor" gratis en Cloudflare que guarda tu token de football-data.org
en secreto y le sirve los datos a tu web. El token **nunca** llega al navegador.

Tiempo: ~10 minutos. Todo gratis.

---

## Paso 1 — Token de football-data.org

1. Entra en **https://www.football-data.org/client/register** y regístrate gratis.
2. Te llega por email tu **API token** (una cadena larga de letras y números).
3. Cópialo y guárdalo. Lo necesitas en el paso 3.

> Plan gratuito: 10 peticiones/minuto. Cubre el **Mundial 2026**, La Liga, Champions,
> Europa League y las grandes ligas europeas. La app cachea 2 h, así que gastas poquísimo.

---

## Paso 2 — Crear el Worker en Cloudflare

1. Entra en **https://dash.cloudflare.com** y crea una cuenta gratis (o entra).
2. Menú lateral: **Workers & Pages** → **Create** → pestaña **Create Worker**.
3. Ponle nombre (ej. `eventitos`). Pulsa **Deploy** (despliega un "Hello World").
4. Pulsa **Edit code**.
5. **Borra todo** el código de ejemplo y **pega entero** el contenido de `worker.js`.
6. Pulsa **Deploy** (arriba a la derecha).

Cloudflare te da una URL tipo:
```
https://eventitos.TU-USUARIO.workers.dev
```
**Copia esa URL.**

---

## Paso 3 — Meter tu token como SECRETO

1. En tu Worker: **Settings** → **Variables and Secrets**.
2. **Add variable**:
   - **Variable name:** `FOOTBALLDATA_TOKEN`  (EXACTO, así, en mayúsculas)
   - **Value:** pega tu token del paso 1
   - Marca **Encrypt / Secret** 🔒
3. **Save and deploy**.

> Si antes habías puesto `APIFOOTBALL_KEY`, puedes borrarla — ya no se usa.

---

## Paso 4 — Conectar tu web al Worker

1. Abre `js/config.js`, busca:
   ```js
   const WORKER_URL = '';
   ```
2. Pon tu URL del Worker (SIN barra final):
   ```js
   const WORKER_URL = 'https://eventitos.TU-USUARIO.workers.dev';
   ```
3. Guarda, sube a GitHub, abre la web y pulsa **↻** para limpiar caché.

---

## ¿Funciona?

Abre en el navegador (cambia las fechas por hoy y dentro de 14 días):
```
https://eventitos.TU-USUARIO.workers.dev?fn=football&from=2026-06-07&to=2026-06-21
```
Debe salir un JSON con `matches: [ ... ]` lleno de partidos (Mundial incluido). ✅

- Si sale `{"error":"Falta FOOTBALLDATA_TOKEN..."}` → revisa el paso 3 (nombre exacto de la variable).
- Si sale `matches: []` vacío → puede que el token aún no esté activo (a veces tarda unos minutos tras el registro) o que no haya partidos en ese rango.

---

## ¿Qué hace el Worker?

- **Fútbol:** pide a football-data.org los partidos del rango, añadiendo tu token (que solo él conoce).
- **Canales y MotoGP:** descarga la parrilla pública de futbolenlatv.es y te la pasa (evita el bloqueo CORS).

No guarda nada ni registra quién eres. Es un "recadero" con tu token bajo llave.

> Nota honesta: football-data.org gratis cubre el Mundial y las grandes competiciones,
> pero **no los amistosos** de selecciones. Así que el amistoso España-Perú puede no salir,
> pero los partidos del Mundial sí. F1 y MotoGP van por su cuenta (no usan este token).

---

## 🔒 Restringir el Worker a tu web (ya incluido)

El `worker.js` trae una lista `ALLOWED_ORIGINS` arriba del todo. Solo las webs de
esa lista pueden usar tu Worker; cualquier otra recibe "Origen no autorizado".

**Edita esa línea** y pon la URL de TU GitHub Pages (sin barra final). Para saber cuál es:
en tu repo → **Settings → Pages** → te muestra la URL publicada (algo como
`https://TU-USUARIO.github.io`).

```js
const ALLOWED_ORIGINS = [
  'https://TU-USUARIO.github.io',   // ← tu web
  'http://localhost:8000',          // pruebas en local
  'http://127.0.0.1:8000',
];
```

Funciona desde **cualquier dispositivo** (móvil, PC, tablet) porque comprueba el
*dominio de la web*, no el aparato. Si abres tu web desde el móvil, sigue siendo
`TU-USUARIO.github.io`, así que está permitido.

> Tras editarlo, acuérdate de pulsar **Deploy** otra vez en Cloudflare.
> Nota: las pruebas escribiendo la URL del Worker directamente en la barra del
> navegador siguen funcionando (no llevan "Origin"). Lo que se bloquea es que otra
> web ajena llame a tu Worker desde el navegador de sus visitantes.
