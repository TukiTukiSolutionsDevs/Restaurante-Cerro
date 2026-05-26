# DESIGN.md — Restaurante Cerro

> Sistema de diseño completo para una app multi-rol de restaurante peruano de menús diarios. Este documento es la fuente única de verdad para identidad visual, componentes, patrones y micro-interacciones. Cualquier rediseño debe respetar estos tokens y patrones.

---

## 0. Cómo usar este documento

- **Tokens** (colores, espaciado, tipografía) se traducen a CSS variables y a `tailwind.config.ts`.
- **Componentes** se construyen sobre shadcn/ui (ya instalado) — no inventar componentes nuevos si shadcn tiene equivalente.
- **Patrones por rol** describen layout y comportamiento específicos de cada vista; sobre-escribir defaults globales si entra en conflicto.
- **Stack ya decidido**: Next.js 16 App Router + Tailwind v4 + shadcn/ui + Radix primitives + Lucide icons + framer-motion (opcional para motion).

---

## 1. Identidad de marca

### 1.1 Nombre y esencia

**Restaurante Cerro.** Un restaurante de menús diarios en Perú. La marca evoca:

- **Comida casera** — calidez, tradición, lo conocido.
- **Servicio rápido** — el mediodía peruano es intenso; la app debe sentirse ágil.
- **Confianza local** — pago en efectivo o Yape, sin trucos, sin pasarelas extrañas.
- **Sabor andino** — "Cerro" sugiere altura, raíz, terruño.

### 1.2 Tono de voz

- **Cercano pero respetuoso.** "Arma tu pedido" — sí. "¡Pídelo ya!" — no.
- **Directo.** Frases cortas. Verbos en imperativo cuando hay que actuar.
- **Sin anglicismos forzados.** "Pedido" (no "order"), "Mesa" (no "table"), "Comanda" (no "ticket"). Pero "QR" sí, porque es universal.
- **Peruano natural.** Usar "mozo" (no "mesero"), "para llevar" (no "takeaway" en UI). "Cancha" para sala/local cuando aplique.
- **Cero jerga técnica.** El cliente nunca ve "session expired", ve "Tu QR venció — habla con un mozo".

### 1.3 Tagline implícita

> "Tu menú del día, sin colas en la caja."

No es un slogan publicitario; es la promesa silenciosa que cada pantalla debe cumplir.

---

## 2. Paleta de colores

### 2.1 Filosofía

El menú peruano es **cálido**: amarillos de ají, rojos de rocoto, verdes de huacatay, marrón tierra. La paleta debe **evocar comida casera sin parecer un mercado**. Fondo claro y aireado para el cliente; oscuro y de alto contraste para cocina (TV); neutro profesional para cajero/admin.

### 2.2 Colores primarios

| Token | Hex | Uso |
|---|---|---|
| `--brand-50`  | `#FFF8EC` | Fondo de cards, hover sutil |
| `--brand-100` | `#FFEDC9` | Backgrounds destacados |
| `--brand-200` | `#FFD992` | Hover en botones secundarios |
| `--brand-300` | `#FFC256` | Borde de elementos destacados |
| `--brand-400` | `#F5A623` | Acción secundaria |
| `--brand-500` | `#D97706` | **Color de marca principal** (ají amarillo tostado) |
| `--brand-600` | `#B45309` | Hover de marca |
| `--brand-700` | `#92400E` | Activo / pressed |
| `--brand-800` | `#78350F` | Texto sobre amarillo |
| `--brand-900` | `#451A03` | Headings cuando necesitan calidez |

### 2.3 Neutros (escala de tierra cálida, no gris frío)

| Token | Hex | Uso |
|---|---|---|
| `--neutral-0`   | `#FFFFFF` | Fondos primarios |
| `--neutral-50`  | `#FAF9F7` | Fondo de página (calidez sutil) |
| `--neutral-100` | `#F5F3EF` | Cards subtle |
| `--neutral-200` | `#E7E3DC` | Borders sutiles |
| `--neutral-300` | `#D4CFC4` | Borders normales |
| `--neutral-400` | `#A19A8B` | Texto deshabilitado, placeholders |
| `--neutral-500` | `#6B6557` | Texto secundario |
| `--neutral-600` | `#4A4639` | Texto cuerpo |
| `--neutral-700` | `#332F25` | Texto fuerte |
| `--neutral-800` | `#1E1B14` | Headings |
| `--neutral-900` | `#0E0C08` | Solo para máximo contraste / TV cocina |

> ⚠ **No usar `slate-*` ni `gray-*` puros.** Romperán la calidez de la marca.

### 2.4 Colores semánticos

| Token | Hex | Uso |
|---|---|---|
| `--success-500` | `#16A34A` | Confirmaciones, "Entregado", botón principal de cajero |
| `--success-600` | `#15803D` | Hover |
| `--success-50`  | `#F0FDF4` | Backgrounds de éxito |
| `--warning-500` | `#F59E0B` | Estado intermedio: "en cocina", "esperando" |
| `--warning-50`  | `#FFFBEB` | Background |
| `--danger-500`  | `#DC2626` | Error, vencido, ocupado |
| `--danger-600`  | `#B91C1C` | Hover destructivo |
| `--danger-50`   | `#FEF2F2` | Background |
| `--info-500`    | `#0EA5E9` | Estado "pagado, esperando cocina" |
| `--info-50`     | `#F0F9FF` | Background |

### 2.5 Estados de mesa (críticos, deben ser inconfundibles)

| Estado | Color de fondo | Borde | Texto |
|---|---|---|---|
| `free` | `--success-50` `#F0FDF4` | `--success-500` | `--success-700` |
| `tentative` (reservada con QR) | `--warning-50` | `--warning-500` | `--warning-700` |
| `occupied` (pago confirmado) | `--danger-50` | `--danger-500` | `--danger-700` |
| `in_active_group` | `#EEF2FF` | `#6366F1` | `#3730A3` |
| `inactive` | `--neutral-100` | `--neutral-300` | `--neutral-400` (tachado) |

### 2.6 Estados de pedido

| Estado | Badge fondo | Badge texto | Indicador |
|---|---|---|---|
| `pending` | `--neutral-100` | `--neutral-700` | ⏳ |
| `paid` | `--info-50` | `--info-500` | 💵 |
| `in_kitchen` | `--warning-50` | `--warning-600` | 🔥 (o icono Lucide `flame`) |
| `delivered` | `--success-50` | `--success-600` | ✓ |
| `cancelled` | `--danger-50` | `--danger-500` | ✗ |

> Emojis solo en mockups o documentación. En código real usar **Lucide icons**: `Clock`, `Banknote`, `Flame`, `Check`, `X`.

### 2.7 Tema oscuro (solo para cocina TV)

Cocina opera en `bg-neutral-900` permanente. Las tarjetas usan:
- Fondo card: `#1C1A14`
- Borde: `#3A3528`
- Texto principal: `#FFFAF0`
- Acentos por timer: usar `--success-400`, `--warning-400`, `--danger-400` (versiones más brillantes para legibilidad a 3m).

---

## 3. Tipografía

### 3.1 Familias

| Rol | Fuente | Pesos | Fallback |
|---|---|---|---|
| **Display** (headings grandes) | **Plus Jakarta Sans** | 600, 700, 800 | system-ui |
| **Cuerpo** (UI, párrafos) | **Inter** | 400, 500, 600 | system-ui |
| **Mono** (códigos cortos, montos) | **JetBrains Mono** | 500, 700 | ui-monospace |
| **Numbers** (cuando precio o código) | **Inter Tabular** (`font-feature-settings: "tnum"`) | 600, 700 | — |

Cargar via `next/font/google` con `display: swap` y subsetting `latin-ext`.

### 3.2 Escala tipográfica

| Token | Tamaño | Line-height | Uso |
|---|---|---|---|
| `text-xs`   | 12px | 16px | metadatos, badges chicos |
| `text-sm`   | 14px | 20px | tablas, labels, descripciones |
| `text-base` | 16px | 24px | cuerpo |
| `text-lg`   | 18px | 28px | subheadings |
| `text-xl`   | 20px | 28px | cards titles |
| `text-2xl`  | 24px | 32px | section headings |
| `text-3xl`  | 30px | 36px | page titles |
| `text-4xl`  | 36px | 40px | hero headings cliente |
| `text-5xl`  | 48px | 1.0 | montos grandes (cajero, cliente ticket) |
| `text-7xl`  | 72px | 1.0 | short_code en pantalla cocina y cliente ticket |
| `text-9xl`  | 128px | 1.0 | short_code en TV cocina (vista grande) |

### 3.3 Reglas de uso

- **Display** solo para `text-3xl` y superiores.
- **Mono** para: short_code, totales en `/caja`, IDs en `/admin/audit`, montos en `/pedido/[token]`.
- **Tabular numbers** activado en TODAS las tablas con montos (`font-variant-numeric: tabular-nums`).
- **Tracking**: `tracking-tight` (-0.02em) en displays; `tracking-wider` (0.05em) en short_codes.
- Nunca italic. La marca es directa, no decorativa.

---

## 4. Espaciado y layout

### 4.1 Unidad base

`1 unit = 4px`. Toda la escala es múltiplo: 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 128.

### 4.2 Breakpoints

| Breakpoint | Ancho | Target |
|---|---|---|
| (default) | < 640px | Móvil cliente (mayoría) |
| `sm:` | ≥ 640px | Móvil grande / phablet |
| `md:` | ≥ 768px | Tablet (mozo) |
| `lg:` | ≥ 1024px | Laptop/PC (caja, admin) |
| `xl:` | ≥ 1280px | Desktop estándar |
| `2xl:` | ≥ 1536px | Monitores grandes / TV cocina |

### 4.3 Containers por rol

- **Cliente** (móvil): `max-w-md` con `px-4`, fondo `--neutral-50`.
- **Mozo** (tablet): `max-w-7xl` con `px-6`, fondo `--neutral-50`.
- **Cajero** (PC): full-width grid 60/40, `px-8 py-6`, fondo `--neutral-100`.
- **Admin** (PC): sidebar fijo 240px + contenido `max-w-6xl px-8 py-8`.
- **Cocina** (TV): full viewport, `bg-neutral-900`, padding 32px (no max-width).

### 4.4 Radius (corner rounding)

| Token | Radio | Uso |
|---|---|---|
| `rounded-sm` | 4px | tags, badges |
| `rounded-md` | 8px | inputs, small buttons |
| `rounded-lg` | 12px | cards, dialogs, buttons principales |
| `rounded-xl` | 16px | sheets, large cards |
| `rounded-2xl` | 24px | cliente menu item cards, ticket cliente |
| `rounded-full` | ∞ | pin pad keys, avatars |

> **No mezclar.** Una vista usa un solo nivel de radio para los elementos principales.

### 4.5 Shadows

| Token | Valor | Uso |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(28,24,16,0.06)` | inputs, separators sutiles |
| `shadow` | `0 2px 4px rgba(28,24,16,0.08)` | cards en reposo |
| `shadow-md` | `0 4px 12px rgba(28,24,16,0.10)` | cards hover, popovers |
| `shadow-lg` | `0 8px 24px rgba(28,24,16,0.14)` | dialogs, sheets |
| `shadow-xl` | `0 16px 48px rgba(28,24,16,0.18)` | confirm modal del cajero |

Shadows usan tinte cálido (RGB de `--neutral-800`), nunca negro puro.

---

## 5. Iconografía

### 5.1 Librería

**Lucide React** (`lucide-react`, ya instalable). Usar SIEMPRE strokeWidth=2 (default). Tamaño base 20px, scale 16/20/24/32.

### 5.2 Icon set por dominio

| Concepto | Lucide icon |
|---|---|
| Menú del día | `UtensilsCrossed` |
| Carrito / pedido | `ShoppingBag` |
| Mesa | `LayoutGrid` |
| Para llevar | `Bag` o `PackageOpen` |
| QR | `QrCode` |
| Caja registradora | `Receipt` o `Banknote` |
| Yape | (custom SVG, ver §5.3) |
| Efectivo | `Banknote` |
| Cocina | `ChefHat` |
| Mozo | `HandPlatter` |
| Admin | `ShieldCheck` |
| Tiempo / timer | `Clock` |
| Disponible / agotado | `Check` / `Ban` |
| Tupper | `Package` |
| Editar / eliminar | `Pencil` / `Trash2` |
| Imprimir | `Printer` |
| Reportes | `BarChart3` |

### 5.3 Logos de pagos

**Yape** y **Plin** no están en Lucide. Crear `src/components/icons/` con SVGs propios:
- `<YapeIcon />` — colores oficiales (`#742581` morado Yape).
- `<EfectivoIcon />` — usa `Banknote` de Lucide tintado en `--success-600`.

No usar marcas registradas en otros lugares (logos de KFC, etc).

---

## 6. Componentes (mapeados a shadcn)

> Todos parten de shadcn defaults. Las modificaciones se documentan abajo.

### 6.1 Button

| Variant | Cuándo usar |
|---|---|
| `primary` (default) | Acción principal de la vista (1 por vista) |
| `secondary` | Acciones secundarias |
| `outline` | Cancel, "ver más", filtros |
| `ghost` | Acciones en barras superiores |
| `destructive` | Cancelar pedido, desactivar mesa |
| `link` | "Volver", referencias inline |

Sizes:
- `sm` — 32px alto (tablas)
- `default` — 40px alto (general)
- `lg` — 48px alto (cliente principal)
- `xl` — 64px alto (cajero "Confirmar", mozo "Entregado")

Override del `lg` y `xl`: usar `font-display font-semibold tracking-tight`.

### 6.2 Input

- Border `--neutral-300`, focus `--brand-500` con anillo de 3px en `--brand-500/20`.
- Placeholder en `--neutral-400`.
- Altura mínima 40px (general), 48px (mozo/cliente).
- Errores: borde `--danger-500` con texto helper rojo abajo.

### 6.3 Card

- Fondo `--neutral-0`.
- Border `--neutral-200` 1px.
- `rounded-lg`.
- `shadow` en reposo, `shadow-md` en hover si es interactivo.
- Padding interno: 16px (`sm`), 24px (`default`), 32px (`lg`).

### 6.4 Badge

- Mapear cada estado del §2.6 a un badge. Texto en `--font-semibold text-xs uppercase tracking-wider`.
- Padding `px-2 py-0.5`. `rounded-sm`.

### 6.5 Dialog / Sheet

- Dialog: `rounded-xl`, `shadow-xl`, max-w 480px default, overlay `bg-neutral-900/50` con `backdrop-blur-sm`.
- Sheet: side-drawer desde la derecha en PC, desde abajo en móvil. Maneja "Detalle de mesa", "Editar plato", "Editar staff".

### 6.6 Toast (sonner)

- Variants: `success`, `error`, `info`, `warning`.
- Posición: `top-right` en PC, `bottom-center` en móvil/tablet.
- Auto-dismiss 4s (excepto error: 8s o requerir click).
- Acción opcional ("Deshacer" en cajero).

### 6.7 Tabs

- Underline style (no pills). Línea inferior `--brand-500` 2px.
- Texto activo `--neutral-800 font-semibold`; inactivo `--neutral-500`.

### 6.8 PinPad (custom)

- 3 columnas × 4 filas: `[1,2,3 / 4,5,6 / 7,8,9 / ⌫,0,Enter]`.
- Cada botón: 64×64 px en tablet/PC, 72×72 px en touch.
- `rounded-full` o `rounded-xl` (consistente).
- Estado pressed: scale 0.95 con transition 80ms.
- Dots de display: 16px círculos con gap 12px; llenos = `--neutral-800`, vacíos = `--neutral-300`.

---

## 7. Patrones por rol

### 7.1 Cliente (móvil) — `/` y `/pedido/[token]`

**Filosofía:** sentirse como un menú de papel pero mejor. Imagen mental: estás sentado, alguien te muestra "hoy tenemos...".

**Landing `/`:**
- Hero corto (no banner gigante): "Menú de hoy — sábado 24 de mayo" en `text-2xl`, fondo `--brand-50`, padding 24px.
- Tabs por categoría: Entradas / Segundos / Bebidas / Postres. Sticky al hacer scroll.
- Item card: nombre `text-lg font-semibold`, descripción `text-sm text-neutral-500`, badge "Agotado" si no disponible (gris tachado), botón "+ Agregar" `--brand-500` redondo (`Plus` icon).
- Cart bar flotante (fixed bottom): chip con # items + total + "Ver pedido →". Aparece cuando hay items.

**Cart sheet (sube desde abajo, móvil):**
- Lista de items con +/- y precio.
- Selector tipo: "Para comer aquí" / "Para llevar" — dos pills grandes (h-12) lado a lado.
- Si "para llevar": switch "Con tupper +S/2 (o +S/1)" con descripción contextual.
- Si "para comer aquí": grid de mesas libres (usa `<TableGrid />` variant="customer"). Sólo libres son clickeables.
- Total grande `text-3xl font-mono font-bold` en `--neutral-800`.
- Botón `xl` "Pedir → ahora pagas en caja" en `--brand-500`.

**Ticket `/pedido/[token]`:**
- Centro vertical. Tarjeta cliente. Padding generoso (32px).
- Short_code GIGANTE: `text-7xl font-mono font-bold tracking-wider`, centrado.
- QR debajo, 240×240px, marco blanco con 16px de padding, sutilmente elevado (`shadow-md`).
- Bullet de items compacto.
- Total `text-2xl font-mono font-bold`.
- Status badge live (suscrito vía SSE):
  - `pending` → "💵 Muestra esto en caja para pagar" con icono `Banknote` y fondo `--info-50`.
  - `in_kitchen` → "🔥 En cocina, paciencia" con icono `Flame` y fondo `--warning-50`, animación sutil de pulso.
  - `delivered` → "✓ Listo, ya te lo lleva el mozo" con icono `Check` y fondo `--success-50`.
  - `cancelled` → "✗ Pedido cancelado" rojo.
- Si QR vencido: banner top rojo "Tu QR venció — habla con un mozo".

**Tono cliente:** segunda persona, suave. "Tu pedido", "Tu código".

### 7.2 Cajero (PC) — `/caja`

**Filosofía:** velocidad. El cajero hace 60 pedidos en 90 min; cada segundo cuenta. Layout denso pero claro.

**Layout (grid 60/40 desktop):**
- **Izquierda 60%:**
  - Input grande arriba: "Ingresa código o escanea QR" — autofocus, `text-3xl font-mono`. Botón "📷 Escanear" al lado.
  - Cuando hay pedido cargado:
    - Total **enorme** `text-5xl font-mono font-bold` en `--neutral-900`.
    - Mesa o "PARA LLEVAR" badge grande arriba.
    - Lista compacta de items con cantidades y precios alineados a la derecha.
    - Banner rojo si QR vencido: "QR vencido. Confirma con cliente antes de cobrar."
    - Pill selector "Efectivo" / "Yape" (h-12), hotkeys 1 y 2.
    - Si Yape: input opcional "N° operación" debajo.
    - Botón **XL** verde "Confirmar cobro" (h-16, text-xl, `--success-500`). Hotkey Enter.
    - Link sutil "Cancelar pedido" abajo con icono `X`.
- **Derecha 40%:**
  - Widget arriba: cuenta hoy + revenue (cash / yape) en cards horizontales.
  - "Pendientes" header con counter.
  - Lista virtualizada: cada row = `short_code (mono bold) · mesa · S/total · tiempo`. Hover en `--brand-50`. Click carga en panel izquierdo.
  - Sección plegable "Confirmados recientes" con botón "Deshacer" pequeño en cada uno (visible solo si <2min).
- **Sonido:** beep corto cuando llega un nuevo pendiente. Toggle mute en widget de stats.

**Atajos visibles** en footer pequeño: `Enter` buscar/confirmar · `1` efectivo · `2` Yape · `Esc` limpiar.

**Toast post-confirm:** "✓ Enviado a cocina" verde, 3s, con opción "Deshacer".

### 7.3 Mozo (tablet) — `/mozo`

**Filosofía:** El mozo se mueve con tablet en mano. Necesita ver de un vistazo, tocar grande, sin dudas.

**Layout:**
- Header sticky con tabs grandes (h-14): **Pedidos activos** · **Mesas** · botón discreto logout esquina.
- Tab default: **Pedidos activos**.

**Card de pedido activo:**
- 2 columnas portrait / 3 landscape.
- Cada card es **alto** (min-h-200px):
  - short_code `text-5xl font-mono` arriba a la izquierda.
  - Mesa code chip a la derecha (`--brand-100`, `text-lg`) o "PARA LLEVAR" verde claro.
  - Status badge: `paid` (azul "Esperando cocina") o `in_kitchen` (ámbar "🔥 En cocina"). Si `in_kitchen` con >8min: animación de pulso suave + "Listo para llevar".
  - Items compactos abajo.
  - Botón **XL verde** "Entregado" (h-16) ocupa todo el ancho.
- Empty state: ilustración mínima `ChefHat` 80px + "No hay pedidos activos. Tómate un respiro.".

**Tab Mesas:**
- `<TableGrid variant="waiter" />` grid 6×5.
- Cada mesa: card 80×80, código + capacidad chico, color de estado (§2.5).
- Long-press → sheet lateral con detalle del pedido activo (si hay) + acciones: Liberar mesa (requiere razón ≥5 chars).
- Botón flotante "Unir mesas" cuando hay ≥2 free seleccionadas en modo unión.

**Toast en errores 409:** "Ya fue entregado por otro mozo" con fade.

### 7.4 Cocina (TV) — `/cocina`

**Filosofía:** Pantalla de gran formato a 3 metros de distancia. Cero interacción. Solo INFORMACIÓN GIGANTE.

**Layout:**
- Full viewport `bg-neutral-900`.
- Header mínimo top-left: "Cocina en vivo" `text-sm text-neutral-400` + dot verde de conexión.
- Header mínimo top-right: mute toggle.
- Grid de tickets:
  - 2 cols < 1280, 3 cols < 1920, 4 cols ≥ 1920.
  - Gap 24px.
- Cada **ticket card**:
  - Fondo `#1C1A14`, border `#3A3528` 1px, `rounded-lg`, padding 24px.
  - short_code `text-9xl font-mono font-bold` (en TV 4K) o `text-7xl` mínimo. Color `--brand-300`.
  - Mesa code badge grande abajo del code: `#FFE9B8` fondo, `--neutral-800` texto, `text-2xl font-bold px-3 py-1 rounded`.
  - O "PARA LLEVAR" badge rojo claro si takeaway.
  - Icono `Package` si `withTupper`.
  - Items en `text-2xl text-neutral-50`, grouped por categoría (`text-sm text-neutral-400` como subhead).
  - Timer chip en esquina inferior derecha:
    - <5min: `--success-400` fondo + texto `--neutral-900`.
    - 5-10min: `--warning-400` fondo.
    - >10min: `--danger-400` fondo + pulse animation.
- Si tickets > N que caben en pantalla: paginación auto-flip cada 10s con indicador `Página 1/2` abajo.
- Si sin tickets: "Esperando pedidos…" centrado, `text-3xl text-neutral-500`.
- Si disconnect: overlay semi-transparente "Reconectando…" con spinner.

**Audio:** chime corto cuando llega nuevo ticket (configurable).

### 7.5 Admin (PC) — `/admin/*`

**Filosofía:** Profesional, organizado, control total. Como un panel de banco pero con calidez.

**Layout global:**
- Sidebar fijo 240px a la izquierda en `--neutral-100` con border-right `--neutral-200`.
- Logo "Cerro" arriba (text + icon `Mountain` de Lucide en `--brand-500`).
- Nav items con `Home`, `UtensilsCrossed`, `LayoutGrid`, `Users`, `BarChart3`, `ShieldCheck`.
- Item activo: fondo `--brand-50`, borde-left 3px `--brand-500`, texto `--brand-700`.
- Footer sidebar: avatar admin + "Cerrar sesión".
- Contenido: `max-w-6xl px-8 py-8`, fondo `--neutral-0`.

**Dashboard `/admin`:**
- Top: badge gran estado del día ("DÍA ABIERTO" verde o "DÍA CERRADO" gris).
- 4 KPI cards en grid:
  - Ingresos hoy (con split cash/yape en small).
  - Pedidos hoy (con split estado).
  - Mesas ocupadas (X / 30).
  - Tiempo promedio cocina.
- 5 cards de navegación grandes a las secciones.

**`/admin/menu`:**
- Top card: Status del día + botones "Abrir día" (verde XL) / "Cerrar día" (outline destructive).
- Card "Precios del combo" con 6 inputs en grid 3×2 (S/13, S/15, +S/2, +S/1, S/parcial_entrada, S/parcial_segundo).
- Tabs por categoría con tabla de items:
  - Columnas: nombre · descripción (truncate) · disponible (Switch) · precio (solo bebidas/postres) · acciones (Pencil, Trash2).
  - Switch "Disponible" con animación, label "Disponible" / "Se acabó".
  - Botón "+ Agregar plato" arriba a la derecha de cada tab.
- Edit dialog: form con name, description, sort_order, price (condicional).

**`/admin/tables`:**
- Top: botón "+ Crear mesa" y "Crear M01–M30 (grilla 5×6)" para setup inicial.
- Grid 5×6 con cards de mesa interactivas.
- Click mesa → sheet derecho con form de edición + acciones Liberar / Desactivar.

**`/admin/staff`:**
- Tabla:
  - displayName · role (badge) · lastSeenAt (relativo: "hace 5 min") · sessions activos · activo · acciones (3-dot menu).
- Botón "+ Crear usuario" arriba.
- Dialog crear: form con displayName, role select, pin (campo password con eye toggle), confirm pin. Validación inline si PIN inseguro: "PIN inseguro: no uses secuencias ni todos iguales".
- Acciones por row: Editar, Restablecer PIN, Cerrar sesiones, Desactivar (rojo).

**`/admin/reports/daily`:**
- Top: date picker (default hoy).
- Si sin actividad: empty state grande "Sin actividad en este día" + ilustración `Calendar`.
- KPI widgets como dashboard.
- Tabla "Top 5 platos" con quantity bars.
- Tabla "Cancelaciones" con razones.
- Botón "Exportar CSV" en esquina superior derecha.

**`/admin/audit`:**
- Filters en card superior: from / to / actorType select / action input.
- Tabla paginada (20 por página):
  - timestamp (mono) · actor (avatar + name) · action (badge) · entity / entityId · botón "Ver payload" → dialog JSON pretty-printed.
- Filtros guardados en URL params.

---

## 8. Estados y empty states

### 8.1 Loading

- Skeleton con animación `pulse` 1.5s en `--neutral-200`.
- Para datos críticos (cargar pedido): `<Loader2>` de Lucide girando + texto "Cargando…".
- Nunca dejar pantalla en blanco más de 200ms.

### 8.2 Empty

| Pantalla | Empty copy | Ilustración (Lucide) |
|---|---|---|
| Cocina sin tickets | "Esperando pedidos…" | `ChefHat` 80px en neutral-500 |
| Mozo sin pedidos activos | "No hay pedidos activos. Tómate un respiro." | `HandPlatter` 80px |
| Cliente menú cerrado | "Hoy ya cerramos. Regresa mañana." | `Moon` 64px en `--neutral-400` |
| Admin reports sin actividad | "Sin actividad en este día" | `Calendar` 64px |
| Admin audit sin resultados | "Ningún evento coincide con tus filtros" | `Search` 64px |
| Admin staff vacío | "Aún no creaste usuarios. Empieza por el cajero." | `Users` 64px + CTA "+ Crear usuario" |

### 8.3 Error

- Errores de validación inline (debajo del input, rojo).
- Errores 409 / 429 / 500: toast rojo con mensaje específico + acción "Reintentar" cuando aplica.
- Pantalla error completa solo para 404 y crash. Usar `<ErrorBoundary>`.

### 8.4 Disconnected (SSE)

- Banner top de la pantalla, amarillo: "Reconectando…" con spinner.
- Cuando reconecta: cambia a verde 2s "Conectado de nuevo" y desaparece.

---

## 9. Motion / micro-interacciones

### 9.1 Principios

- **Suave, no exagerado.** Easing `cubic-bezier(0.4, 0, 0.2, 1)` (default Tailwind).
- **Rápido en cajero/cocina** (≤150ms). Lento en cliente/admin (200-300ms).
- **Nunca rebotes/springs cómicos.** Es comida, no un juego.

### 9.2 Tokens de duración

| Token | ms | Uso |
|---|---|---|
| `duration-fast` | 80 | press, micro-feedback |
| `duration` | 150 | hover, fade |
| `duration-md` | 250 | sheet open, dialog |
| `duration-slow` | 400 | celebración (pedido enviado) |

### 9.3 Animaciones clave

- **Nuevo ticket en cocina:** fade in + scale 0.95 → 1.0 + flash sutil borde `--brand-300` 600ms.
- **Pedido entregado (mozo):** card slide-up + fade out 250ms.
- **Confirmar cobro (cajero):** botón → check icon brevemente → toast "Enviado a cocina".
- **Cambio de estado en cliente ticket:** badge cross-fade 150ms + emoji subtle bounce 1 vez.
- **Timer cocina cambia color:** transition 400ms entre estados.

### 9.4 No animar

- Cambios de estado de mesas en el floor map: instantáneo (claridad > estética).
- Carga de listas: instantáneo (con skeleton previo).

---

## 10. Accesibilidad

- **Contraste mínimo:** WCAG AA en TODO el cuerpo (4.5:1). AAA (7:1) en cocina TV y en montos críticos.
- Todos los inputs tienen `<label>` asociado o `aria-label`.
- Todos los íconos-botón tienen `aria-label` en español.
- Focus visible: ring de 3px `--brand-500/30` en todos los interactivos.
- Soporte `prefers-reduced-motion`: deshabilitar animaciones non-essentials.
- Tabbing order lógico. Botón principal de cada vista debe ser alcanzable en ≤5 tabs desde el load.
- Cliente: zoom hasta 200% sin romper layout.
- Cocina: no depende de color únicamente — siempre código + icono + texto.

---

## 11. Tono de copy: ejemplos do/don't

| Contexto | ✅ Do | ❌ Don't |
|---|---|---|
| Cliente arma pedido | "Arma tu pedido" | "¡Empieza ya tu orden!" |
| QR vencido | "Tu QR venció — habla con un mozo" | "Session token expired" |
| Cajero confirma | "Confirmar cobro" | "Procesar transacción" |
| Sin items disponibles | "Se acabó este plato" | "Item out of stock" |
| Día cerrado | "Hoy ya cerramos, regresa mañana" | "El restaurante está cerrado actualmente" |
| Login error | "PIN incorrecto. Te quedan 3 intentos." | "Authentication failed" |
| Mozo error 409 | "Ya fue entregado por otro mozo" | "Conflict: order already delivered" |

---

## 12. Sistema de spacing aplicado (cheat sheet)

| Patrón | Padding | Gap |
|---|---|---|
| Card section | `p-6` | `gap-4` |
| Form group | `space-y-4` | label-input `gap-1.5` |
| Table cell | `px-4 py-3` | — |
| Sidebar nav item | `px-4 py-2.5` | `gap-3` icon-text |
| Hero section | `py-12 px-6` | — |
| Cliente cart sheet | `p-6 pb-32` (espacio para CTA fijo) | `gap-3` items |
| Cocina ticket card | `p-6` | `gap-3` items dentro |

---

## 13. Logo y mark

**Cerro** = montaña. Logo provisional:

- **Wordmark**: "Cerro" en Plus Jakarta Sans 800, tracking-tight, en `--brand-700`.
- **Símbolo**: triángulo + triangulito (cerro pequeño detrás), stroke 2px, `--brand-500`.
- Combinado horizontal: símbolo + wordmark con gap 8px.
- Versión monocromática para fondos oscuros: todo en `--brand-300`.

> El logo definitivo lo provee el cliente; mientras tanto, esta representación es coherente.

---

## 14. Checklist para cualquier nueva pantalla

Antes de mergear cualquier rediseño, verificar:

- [ ] Usa solo tokens documentados (no hex sueltos).
- [ ] Respeta los breakpoints del rol.
- [ ] Tiene estados: loading, empty, error, success.
- [ ] Copy en español de Perú (revisar tabla §11).
- [ ] Focus visible en todos los interactivos.
- [ ] Contraste cumple AA (AAA en cocina y montos).
- [ ] Touch targets ≥44px (cliente), ≥48px (mozo), ≥56px en "Entregado"/"Confirmar".
- [ ] Iconos tienen `aria-label`.
- [ ] Si tiene realtime, muestra estado de conexión (SSE banner).
- [ ] Tipografía respeta jerarquía (Display solo en headings grandes).
- [ ] No usa `gray-*` o `slate-*` puros (usar `--neutral-*` cálidos).
- [ ] Motion respeta `prefers-reduced-motion`.

---

## 15. Roadmap visual deferido

Cosas que el sistema soporta pero la primera iteración no implementa:

- Fotos de platos (sólo texto en MVP). Cuando se agreguen: aspect-ratio 4:3, `rounded-lg`, lazy-load.
- Animación de "preparando" en cliente ticket: posible Lottie pequeño.
- Dark mode para roles no-cocina: arquitectura ya está, sólo falta agregar `dark:` variants.
- Branding final: logo, ilustraciones custom, fotografía de comida.

---

**Fin del DESIGN.md.** Cualquier agente de diseño que opere sobre esta app debe leer este documento como contexto previo y respetarlo. Si encuentra contradicciones, abrir una propuesta antes de modificar tokens.
