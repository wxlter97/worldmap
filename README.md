# Mapa · wxlter.

PWA para registrar países, territorios, regiones, ciudades y lugares visitados. Producción: `map.wxlter.dev`.

Stack: Vite + React + TypeScript · MapLibre GL · Firebase (Auth, Firestore offline, Storage) · Vercel.
Diseño: design system wxlter (`design_handoff_marca_wxlter`), tokens en `src/styles/tokens.css`.

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
pantalla de login: solo existe en el emulador.

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

- Una entrada por lugar en `users/{uid}/entries/{tipo:id}` con estado, fechas (varias), markdown, etiquetas, valoración, personas y 1 foto.
- Una ciudad, región o lugar con estado implica ese estado en su país.
- **Vivido** y **Visitado** cuentan para estadísticas; **Escala**, **Planeado** y **Quiero ir** no.
- % del país = área de las regiones visitadas / área total, salvo override manual en la entrada del país.
- **Viajes** (`users/{uid}/trips/{id}`): nombre + descripción. Cada rango de fechas de una entrada puede apuntar a un viaje
  (`dates[].tripId`); el itinerario, las fechas y los días del viaje se derivan de ahí. Borrar un viaje conserva las fechas.
- **Links de solo lectura**: `shares/{token}` → `{ uid, displayName }`. Con `users/{uid}.sharing.enabled = true` las reglas
  permiten leer el perfil, entradas, viajes y fotos de ese usuario sin sesión. Regenerar el link invalida el anterior;
  desactivarlo corta toda lectura pública. El perfil público no debe contener datos privados (no se guarda el correo).

## Configurar Firebase (una vez)

1. Crear el proyecto en la consola de Firebase.
2. **Authentication → Método de acceso → Correo electrónico/contraseña**: activar.
3. **Firestore Database → Crear base de datos** (modo producción; región cercana, p. ej. `us-east1`).
4. **Storage → Comenzar** (requiere plan Blaze).
5. **Configuración del proyecto → Tus apps → Web**: registrar la app y copiar el `firebaseConfig` a `.env.local` (con `VITE_USE_EMULATORS=false`).
6. **Authentication → Configuración → Dominios autorizados**: añadir `map.wxlter.dev`.
7. Desplegar reglas:

```bash
npx firebase login
npx firebase use --add        # elegir el proyecto
npx firebase deploy --only firestore:rules,storage
```

## Desplegar en Vercel

1. Importar el repo en Vercel (framework: Vite, build `npm run build`, output `dist`).
2. Variables de entorno: las `VITE_FIREBASE_*` de `.env.example`, y `VITE_USE_EMULATORS=false`.
3. Dominio: añadir `map.wxlter.dev` y crear el `CNAME` que indique Vercel en el DNS de `wxlter.dev`.
