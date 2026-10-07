# Entrega 1 — Logos oficiales de los canales: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donde la interfaz muestra "TotalPass" como etiqueta, insignia, título, encabezado o entrada de menú, aparece el logo oficial; y queda un catálogo de canales listo para Fitpass.

**Architecture:** Un catálogo puro `frontend/src/lib/canales.ts` (claves iguales a `bookings.channel`, colores, rutas de logo, función que decide qué archivo y tamaño usar) probado con un script `tsx`. Un componente `ChannelLogo` que solo pinta lo que el catálogo decide, y `PlanLabel` para nombres de plan interno ("Totalpass"). Luego se reemplaza el texto en cada pantalla, agrupado por zona.

**Tech Stack:** React 18 + Vite + TypeScript (tsconfig no estricto), Tailwind, shadcn/ui (`Badge` renderiza `<div>`), pruebas `tsx` + `node:assert` en `frontend/scripts/`, Playwright en `frontend/e2e/`.

**Spec:** `docs/superpowers/specs/2026-10-07-calendario-recepcion-design.md` (sección "Entrega 1 — Logos de canales").

## Global Constraints

- Worktree `/Users/saidromero/Desktop/Casa She/casa-she-entrega-1`, rama `feat/logos-canales` desde `origin/main`. Nunca en `main`.
- Commits y PR en español; terminar commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git add` explícito por archivo.
- Regla de la spec: en **etiquetas, insignias, títulos, encabezados de columna y menú** va el logo. Dentro de **frases largas** (avisos/toasts, textos de ayuda, placeholders, `title`/`aria-label`, aviso de privacidad, reportes) el nombre se queda escrito.
- Archivos de marca, copiados tal cual (no se recolorean ni se editan) desde `/Users/saidromero/Desktop/Casa She/casa-she-calendario/docs/superpowers/assets/calendario-recepcion/`:
  - `totalpass-claro.svg` (sha256 `ca7858c35a7e0daab509cfa04b16a4cb82bab8b2947a9f36bb8424d9f3505977`)
  - `totalpass-oscuro.svg` (sha256 `e75b0cf6387bff95f29a4b1b2eb02a1001ac004019010d3d29beb791369ea1bc`)
  - `fitpass.png` (el recortado, 291×87)
- Colores de canal: TotalPass punto `#26D07C`, anillo `#0F7A45`; Fitpass punto `#5A8AD0`, anillo `#2F5BA8`. Nunca como color de texto.
- Alto mínimo del logo: 8 px. Sin recolorear, estirar ni sombras.
- La app no tiene modo oscuro activo: todo es fondo claro salvo la barra lateral del admin (`bg-balance-dark` `#16261A`).
- `wellhub` no entra al catálogo.
- No tocar la pastilla "TP n" de la tarjeta del calendario (`ClassEventCard`): la Entrega 2 la reemplaza por los puntos de lugar.

## Review Focus

- Logo de TotalPass sobre la barra lateral oscura: debe usarse la versión oscura (PASS blanco), si no "PASS" desaparece. Cubierto en Task 1 (`logoDeCanal` con `fondo: 'oscuro'`) y Task 2 (la entrada de menú pasa `fondo="oscuro"`).
- Fitpass sobre fondo oscuro no tiene versión oscura: debe ir sobre pastilla blanca. Cubierto en Task 1 (`pastilla: true`).
- Nombres de plan escritos de muchas formas ("Totalpass", "Socias TOTAL PASS", "FitPass Mensual") y vacíos o nulos: detectar sin romper. Cubierto en Task 1 (`canalDePlan`).
- Una socia de TotalPass que además tenga el plan interno "Totalpass" no debe mostrar el logo dos veces en la misma fila. Cubierto en Task 3 (condición explícita) y verificado en revisión.
- Lectores de pantalla: el logo es una imagen con `alt` = nombre del canal, así que el enlace del menú y las etiquetas siguen teniendo nombre accesible. Cubierto en Task 5 (Playwright busca `role=img name=TotalPass`).

---

### Task 1: Catálogo de canales, `ChannelLogo` y `PlanLabel`

**Files:**
- Create: `frontend/public/brands/totalpass-claro.svg`, `frontend/public/brands/totalpass-oscuro.svg`, `frontend/public/brands/fitpass.png` (copias)
- Create: `frontend/src/lib/canales.ts`
- Create: `frontend/src/components/brands/ChannelLogo.tsx`
- Create: `frontend/src/components/brands/PlanLabel.tsx`
- Test: `frontend/scripts/test-canales.ts`

**Interfaces:**
- Produces (`frontend/src/lib/canales.ts`):
  - `type CanalClave = 'totalpass' | 'fitpass'`
  - `interface Canal { clave: CanalClave; nombre: string; punto: string; anillo: string; logoClaro: string; logoOscuro: string | null; escalaAlto: number; conectado: boolean }`
  - `const CANALES: Record<CanalClave, Canal>`
  - `esCanal(valor: unknown): valor is CanalClave`
  - `canalDePlan(nombrePlan: string | null | undefined): CanalClave | null`
  - `canalesConectados(): Canal[]`
  - `logoDeCanal(clave: CanalClave, fondo: 'claro' | 'oscuro', alto: number): { src: string; alt: string; altoPx: number; pastilla: boolean }`
- Produces (componentes):
  - `ChannelLogo({ canal: CanalClave; fondo?: 'claro' | 'oscuro'; alto?: number; className?: string })` en `@/components/brands/ChannelLogo` (default `fondo='claro'`, `alto=12`)
  - `PlanLabel({ nombre: string; alto?: number })` en `@/components/brands/PlanLabel` (default `alto=9`)

- [ ] **Step 0: Preparar el worktree**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-calendario"
git fetch origin main
git worktree add -b feat/logos-canales "../casa-she-entrega-1" origin/main
cd "../casa-she-entrega-1/frontend" && npm ci
```

Expected: worktree creado; `npm ci` sin errores.

- [ ] **Step 1: Copiar los logos**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-1"
mkdir -p frontend/public/brands
A="/Users/saidromero/Desktop/Casa She/casa-she-calendario/docs/superpowers/assets/calendario-recepcion"
cp "$A/totalpass-claro.svg" "$A/totalpass-oscuro.svg" "$A/fitpass.png" frontend/public/brands/
shasum -a 256 frontend/public/brands/totalpass-*.svg
```

Expected: los dos sha256 coinciden con Global Constraints.

- [ ] **Step 2: Escribir la prueba que falla**

Crear `frontend/scripts/test-canales.ts`:

```ts
// Catálogo de canales: detección por nombre de plan, versión del logo según el
// fondo y que los archivos existan en public/.
// Correr con: npx tsx scripts/test-canales.ts
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CANALES, canalDePlan, canalesConectados, esCanal, logoDeCanal } from '../src/lib/canales.js';

// canalDePlan: nombres de plan reales y variantes de escritura.
assert.equal(canalDePlan('Totalpass'), 'totalpass');
assert.equal(canalDePlan('TotalPass'), 'totalpass');
assert.equal(canalDePlan('Socias TOTAL PASS'), 'totalpass');
assert.equal(canalDePlan('total-pass mensual'), 'totalpass');
assert.equal(canalDePlan('Fitpass'), 'fitpass');
assert.equal(canalDePlan('FitPass Mensual'), 'fitpass');
assert.equal(canalDePlan('Fit Pass'), 'fitpass');
for (const nada of [null, undefined, '', '   ']) {
    assert.equal(canalDePlan(nada), null, `nada=${JSON.stringify(nada)}`);
}
for (const plan of ['Paquete 8 Clases', 'Ilimitado mensual', 'Pass', 'Total', 'Clase suelta']) {
    assert.equal(canalDePlan(plan), null, plan);
}

// esCanal: solo las claves del catálogo.
assert.equal(esCanal('totalpass'), true);
assert.equal(esCanal('fitpass'), true);
for (const v of ['wellhub', 'app', '', null, undefined, 3, 'TotalPass']) {
    assert.equal(esCanal(v), false, `v=${String(v)}`);
}

// Conectados: hoy solo TotalPass.
assert.deepEqual(canalesConectados().map((c) => c.clave), ['totalpass']);

// Colores de la spec.
assert.equal(CANALES.totalpass.punto, '#26D07C');
assert.equal(CANALES.totalpass.anillo, '#0F7A45');
assert.equal(CANALES.fitpass.punto, '#5A8AD0');
assert.equal(CANALES.fitpass.anillo, '#2F5BA8');

// logoDeCanal: versión según fondo, pastilla para Fitpass en oscuro, alto mínimo 8.
assert.deepEqual(logoDeCanal('totalpass', 'claro', 12), { src: '/brands/totalpass-claro.svg', alt: 'TotalPass', altoPx: 12, pastilla: false });
assert.deepEqual(logoDeCanal('totalpass', 'oscuro', 11), { src: '/brands/totalpass-oscuro.svg', alt: 'TotalPass', altoPx: 11, pastilla: false });
assert.deepEqual(logoDeCanal('fitpass', 'claro', 10), { src: '/brands/fitpass.png', alt: 'Fitpass', altoPx: 16, pastilla: false });
assert.deepEqual(logoDeCanal('fitpass', 'oscuro', 10), { src: '/brands/fitpass.png', alt: 'Fitpass', altoPx: 16, pastilla: true });
assert.equal(logoDeCanal('totalpass', 'claro', 4).altoPx, 8, 'nunca menos de 8 px');
assert.equal(logoDeCanal('fitpass', 'claro', 2).altoPx, 8, 'nunca menos de 8 px aunque escale');

// Los archivos que el catálogo nombra existen en public/.
const publico = fileURLToPath(new URL('../public/', import.meta.url));
for (const c of Object.values(CANALES)) {
    for (const ruta of [c.logoClaro, c.logoOscuro]) {
        if (!ruta) continue;
        assert.ok(existsSync(publico + ruta.replace(/^\//, '')), `falta ${ruta}`);
    }
}

console.log('✅ test-canales OK');
```

- [ ] **Step 3: Correrla y ver que falla**

Run: `cd frontend && npx tsx scripts/test-canales.ts`
Expected: FAIL con `Cannot find module '../src/lib/canales.js'`.

- [ ] **Step 4: Escribir `frontend/src/lib/canales.ts`**

```ts
/**
 * Catálogo de plataformas de reserva (canales) con su marca oficial.
 * La clave es la misma que usa la base de datos en bookings.channel y
 * channel_inventory.channel. Wellhub existe en la base, pero no entra aquí
 * hasta que haya trato con ellos.
 *
 * Sin imports con alias "@/": lo usa también un script tsx de pruebas.
 */
export type CanalClave = 'totalpass' | 'fitpass';

export interface Canal {
    clave: CanalClave;
    nombre: string;
    /** Relleno del punto de lugar de una socia de este canal. */
    punto: string;
    /** Anillo del punto, más oscuro para que se distinga sobre fondo claro. */
    anillo: string;
    /** Logo para fondo claro (ruta pública). */
    logoClaro: string;
    /** Logo para fondo oscuro; null = el claro sobre una pastilla blanca. */
    logoOscuro: string | null;
    /** Multiplica el alto pedido para igualar el peso visual entre logos. */
    escalaAlto: number;
    /** Ya publica clases y trae reservas. */
    conectado: boolean;
}

export const CANALES: Record<CanalClave, Canal> = {
    totalpass: {
        clave: 'totalpass',
        nombre: 'TotalPass',
        punto: '#26D07C',
        anillo: '#0F7A45',
        logoClaro: '/brands/totalpass-claro.svg',
        logoOscuro: '/brands/totalpass-oscuro.svg',
        escalaAlto: 1,
        conectado: true,
    },
    fitpass: {
        clave: 'fitpass',
        nombre: 'Fitpass',
        punto: '#5A8AD0',
        anillo: '#2F5BA8',
        logoClaro: '/brands/fitpass.png',
        logoOscuro: null,
        // El PNG incluye el ícono circular: a igual alto, las letras salen más chicas que las de TotalPass.
        escalaAlto: 1.6,
        conectado: false,
    },
};

const ALTO_MINIMO = 8;

export function esCanal(valor: unknown): valor is CanalClave {
    return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(CANALES, valor);
}

/** Plataforma escrita en el nombre de un plan interno ("Totalpass", "Socias FitPass"…). */
export function canalDePlan(nombrePlan: string | null | undefined): CanalClave | null {
    if (!nombrePlan) return null;
    const plano = nombrePlan.toLowerCase().replace(/[^a-z]/g, '');
    if (!plano) return null;
    for (const clave of Object.keys(CANALES) as CanalClave[]) {
        if (plano.includes(clave)) return clave;
    }
    return null;
}

export function canalesConectados(): Canal[] {
    return Object.values(CANALES).filter((c) => c.conectado);
}

/** Qué archivo y a qué alto pintar el logo de un canal sobre cierto fondo. */
export function logoDeCanal(
    clave: CanalClave,
    fondo: 'claro' | 'oscuro',
    alto: number,
): { src: string; alt: string; altoPx: number; pastilla: boolean } {
    const c = CANALES[clave];
    const oscuro = fondo === 'oscuro';
    return {
        src: oscuro && c.logoOscuro ? c.logoOscuro : c.logoClaro,
        alt: c.nombre,
        altoPx: Math.max(ALTO_MINIMO, Math.round(alto * c.escalaAlto)),
        pastilla: oscuro && !c.logoOscuro,
    };
}
```

- [ ] **Step 5: Correr la prueba y ver que pasa**

Run: `cd frontend && npx tsx scripts/test-canales.ts`
Expected: `✅ test-canales OK`

- [ ] **Step 6: Escribir los componentes**

`frontend/src/components/brands/ChannelLogo.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { logoDeCanal, type CanalClave } from '@/lib/canales';

interface ChannelLogoProps {
    canal: CanalClave;
    /** Fondo sobre el que se pinta; elige la versión del logo. */
    fondo?: 'claro' | 'oscuro';
    /** Alto en px (el de TotalPass); otros canales se escalan. Mínimo 8. */
    alto?: number;
    className?: string;
}

/** Logo oficial de una plataforma. Va en lugar de su nombre en etiquetas, insignias, títulos y menú. */
export function ChannelLogo({ canal, fondo = 'claro', alto = 12, className }: ChannelLogoProps) {
    const logo = logoDeCanal(canal, fondo, alto);
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center align-middle',
                logo.pastilla && 'rounded-full bg-white px-1.5 py-0.5',
                className,
            )}
        >
            <img src={logo.src} alt={logo.alt} draggable={false} className="block w-auto" style={{ height: logo.altoPx }} />
        </span>
    );
}
```

`frontend/src/components/brands/PlanLabel.tsx`:

```tsx
import { canalDePlan } from '@/lib/canales';
import { ChannelLogo } from './ChannelLogo';

/** Nombre de un plan; si es el plan interno de una plataforma ("Totalpass"), su logo. */
export function PlanLabel({ nombre, alto = 9 }: { nombre: string; alto?: number }) {
    const canal = canalDePlan(nombre);
    return canal ? <ChannelLogo canal={canal} alto={alto} /> : <>{nombre}</>;
}
```

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add frontend/public/brands/totalpass-claro.svg frontend/public/brands/totalpass-oscuro.svg frontend/public/brands/fitpass.png frontend/src/lib/canales.ts frontend/src/components/brands/ChannelLogo.tsx frontend/src/components/brands/PlanLabel.tsx frontend/scripts/test-canales.ts
git commit -m "feat(marca): catálogo de canales y logos oficiales de TotalPass y Fitpass

canales.ts concentra nombre, colores, logos y la regla de qué versión
pintar según el fondo; ChannelLogo y PlanLabel solo la aplican.
Todavía no se usan en pantallas.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Menú del admin, página de TotalPass y tipos de clase

**Files:**
- Modify: `frontend/src/components/layout/AdminLayout.tsx` (tipo `SidebarChild` ~L56-60, entrada ~L183, render de hijos ~L372-398)
- Modify: `frontend/src/pages/admin/settings/TotalPassSettings.tsx` (`<h1>` ~L126-128)
- Modify: `frontend/src/pages/admin/classes/ClassTypesList.tsx` (`<Label>` ~L320)

**Interfaces:**
- Consumes: `ChannelLogo` de `@/components/brands/ChannelLogo`; `type CanalClave` de `@/lib/canales` (Task 1).

- [ ] **Step 1: Menú lateral**

En `AdminLayout.tsx`:

1. Agregar imports:

```tsx
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import type { CanalClave } from '@/lib/canales';
```

2. En el tipo `SidebarChild`, agregar el campo opcional:

```tsx
type SidebarChild = {
    href?: string;
    label: string;
    kind?: 'header';
    /** Si el destino es de una plataforma, se pinta su logo en lugar del texto. */
    logo?: CanalClave;
};
```

3. Cambiar la entrada:

```tsx
              { href: '/admin/settings/totalpass', label: 'TotalPass' },
```

por:

```tsx
              { href: '/admin/settings/totalpass', label: 'TotalPass', logo: 'totalpass' },
```

4. En el `<Link>` de los hijos (el que hoy termina con `{child.label}` antes de `</Link>`), cambiar `{child.label}` por:

```tsx
              {child.logo ? <ChannelLogo canal={child.logo} fondo="oscuro" alto={11} /> : child.label}
```

`label` se queda porque se usa como dato (llaves y búsqueda); el `alt` del logo le da nombre accesible al enlace.

- [ ] **Step 2: Título de la página de TotalPass**

En `TotalPassSettings.tsx`, agregar `import { ChannelLogo } from '@/components/brands/ChannelLogo';` y cambiar:

```tsx
                <h1 className="text-3xl font-heading font-bold" style={{ color: '#2A4E36' }}>
                  TotalPass
                </h1>
```

por:

```tsx
                <h1 className="text-3xl font-heading font-bold" style={{ color: '#2A4E36' }}>
                  <ChannelLogo canal="totalpass" alto={28} />
                </h1>
```

El subtítulo, las descripciones de las tarjetas, el placeholder y el toast se quedan con texto (son frases).

- [ ] **Step 3: Etiqueta en tipos de clase**

En `ClassTypesList.tsx`, agregar el import de `ChannelLogo` y cambiar:

```tsx
                                    <Label htmlFor="totalpassDefaultSpots">Lugares TotalPass por defecto</Label>
```

por:

```tsx
                                    <Label htmlFor="totalpassDefaultSpots" className="flex items-center gap-1.5">
                                        Lugares para <ChannelLogo canal="totalpass" alto={10} /> por defecto
                                    </Label>
```

El texto de ayuda de abajo se queda igual (frase).

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx tsx scripts/test-canales.ts && grep -n "'TotalPass'" src/components/layout/AdminLayout.tsx`
Expected: tsc sin errores; `✅ test-canales OK`; el grep muestra solo la línea con `label: 'TotalPass', logo: 'totalpass'`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AdminLayout.tsx frontend/src/pages/admin/settings/TotalPassSettings.tsx frontend/src/pages/admin/classes/ClassTypesList.tsx
git commit -m "feat(marca): logo de TotalPass en el menú, su página y tipos de clase

En la barra lateral oscura va la versión con PASS en blanco.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Calendario de clases

**Files:**
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx` (fila de asistente ~L719-735; cupo del panel ~L1293-1302; diálogo Editar ~L1889-1893)

**Interfaces:**
- Consumes: `ChannelLogo`, `PlanLabel` (Task 1); `CANALES`, `esCanal`, `canalDePlan` de `@/lib/canales` (Task 1).

- [ ] **Step 1: Imports**

```tsx
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { PlanLabel } from '@/components/brands/PlanLabel';
import { CANALES, canalDePlan, esCanal } from '@/lib/canales';
```

- [ ] **Step 2: Fila de asistente**

Cambiar la insignia del plan:

```tsx
                            : attendee.plan_name && <Badge variant="outline" className="text-[10px]">{attendee.plan_name}</Badge>}
```

por (si el plan interno es de la misma plataforma por la que reservó, no se repite el logo):

```tsx
                            : attendee.plan_name && canalDePlan(attendee.plan_name) !== attendee.channel && (
                                <Badge variant="outline" className="text-[10px]"><PlanLabel nombre={attendee.plan_name} /></Badge>
                            )}
```

Cambiar la insignia de canal:

```tsx
                        {attendee.channel === 'totalpass' && (
                            <Badge variant="outline" className="border-[#2A4E36]/40 text-[10px] text-[#2A4E36]">TotalPass</Badge>
                        )}
```

por:

```tsx
                        {esCanal(attendee.channel) && <ChannelLogo canal={attendee.channel} alto={9} />}
```

Cambiar la frase de quién reservó:

```tsx
                        Reservó: {attendee.channel === 'totalpass' ? 'desde TotalPass' : attendeeBookedBy(attendee)}
```

por:

```tsx
                        Reservó: {esCanal(attendee.channel) ? `desde ${CANALES[attendee.channel].nombre}` : attendeeBookedBy(attendee)}
```

- [ ] **Step 3: Cupo del panel lateral**

Cambiar el encabezado del bloque "Cupo de TotalPass":

```tsx
                                        <div className="mb-2 flex items-center gap-2">
                                            <span
                                                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
                                                style={{ backgroundColor: '#2A4E36' }}
                                            >
                                                TotalPass
                                            </span>
                                            <p className="text-sm font-semibold">Lugares para TotalPass</p>
                                        </div>
```

por:

```tsx
                                        <div className="mb-2 flex items-center gap-2">
                                            <p className="flex items-center gap-2 text-sm font-semibold">
                                                Lugares para <ChannelLogo canal="totalpass" alto={12} />
                                            </p>
                                        </div>
```

La ayuda "de N · 0 = no se ofrece en TotalPass" se queda (frase).

- [ ] **Step 4: Diálogo "Editar Clase"**

Cambiar:

```tsx
                                    <Label>Lugares TotalPass</Label>
```

por:

```tsx
                                    <Label className="flex items-center gap-1.5">Lugares para <ChannelLogo canal="totalpass" alto={10} /></Label>
```

La ayuda "0 = clase no ofrecida en TotalPass", la nota de "Copiar semana" y los toasts se quedan (frases). La pastilla "TP n" de `ClassEventCard` NO se toca (Global Constraints).

- [ ] **Step 5: Verificar**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && grep -n ">TotalPass<\|'desde TotalPass'\|Lugares TotalPass\|Lugares para TotalPass" src/pages/admin/classes/ClassesCalendar.tsx`
Expected: tsc sin errores; el grep no encuentra nada.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/classes/ClassesCalendar.tsx
git commit -m "feat(marca): logos de canal en asistentes y cupo del calendario

La fila de una socia muestra el logo de su plataforma y el plan interno
de esa misma plataforma no repite el logo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Recepción, coach e insignias de plan

**Files:**
- Modify: `frontend/src/pages/reception/BookingsScreen.tsx` (`MarcaTotalPass` ~L68-79; `planLabel` ~L246-249; insignia ~L507; pastilla de la lista de clases ~L970-978)
- Modify: `frontend/src/pages/coach/Students.tsx` (`CHANNEL_LABEL` ~L35-39; insignia ~L188-192)
- Modify: `frontend/src/components/PlatformBadge.tsx`
- Modify: `frontend/src/pages/admin/clients/ClientsList.tsx` (~L490-492)
- Modify: `frontend/src/pages/admin/payroll/CoachPayrollPage.tsx` (~L256)
- Modify: `frontend/src/pages/reception/ClientsScreen.tsx` (~L1592-1600)

**Interfaces:**
- Consumes: `ChannelLogo`, `PlanLabel`, `CANALES`, `esCanal`, `canalDePlan` (Task 1).

- [ ] **Step 1: `BookingsScreen.tsx`**

Imports:

```tsx
import type { ReactNode } from 'react';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { CANALES } from '@/lib/canales';
```

(Si el archivo ya importa de `'react'`, sumar `type ReactNode` a ese import en vez de agregar otro.)

a) Punto de `MarcaTotalPass`: cambiar `bg-[#2A4E36]` por el color del canal. Reemplazar:

```tsx
            className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-[#2A4E36]"
```

por:

```tsx
            className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: CANALES.totalpass.punto }}
```

b) `planLabel` devuelve un nodo para poder mostrar el logo:

```tsx
    const planLabel = (b: BookingRow) =>
        esTotalPass(b) ? 'TotalPass' : b.is_free_booking ? 'Invitada' : (b.plan_name || 'Sin plan');
```

por:

```tsx
    const planLabel = (b: BookingRow): ReactNode =>
        esTotalPass(b) ? <ChannelLogo canal="totalpass" alto={9} /> : b.is_free_booking ? 'Invitada' : (b.plan_name || 'Sin plan');
```

c) Insignia de la fila activa:

```tsx
                                                                                    <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-[#2A4E36]/40 text-[#2A4E36]">TotalPass</Badge>
```

por:

```tsx
                                                                                    <ChannelLogo canal="totalpass" alto={9} />
```

d) Pastilla de la lista de clases:

```tsx
                                    <span
                                        className="shrink-0 rounded-sm border border-[#2A4E36]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#2A4E36]"
                                        title={`${c.totalpass_booked} desde TotalPass`}
                                    >
                                        <span className="hidden sm:inline">TotalPass · </span>{c.totalpass_booked}
                                    </span>
```

por:

```tsx
                                    <span
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-[#0F7A45]/40 px-2 py-0.5 text-[10px] font-semibold text-[#2A4E36]"
                                        title={`${c.totalpass_booked} desde TotalPass`}
                                    >
                                        <span className="hidden sm:inline-flex"><ChannelLogo canal="totalpass" alto={9} /></span>
                                        <span className="tabular-nums">{c.totalpass_booked}</span>
                                    </span>
```

`bookedByLabel` ("desde TotalPass") y los `title`/`aria-label` se quedan (frases).

- [ ] **Step 2: `Students.tsx` (coach)**

Imports: `ChannelLogo` y `esCanal`. Cambiar el mapa:

```tsx
const CHANNEL_LABEL: Record<string, string> = {
    totalpass: 'TotalPass',
    fitpass: 'FitPass',
    wellhub: 'Wellhub',
};
```

por (TotalPass y Fitpass ya van con logo):

```tsx
/** Plataformas sin logo en el catálogo: se muestran con su nombre. */
const CHANNEL_LABEL: Record<string, string> = {
    wellhub: 'Wellhub',
};
```

Y la insignia:

```tsx
                                                        {channelLabel && (
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                                {channelLabel}
                                                            </Badge>
                                                        )}
```

por:

```tsx
                                                        {esCanal(student.primary_channel) ? (
                                                            <ChannelLogo canal={student.primary_channel} alto={9} />
                                                        ) : channelLabel && (
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                                {channelLabel}
                                                            </Badge>
                                                        )}
```

- [ ] **Step 3: `PlatformBadge.tsx`**

Reemplazar el archivo por:

```tsx
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { CANALES, canalDePlan } from '@/lib/canales';

/**
 * Distintivo de plataforma (Totalpass/Wellhub/Fitpass) para identificar en las reservas
 * a los alumnos con un plan interno. Se auto-oculta si no hay color (planes normales).
 * Si la plataforma está en el catálogo de canales, se muestra su logo oficial.
 */
export function PlatformBadge({ name, color }: { name?: string | null; color?: string | null }) {
  if (!name || !color) return null;
  const canal = canalDePlan(name);
  if (canal) {
    return (
      <span className="inline-flex items-center" title={`Plataforma: ${CANALES[canal].nombre}`}>
        <ChannelLogo canal={canal} alto={9} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
      style={{ backgroundColor: `${color}1A`, color, border: `1px solid ${color}55` }}
      title={`Plataforma: ${name}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
```

- [ ] **Step 4: Insignias de nombre de plan**

En cada archivo, agregar `import { PlanLabel } from '@/components/brands/PlanLabel';` y envolver el nombre del plan **dentro de la insignia existente**:

`ClientsList.tsx`:

```tsx
                                                        <Badge variant="secondary" className="text-xs">{user.plan_name}</Badge>
```

→

```tsx
                                                        <Badge variant="secondary" className="text-xs"><PlanLabel nombre={user.plan_name} /></Badge>
```

`CoachPayrollPage.tsx`:

```tsx
                            {a.plan_name && <Badge variant="outline" className="text-[10px]">{a.plan_name}</Badge>}
```

→

```tsx
                            {a.plan_name && <Badge variant="outline" className="text-[10px]"><PlanLabel nombre={a.plan_name} /></Badge>}
```

`ClientsScreen.tsx` (resultado de búsqueda): dentro del `<Badge>` que hoy muestra `{c.plan_name}`, cambiar `{c.plan_name}` por `<PlanLabel nombre={c.plan_name} />`.

Las celdas de tabla y textos donde el plan aparece como texto (tabla de `ClientsList`, `ClientDetail`, `MembershipsList`, tarjetas de `ClientsScreen`, `ScanScreen`, la línea bajo el nombre en `DashboardScreen`) se quedan como texto.

- [ ] **Step 5: Verificar**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && grep -rn ">TotalPass<\|'TotalPass'\|'FitPass'" src/pages/reception/BookingsScreen.tsx src/pages/coach/Students.tsx src/components/PlatformBadge.tsx`
Expected: tsc sin errores; el grep no encuentra nada.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/reception/BookingsScreen.tsx frontend/src/pages/coach/Students.tsx frontend/src/components/PlatformBadge.tsx frontend/src/pages/admin/clients/ClientsList.tsx frontend/src/pages/admin/payroll/CoachPayrollPage.tsx frontend/src/pages/reception/ClientsScreen.tsx
git commit -m "feat(marca): logos de canal en recepción, coach e insignias de plan

El plan interno \"Totalpass\" se muestra con el logo dentro de su insignia;
los textos corridos siguen con el nombre escrito.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Prueba en navegador, build y PR

**Files:**
- Create: `frontend/e2e/tests/admin-channel-logos.spec.ts`

**Interfaces:**
- Consumes: fixture `adminPage` de `frontend/e2e/fixtures/auth.ts` (inicia sesión con `ADMIN_EMAIL`/`ADMIN_PASSWORD`).

- [ ] **Step 1: Escribir la prueba**

```ts
/**
 * Logos de canales: el nombre de TotalPass en etiquetas y títulos se ve como su logo oficial.
 */
import { test, expect } from "../fixtures/auth";

test.describe("Logos de canales", () => {
  test("la página de TotalPass usa el logo como título", async ({ adminPage: page }) => {
    await page.goto("/admin/settings/totalpass");
    await expect(page.getByRole("heading", { level: 1 }).getByRole("img", { name: "TotalPass" })).toBeVisible();
  });

  test("el menú lleva a TotalPass con el logo en su versión para fondo oscuro", async ({ adminPage: page }) => {
    await page.goto("/admin/settings/totalpass");
    const logo = page.locator('a[href="/admin/settings/totalpass"] img[alt="TotalPass"]').first();
    await expect(logo).toBeAttached();
    await expect(logo).toHaveAttribute("src", "/brands/totalpass-oscuro.svg");
  });
});
```

- [ ] **Step 2: Build y pruebas**

Run: `cd frontend && npx tsx scripts/test-canales.ts && npx tsc --noEmit -p tsconfig.app.json && npm run build`
Expected: `✅ test-canales OK`; tsc sin errores; `vite build` termina y `dist/brands/` contiene los tres archivos.

Playwright necesita backend y frontend corriendo con un admin válido (`ADMIN_EMAIL`/`ADMIN_PASSWORD`). Si el entorno los tiene: `npx playwright test e2e/tests/admin-channel-logos.spec.ts` y reportar la salida tal cual. Si no, reportar que no se corrió y por qué; no inventar resultados.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/tests/admin-channel-logos.spec.ts
git commit -m "test(marca): prueba en navegador de los logos de TotalPass

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: PR**

```bash
git push -u origin feat/logos-canales
gh pr create --base main --head feat/logos-canales --title "feat(marca): logos oficiales de TotalPass y Fitpass en lugar del nombre escrito" --body "$(cat <<'EOF'
## Qué cambia
- Logos oficiales en `frontend/public/brands/`: TotalPass vectorial de totalpass.com (versión clara con PASS negro y oscura con PASS blanco) y Fitpass de fitpass.com.
- `frontend/src/lib/canales.ts`: catálogo de canales (TotalPass conectado, Fitpass listo para cuando se conecte) con colores, logos y la regla de qué versión pintar según el fondo.
- `ChannelLogo` y `PlanLabel` aplican esa regla.
- Etiquetas, insignias, títulos y menú muestran el logo: menú del admin, página de TotalPass, tipos de clase, asistentes y cupo del calendario, recepción, coach, e insignias del plan interno "Totalpass". Los textos corridos (avisos, ayudas, aviso de privacidad, reportes) conservan el nombre escrito.

## Pruebas
- `frontend/scripts/test-canales.ts` (tsx): detección por nombre de plan, versión del logo por fondo, alto mínimo de 8 px y que los archivos existan.
- `frontend/e2e/tests/admin-channel-logos.spec.ts` (Playwright, requiere admin).
- `tsc` y `vite build` limpios.

Segunda entrega del rediseño del calendario de recepción (`docs/superpowers/specs/2026-10-07-calendario-recepcion-design.md`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: URL del PR.
