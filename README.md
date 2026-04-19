# tazosdorados
PWA del equipo Tazos Dorados 40+
# 🟡⚾ Tazos Dorados

**App oficial del equipo de béisbol Tazos Dorados — Liga Veteranos 40+**

*"Somos edición limitada, coqueto"* 👑

[![Live](https://img.shields.io/badge/live-tazosdorados40ymas--sys.github.io-e5b94a?style=for-the-badge)](https://tazosdorados40ymas-sys.github.io/tazosdorados/)
[![PWA](https://img.shields.io/badge/PWA-installable-0b1622?style=for-the-badge)](https://tazosdorados40ymas-sys.github.io/tazosdorados/)
[![Version](https://img.shields.io/badge/version-v10-6ba96b?style=for-the-badge)](#)

---

## 📱 ¿Qué es esto?

Una **Progressive Web App (PWA)** construida para gestionar todo lo que necesita un equipo de béisbol amateur:

- 📅 **Calendario** de juegos programados, jugados y cancelados
- ⚾ **Captura de resultados** con scoreboard visual
- 📋 **Asistencia** por juego con 3 estados (jugó/avisó/pendiente)
- 💰 **Cobros automáticos** basados en reglas del equipo ($100 jugó / $50 avisó)
- 💎 **Contribuciones voluntarias** (públicas, anónimas o privadas)
- 🤝 **Vitrina de patrocinadores** con total aportado
- 💸 **Gastos por categoría** (campo, pelotas, liga, uniformes, otros)
- 📸 **Galería de fotos** por juego con lightbox fullscreen y compartir nativo
- 👥 **Roster** con foto, posiciones, mano de lanzar/batear

## 🛠️ Stack

- **Frontend:** HTML + JS vanilla (sin build step, sin frameworks)
- **Backend:** [Supabase](https://supabase.com) (Postgres + Auth + RLS)
- **Imágenes:** [Cloudinary](https://cloudinary.com) (upload, transforms, CDN)
- **Hosting:** GitHub Pages (static)
- **PWA:** Service Worker con estrategias network-first / cache-first

## 🎨 Identidad visual

| | |
|---|---|
| Colores | Navy `#0b1622` · Dorado `#e5b94a` · Crema `#f5ede0` |
| Fuentes | Bebas Neue (headers) · DM Sans (body) · Caveat (frases) · Kaushan Script (logo) |
| Inspiración | El Chikilín de la Patrulla Espiritual 🔥 |

## 📂 Estructura del repo

```
tazosdorados/
├── index.html                 ← UI + estilos
├── app.js                     ← lógica (auth, CRUD, PWA)
├── config.js                  ← credenciales Supabase/Cloudinary
├── sw.js                      ← Service Worker
├── manifest.webmanifest       ← config PWA
├── icon-*.png                 ← íconos (192, 512, maskable, apple-touch)
└── favicon-32.png
```

## 🚀 Cómo actualizar la app

1. Edita los archivos en GitHub directo (o clona el repo)
2. Bumpea la versión en 5 lugares:
   - `index.html`: `<meta name="app-version" content="X">`
   - `index.html`: los 4-5 `?v=X` en los `<link>` y `<script>`
   - `index.html`: `<div class="app-version">vX</div>`
   - `sw.js`: `const CACHE_VERSION = 'vX';`
3. Commit → GitHub Pages publica en 30-60 seg
4. Los usuarios con la app abierta verán el banner verde "Actualizar"

## 🧩 Arquitectura

### Base de datos (Supabase)

Tablas principales:
- `players` · roster del equipo
- `games` · calendario y resultados
- `attendance` · asistencia por jugador/juego (incluye aportación)
- `contribuciones` · voluntarias + patrocinadores
- `expenses` · gastos por categoría
- `photos` · URLs de Cloudinary por juego
- `tesoreros` · usuarios con permisos de admin

Vistas calculadas (refrescan en tiempo real):
- `v_team_balance` · saldo total del equipo
- `v_player_status` · deuda/crédito por jugador
- `v_season_record` · récord W-L-T
- `v_next_game` · próximo juego programado
- `v_expenses_by_category` · gastos agrupados
- `v_patrocinadores` · vitrina pública agregada
- `v_contribuciones_publicas` · lista con anónimos enmascarados

### Permisos (RLS)

- **Lectura:** pública para datos del equipo (roster, juegos, fotos públicas)
- **Escritura:** solo tesoreros registrados en la tabla `tesoreros`
- Función `is_tesorero()` verifica el uid de auth

## 📐 Reglas del equipo

- 💰 Si juegas, aportas **$100**
- 📲 Si no puedes y avisas, aportas **$50**
- ❓ Si no juegas y no avisas: pendiente, sin aportación
- 💸 El dinero cubre: liga · campo · pelotas · uniformes
- ✨ El excedente va al fondo de uniformes nuevos
- 💎 Las aportaciones voluntarias cubren deuda primero, excedente al fondo

## 👑 Acceso tesorero

El botón 🔒 en el header pide email + contraseña. Solo usuarios registrados en la tabla `tesoreros` (con permiso en Supabase Auth) pueden escribir.

Como tesorero puedes:
- Editar roster (agregar/desactivar jugadores)
- Crear/editar/eliminar juegos
- Capturar resultados y asistencia
- Registrar ingresos (voluntarias, patrocinadores) y gastos
- Subir/eliminar fotos

## 🤝 Créditos

Desarrollado con 💛 para los **Tazos Dorados 40+** de Zapopan por [@TazosDorados40ymas-sys](https://github.com/TazosDorados40ymas-sys).

*Construido iterando en pair-programming con Claude (Anthropic).*

---

**"Tazo al corriente, diamante en bruto"** ⚾✨
