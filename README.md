# Mapa · wxlter.

PWA para registrar países, territorios, regiones, ciudades y lugares visitados. Producción: `map.wxlter.dev`.

Stack: Vite + React + TypeScript · MapLibre GL · Firebase (Auth, Firestore offline, Storage) · Vercel (estático + 2 funciones).
Diseño: design system wxlter (`design_handoff_marca_wxlter`), tokens en `src/styles/tokens.css` (tema claro/oscuro).
Idiomas: español (fuente) e inglés — `t('texto en español')` en `src/lib/i18n.ts`, diccionario en `src/lib/i18n-en.ts`.

## Requisitos

- Node 24 (`nvm use` lee `.nvmrc`). Vite 8 no funciona con Node < 22.12.
- Java 17+ para los emuladores de Firebase (`firebase-tools` está fijado en v13 porque v14+ exige Java 21).

## Desarrollo local (sin proyecto de Firebase)

```bash
nvm use
npm install
cp .env.example .env.local   # deja VITE_USE_EMULATORS=true
npm run emulators            # Auth :9099 · Firestore :8080 · Storage :9199 · UI :4000
npm run dev                  # http://localhost:5173
```

Los datos del emulador se guardan en `.emulator-data/` al cerrar. Crea una cuenta cualquiera desde la
pantalla de login: solo existe en el emulador. Para tener un historial de ejemplo (Europa, Japón, EE. UU.,
México, Perú…) en esa cuenta: `node scripts/seed-emulator.mjs`.

## Pruebas

```bash
npm test             # lógica: fechas, % por país, líneas de viaje, logros, copias de seguridad
npm run test:rules   # reglas de Firestore y Storage contra un emulador aislado (proyecto demo-rules)
npx tsx scripts/og-preview.mts <token>   # tarjeta de vista previa de un link, contra el emulador
```

## Datos geográficos

`public/data/` se genera y se versiona. Para regenerarlo:

```bash
npm run fetch:data   # descarga Natural Earth, GeoNames y Wikidata a data-raw/ (ignorado)
npm run build:data   # simplifica y escribe public/data/
```

| Archivo | Contenido |
|---|---|
| `countries.geojson` | Polígonos de 193 países ONU + 44 territorios (Natural Earth 1:50m) |
| `countries.json` | Nombre en español, continente, tipo, soberano, capital, moneda, idiomas (GeoNames) |
| `regions.json` · `admin1/{ISO3}.json` | 4.579 regiones con área, para el % por país (Natural Earth 1:10m) |
| `cities.json` | 34k ciudades > 15.000 hab. con región asignada (GeoNames; nombres es de Wikidata) |
| `landmarks.json` | 1.263 sitios UNESCO (Wikidata) + 7 maravillas |

## Reglas del modelo

- Una entrada por lugar en `users/{uid}/entries/{tipo:id}` con estado, fechas (varias), etiquetas, valoración, hasta 12 fotos
  (`photos[]`; `photoPath` = portada) y `tripIds` derivado de las fechas. La descripción y las personas van aparte en
  `users/{uid}/notes/{tipo:id}` para que los links puedan ocultarlas.
- Una ciudad, región o lugar con estado implica ese estado en su país.
- **Vivido** y **Visitado** cuentan para estadísticas; **Escala**, **Planeado** y **Quiero ir** no.
- % del país = área de las regiones visitadas / área total, salvo override manual en la entrada del país.
- **Viajes** (`users/{uid}/trips/{id}`): nombre + descripción. Cada rango de fechas de una entrada puede apuntar a un viaje
  (`dates[].tripId`); el itinerario, las fechas y los días del viaje se derivan de ahí. Borrar un viaje conserva las fechas.
- **Líneas de viaje y repetición**: paradas Vivido/Visitado/Escala ordenadas por fecha (`src/lib/journey.ts`), unidas
  con arcos de círculo máximo cortados en el antimeridiano. La repetición pinta el mapa solo con lo visitado hasta cada fecha.
- **Logros** (`src/lib/achievements.ts`): 30 logros en 6 grupos, evaluados en orden cronológico para fechar el desbloqueo.
  El ícono sigue la serie de íconos wxlter: la banda amarilla sube con el progreso.
- **Modo raspar**: lámina ink rayada sobre lo no visitado; se "raspan" los países Vivido/Visitado y, en países
  parciales, solo sus regiones visitadas. Preferencia por dispositivo (localStorage).
- **Exportar** (`/exportar`): póster PNG dibujado en canvas con proyección Equal Earth (4 formatos, 4 estilos, líneas
  opcionales), CSV (una fila por visita, UTF-8 con BOM) y copia JSON que se puede restaurar (sobrescribe por clave).
- **Quiero ir** (Viajes → Quiero ir, y en el panel de cada lugar): «Combínalo con» sugiere sitios UNESCO y ciudades
  a 40–250 km (o lo más destacado del país) y vecinos no visitados; «Ideas» propone países que limitan con lo visitado,
  los que faltan para logros regionales (más cercanos primero) y maravillas pendientes. «+» añade a Quiero ir.
- **Links de solo lectura**: `shares/{token}` → `{ uid, displayName, tripId? }`.
  - Mapa completo: con `users/{uid}.sharing.enabled = true` se leen perfil, entradas, viajes y fotos sin sesión.
  - Un viaje: `users/{uid}.sharedTrips` lista los viajes compartidos; solo se leen las entradas cuyo `tripIds` los incluye.
  - Notas (`notes/`) solo con `sharing.showNotes = true`. Nunca se guarda el correo en el perfil (es público con link activo).
  - Regenerar invalida el link anterior; desactivar corta toda lectura pública.
  - `/s/{token}` pasa por `api/share-page.ts`, que añade etiquetas Open Graph; `api/og.ts` genera la imagen (satori + resvg).
- **Marcado rápido**: tocar países en el mapa o marcarlos en una lista; nunca borra entradas con fechas, notas o fotos.
- **Cuenta**: verificar correo, cambiar contraseña, eliminar la cuenta con todos sus datos y fotos, tema e idioma.

## Configurar Firebase (una vez)

1. Crear el proyecto en la consola de Firebase.
2. **Authentication → Método de acceso → Correo electrónico/contraseña**: activar.
3. **Firestore Database → Crear base de datos** (modo producción; `nam5`).
4. **Storage → Comenzar** (requiere plan Blaze).
5. **Configuración del proyecto → Tus apps → Web**: registrar la app. Su config pública está en `.env.production`
   (proyecto `map-wxlter-dev`); el build de producción la usa automáticamente.
6. **Authentication → Configuración → Dominios autorizados**: añadir `map.wxlter.dev`.
7. Desplegar reglas:

```bash
npx firebase login
npx firebase deploy --only firestore:rules,storage --project map-wxlter-dev
```

## Desplegar en Vercel

1. Importar el repo en Vercel (framework: Vite, build `npm run build`, output `dist`, Node 24).
   No hacen falta variables de entorno: la config pública de Firebase está en `.env.production`.
2. `vercel.json` define las reescrituras (`/s/*` → `api/share-page`) y las funciones (`api/og.ts`, `api/share-page.ts`).
3. Dominio: añadir `map.wxlter.dev` y crear el `CNAME` que indique Vercel en el DNS de `wxlter.dev`.
