# 🧘‍♀️ Balance Room Pilates - Análisis Completo del Sistema de Membresías

## 📋 Resumen Ejecutivo

**Modelo de Negocio:**
- Inscripción anual: $500 MXN (desbloquea precios de miembro)
- Clases muestra: Disponibles para cualquier persona sin inscripción
- Paquetes exclusivos: Solo para miembros con inscripción activa
- Wallet Pass: Se activa al pagar inscripción

---

## 🎯 1. TIPOS DE USUARIO Y ESTADOS

### 1.1 Matriz de Estados de Usuario

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ESTADOS DE USUARIO                               │
├─────────────────┬───────────────┬───────────────┬───────────────────────┤
│     Estado      │  Puede Ver    │ Puede Comprar │      Wallet Pass      │
├─────────────────┼───────────────┼───────────────┼───────────────────────┤
│ INVITADA        │ Precios       │ Solo clase    │ ❌ No                 │
│ (sin cuenta)    │ públicos      │ muestra       │                       │
├─────────────────┼───────────────┼───────────────┼───────────────────────┤
│ REGISTRADA      │ Ambos precios │ Solo clase    │ ❌ No                 │
│ (sin membresía) │ (comparación) │ muestra       │ (botón "Activar")     │
├─────────────────┼───────────────┼───────────────┼───────────────────────┤
│ MIEMBRO         │ Precios de    │ Todos los     │ ✅ Sí                 │
│ (inscripción    │ miembro       │ paquetes      │ (activo)              │
│ activa)         │               │               │                       │
├─────────────────┼───────────────┼───────────────┼───────────────────────┤
│ MIEMBRO         │ Ambos precios │ Solo clase    │ ⚠️ Expirado           │
│ VENCIDO         │ (recordatorio │ muestra       │ (mostrar renovar)     │
│ (>1 año)        │ renovar)      │               │                       │
└─────────────────┴───────────────┴───────────────┴───────────────────────┘
```

### 1.2 Flujo de Transición de Estados

```
                    ┌──────────────┐
                    │   VISITANTE  │
                    │  (anonymous) │
                    └──────┬───────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
    ┌───────────┐  ┌───────────────┐  ┌─────────────┐
    │  Compra   │  │  Se registra  │  │   Solo ve   │
    │  clase    │  │  (crear       │  │   precios   │
    │  muestra  │  │   cuenta)     │  │             │
    └─────┬─────┘  └───────┬───────┘  └─────────────┘
          │                │
          │                ▼
          │        ┌───────────────┐
          │        │  REGISTRADA   │
          │        │ (sin membresía)│
          │        └───────┬───────┘
          │                │
          │                │ Paga $500 inscripción
          │                ▼
          │        ┌───────────────┐
          └───────►│    MIEMBRO    │◄────────┐
                   │    ACTIVO     │         │
                   └───────┬───────┘         │
                           │                 │
                           │ Pasa 1 año      │ Renueva
                           ▼                 │
                   ┌───────────────┐         │
                   │    MIEMBRO    │─────────┘
                   │    VENCIDO    │
                   └───────────────┘
```

---

## 💰 2. ESTRUCTURA DE PRECIOS

### 2.1 Tabla de Precios Sugerida

| Producto | Precio Público | Precio Miembro | Ahorro |
|----------|---------------|----------------|--------|
| **Clase Muestra** | $150 | $150 | - |
| **Inscripción Anual** | $500 | - | - |
| **1 Clase Suelta** | N/A | $180 | - |
| **Paquete 5 Clases** | N/A | $800 | $100 |
| **Paquete 10 Clases** | N/A | $1,400 | $400 |
| **Paquete 20 Clases** | N/A | $2,400 | $1,200 |
| **Mensualidad Ilimitada** | N/A | $1,800 | - |

### 2.2 Lógica de Clase Muestra

```javascript
// La clase muestra es especial:
const claseMuestra = {
  nombre: "Clase Muestra",
  precio: 150,
  restricciones: {
    requiereRegistro: false,      // Puede comprar como invitada
    requiereMembresía: false,     // No necesita los $500
    límitePorPersona: 1,          // Solo 1 por email/teléfono
    validezDías: 30               // Usar dentro de 30 días
  }
};
```

### 2.3 Beneficio Real de la Membresía

**Análisis de ROI para la clienta:**

```
Si toma 2 clases por semana (8 al mes):
- Sin membresía: No puede comprar paquetes
- Con membresía ($500/año):
  
  Paquete 10 clases = $1,400
  8 clases/mes × 12 meses = 96 clases/año
  Necesita: ~10 paquetes de 10 = $14,000/año
  
  vs precio teórico público (si existiera):
  96 clases × $250 = $24,000/año
  
  AHORRO ANUAL: $10,000 - $500 inscripción = $9,500
```

---

## 🗄️ 3. MODELO DE BASE DE DATOS

### 3.1 Estructura Firebase/Firestore

```typescript
// Collections Structure

// 1. USUARIOS
interface Usuario {
  uid: string;
  email: string;
  nombre: string;
  apellido: string;
  telefono: string;
  fechaRegistro: Timestamp;
  
  // Estado de membresía
  membresía: {
    estado: 'ninguna' | 'activa' | 'vencida';
    fechaInscripción: Timestamp | null;
    fechaVencimiento: Timestamp | null;
    historialPagos: string[];  // IDs de pagos de inscripción
  };
  
  // Wallet
  wallet: {
    passId: string | null;
    passUrl: string | null;
    activo: boolean;
  };
  
  // Clases
  clasesRestantes: number;
  clasesTomadas: number;
  
  // Metadata
  esInvitada: boolean;  // true si solo compró clase muestra sin registrarse
  invitadaEmail?: string;
}

// 2. PRODUCTOS/PAQUETES
interface Producto {
  id: string;
  nombre: string;
  tipo: 'clase_muestra' | 'inscripcion' | 'paquete' | 'mensualidad';
  
  precio: number;
  clases: number;  // Número de clases incluidas
  
  // Restricciones
  requiereMembresía: boolean;
  requiereRegistro: boolean;
  límiteCompras: number | null;  // null = ilimitado
  
  // Validez
  validezDías: number;  // Días para usar después de compra
  
  // UI
  destacado: boolean;
  orden: number;
  activo: boolean;
}

// 3. COMPRAS/TRANSACCIONES
interface Compra {
  id: string;
  
  // Usuario (puede ser null si es invitada)
  userId: string | null;
  invitadaEmail: string | null;
  invitadaTelefono: string | null;
  
  // Producto
  productoId: string;
  productoNombre: string;
  productoPrecio: number;
  
  // Clases
  clasesCompradas: number;
  clasesUsadas: number;
  clasesRestantes: number;
  
  // Fechas
  fechaCompra: Timestamp;
  fechaVencimiento: Timestamp;
  
  // Pago
  metodoPago: 'stripe' | 'efectivo' | 'transferencia';
  stripePaymentId: string | null;
  estado: 'pendiente' | 'pagado' | 'cancelado' | 'reembolsado';
}

// 4. CLASES (Asistencias)
interface Asistencia {
  id: string;
  userId: string | null;
  invitadaEmail: string | null;
  
  compraId: string;  // De qué compra se descuenta
  
  fecha: Timestamp;
  tipoClase: string;
  instructor: string;
  
  estado: 'reservada' | 'asistió' | 'no_asistió' | 'cancelada';
}

// 5. PAGOS DE INSCRIPCIÓN
interface PagoInscripcion {
  id: string;
  userId: string;
  
  monto: number;
  fechaPago: Timestamp;
  
  // Período que cubre
  periodoInicio: Timestamp;
  periodoFin: Timestamp;
  
  metodoPago: 'stripe' | 'efectivo' | 'transferencia';
  stripePaymentId: string | null;
  
  // Si fue renovación o primera vez
  tipo: 'inicial' | 'renovacion';
}
```

### 3.2 Índices Recomendados

```javascript
// Firestore Indexes
{
  "indexes": [
    {
      "collectionGroup": "usuarios",
      "fields": [
        { "fieldPath": "membresía.estado", "order": "ASCENDING" },
        { "fieldPath": "membresía.fechaVencimiento", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "compras",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "fechaCompra", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "compras",
      "fields": [
        { "fieldPath": "invitadaEmail", "order": "ASCENDING" },
        { "fieldPath": "clasesRestantes", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 🛒 4. FLUJOS DE COMPRA

### 4.1 Flujo: Invitada Compra Clase Muestra

```
┌─────────────────────────────────────────────────────────────────────┐
│                  COMPRA CLASE MUESTRA (INVITADA)                    │
└─────────────────────────────────────────────────────────────────────┘

1. Ve página de precios
         │
         ▼
2. Click "Clase Muestra - $150"
         │
         ▼
3. Modal de checkout simple:
   ┌─────────────────────────────────┐
   │  🧘‍♀️ Clase Muestra - $150       │
   │                                 │
   │  Nombre: [____________]         │
   │  Email:  [____________]         │
   │  Tel:    [____________]         │
   │                                 │
   │  □ Quiero crear cuenta          │
   │    (opcional)                   │
   │                                 │
   │  [💳 Pagar $150]                │
   │                                 │
   │  ─────────────────────────────  │
   │  ¿Ya tienes cuenta? Inicia      │
   │  sesión para mejores precios    │
   └─────────────────────────────────┘
         │
         ▼
4. Procesa pago (Stripe)
         │
         ▼
5. Resultado:
   - Si NO marcó crear cuenta:
     → Guarda como compra de invitada
     → Email de confirmación con código QR
     → Puede presentar QR para asistir
   
   - Si SÍ marcó crear cuenta:
     → Crea usuario con estado "registrada"
     → Guarda compra vinculada al usuario
     → Email de bienvenida + confirmación
```

### 4.2 Flujo: Registrada Intenta Comprar Paquete

```
┌─────────────────────────────────────────────────────────────────────┐
│           REGISTRADA SIN MEMBRESÍA INTENTA COMPRAR PAQUETE          │
└─────────────────────────────────────────────────────────────────────┘

1. Usuario logueado ve página de precios
         │
         ▼
2. Ve dos columnas:
   ┌────────────────────┬────────────────────┐
   │  PRECIOS PÚBLICOS  │  PRECIOS MIEMBRO   │
   │                    │  🔒 Exclusivos     │
   │  Clase Muestra     │                    │
   │  $150 [Comprar]    │  5 Clases - $800   │
   │                    │  10 Clases - $1400 │
   │                    │  [🔒 Bloqueado]    │
   │                    │                    │
   │                    │  Activa tu         │
   │                    │  membresía $500    │
   │                    │  [Activar Ahora]   │
   └────────────────────┴────────────────────┘
         │
         ▼
3. Click en paquete bloqueado:
   ┌─────────────────────────────────────┐
   │  🔒 Contenido Exclusivo para        │
   │     Miembros                        │
   │                                     │
   │  Para acceder a precios de miembro  │
   │  necesitas activar tu membresía     │
   │  anual.                             │
   │                                     │
   │  Membresía Anual: $500              │
   │  • Acceso a precios exclusivos      │
   │  • Wallet Pass digital              │
   │  • Reservas prioritarias            │
   │  • Promociones especiales           │
   │                                     │
   │  [Activar Membresía - $500]         │
   │  [Tal vez después]                  │
   └─────────────────────────────────────┘
         │
         ▼
4. Si activa membresía:
   → Pago de $500
   → Actualiza estado a "miembro activo"
   → Genera y activa Wallet Pass
   → Redirige a precios de miembro
   → Ahora puede comprar paquetes
```

### 4.3 Flujo: Miembro Compra Paquete

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MIEMBRO COMPRA PAQUETE                           │
└─────────────────────────────────────────────────────────────────────┘

1. Usuario logueado (miembro activo)
         │
         ▼
2. Ve precios de miembro directamente:
   ┌─────────────────────────────────────┐
   │  👑 Precios de Miembro              │
   │  Tu membresía vence: 15 dic 2026    │
   │                                     │
   │  ┌─────────┐ ┌─────────┐ ┌────────┐│
   │  │5 Clases │ │10 Clases│ │20 Clase││
   │  │  $800   │ │ $1,400  │ │ $2,400 ││
   │  │[Comprar]│ │[Comprar]│ │[Comprar││
   │  └─────────┘ └─────────┘ └────────┘│
   │                                     │
   │  ┌─────────────────────────────────┐│
   │  │ Mensualidad Ilimitada - $1,800  ││
   │  │ [Comprar]                       ││
   │  └─────────────────────────────────┘│
   └─────────────────────────────────────┘
         │
         ▼
3. Checkout directo (ya tiene datos)
         │
         ▼
4. Pago procesado
         │
         ▼
5. Actualiza:
   - clasesRestantes += clases compradas
   - Crea registro de compra
   - Actualiza Wallet Pass con nuevo saldo
   - Notificación push al wallet
```

### 4.4 Flujo: Renovación de Membresía

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RENOVACIÓN DE MEMBRESÍA                          │
└─────────────────────────────────────────────────────────────────────┘

TRIGGERS DE RECORDATORIO:
- 30 días antes: Email "Tu membresía vence pronto"
- 15 días antes: Email + Push notification
- 7 días antes: Email + Push + Banner en app
- Día de vencimiento: Email urgente
- 1 día después: Estado cambia a "vencida"

FLUJO CUANDO VENCE:
         │
         ▼
1. Cloud Function diaria revisa vencimientos
         │
         ▼
2. Si fechaVencimiento < hoy:
   - Actualiza estado a "vencida"
   - Actualiza Wallet Pass (muestra "RENOVAR")
   - Bloquea compra de paquetes
   - Mantiene clases ya compradas
         │
         ▼
3. Usuario intenta comprar:
   ┌─────────────────────────────────────┐
   │  ⚠️ Membresía Vencida               │
   │                                     │
   │  Tu membresía venció el 15/01/2026  │
   │                                     │
   │  Para seguir disfrutando de         │
   │  precios de miembro, renueva ahora. │
   │                                     │
   │  Renovación Anual: $500             │
   │                                     │
   │  [Renovar Ahora]                    │
   │                                     │
   │  Aún tienes 3 clases disponibles    │
   │  que puedes usar sin renovar.       │
   └─────────────────────────────────────┘
         │
         ▼
4. Si renueva:
   - Pago de $500
   - Nueva fechaVencimiento = hoy + 1 año
   - Reactiva Wallet Pass
   - Desbloquea paquetes
```

---

## 📱 5. DISEÑO DE INTERFAZ (INDEX/PRECIOS)

### 5.1 Estructura de Página de Precios

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BALANCE ROOM PILATES                             │
│                     Encuentra tu equilibrio                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  HERO SECTION                                                       │
│  "Primera vez? Prueba una clase muestra"                            │
│  [Clase Muestra - $150] ← CTA principal para visitantes             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  COMPARADOR DE PRECIOS (toggle o tabs)                              │
│                                                                     │
│  [Invitada]  [Miembro 👑]                                           │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════    │
│                                                                     │
│  Si selecciona "Invitada":                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │   🧘‍♀️ Clase Muestra                                          │    │
│  │   Perfecta para conocernos                                  │    │
│  │                                                             │    │
│  │   $150                                                      │    │
│  │   • 1 clase de prueba                                       │    │
│  │   • Sin compromiso                                          │    │
│  │   • Válida por 30 días                                      │    │
│  │                                                             │    │
│  │   [Reservar Clase Muestra]                                  │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  💡 ¿Sabías que puedes ahorrar más?                         │    │
│  │                                                             │    │
│  │  Con la membresía anual ($500) accedes a:                   │    │
│  │  • Paquetes desde $80/clase (vs $150)                       │    │
│  │  • Wallet Pass digital                                      │    │
│  │  • Reservas prioritarias                                    │    │
│  │                                                             │    │
│  │  [Ver Precios de Miembro]                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════    │
│                                                                     │
│  Si selecciona "Miembro":                                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │  👑 MEMBRESÍA ANUAL                         Recomendado     │    │
│  │                                                             │    │
│  │  $500/año                                                   │    │
│  │  • Desbloquea todos los paquetes                            │    │
│  │  • Wallet Pass digital                                      │    │
│  │  • Precios exclusivos                                       │    │
│  │                                                             │    │
│  │  [Activar Membresía] ← si no está logueada o no es miembro  │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│  │5 Clases │  │10 Clases│  │20 Clases│  │Ilimitado│               │
│  │         │  │ POPULAR │  │  AHORRA │  │         │               │
│  │  $800   │  │ $1,400  │  │ $2,400  │  │ $1,800  │               │
│  │$160/cls │  │ $140/cls│  │ $120/cls│  │  /mes   │               │
│  │         │  │         │  │         │  │         │               │
│  │[Comprar]│  │[Comprar]│  │[Comprar]│  │[Comprar]│               │
│  │    o    │  │    o    │  │    o    │  │    o    │               │
│  │   🔒    │  │   🔒    │  │   🔒    │  │   🔒    │               │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘               │
│                                                                     │
│  🔒 = Requiere membresía activa                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Lógica de Renderizado de Precios

```typescript
// hooks/useUserPricing.ts

type UserPricingTier = 'visitor' | 'registered' | 'member' | 'expired';

interface PricingState {
  tier: UserPricingTier;
  canBuyClaseMuestra: boolean;
  canBuyPaquetes: boolean;
  showMembershipCTA: boolean;
  membershipExpiry: Date | null;
  daysUntilExpiry: number | null;
}

function useUserPricing(user: User | null): PricingState {
  if (!user) {
    return {
      tier: 'visitor',
      canBuyClaseMuestra: true,
      canBuyPaquetes: false,
      showMembershipCTA: true,
      membershipExpiry: null,
      daysUntilExpiry: null,
    };
  }

  const { membresía } = user;

  if (membresía.estado === 'activa') {
    const expiry = membresía.fechaVencimiento.toDate();
    const daysLeft = differenceInDays(expiry, new Date());
    
    return {
      tier: 'member',
      canBuyClaseMuestra: true,
      canBuyPaquetes: true,
      showMembershipCTA: daysLeft <= 30, // Mostrar renovación si quedan 30 días
      membershipExpiry: expiry,
      daysUntilExpiry: daysLeft,
    };
  }

  if (membresía.estado === 'vencida') {
    return {
      tier: 'expired',
      canBuyClaseMuestra: true,
      canBuyPaquetes: false,
      showMembershipCTA: true,
      membershipExpiry: membresía.fechaVencimiento.toDate(),
      daysUntilExpiry: null,
    };
  }

  // Registrada sin membresía
  return {
    tier: 'registered',
    canBuyClaseMuestra: true,
    canBuyPaquetes: false,
    showMembershipCTA: true,
    membershipExpiry: null,
    daysUntilExpiry: null,
  };
}
```

### 5.3 Componente de Tarjeta de Producto

```typescript
// components/ProductCard.tsx

interface ProductCardProps {
  producto: Producto;
  userTier: UserPricingTier;
  onBuy: () => void;
  onShowMembershipModal: () => void;
}

function ProductCard({ producto, userTier, onBuy, onShowMembershipModal }: ProductCardProps) {
  const isLocked = producto.requiereMembresía && 
                   (userTier === 'visitor' || userTier === 'registered' || userTier === 'expired');

  const handleClick = () => {
    if (isLocked) {
      onShowMembershipModal();
    } else {
      onBuy();
    }
  };

  return (
    <div className={`product-card ${isLocked ? 'locked' : ''}`}>
      {producto.destacado && <span className="badge">Popular</span>}
      
      <h3>{producto.nombre}</h3>
      <p className="price">${producto.precio}</p>
      
      {producto.clases > 1 && (
        <p className="per-class">
          ${Math.round(producto.precio / producto.clases)}/clase
        </p>
      )}

      <ul className="features">
        <li>{producto.clases} {producto.clases === 1 ? 'clase' : 'clases'}</li>
        <li>Válido por {producto.validezDías} días</li>
      </ul>

      <button 
        onClick={handleClick}
        className={isLocked ? 'btn-locked' : 'btn-primary'}
      >
        {isLocked ? (
          <>🔒 Requiere Membresía</>
        ) : (
          <>Comprar</>
        )}
      </button>
    </div>
  );
}
```

---

## 🎫 6. INTEGRACIÓN CON WALLET PASS

### 6.1 Cuándo Crear/Actualizar el Pass

| Evento | Acción en Wallet |
|--------|-----------------|
| Paga inscripción (nuevo) | Crear pass + enviar URL |
| Renueva membresía | Actualizar fechas |
| Compra paquete | Actualizar clases restantes |
| Usa clase | Actualizar clases restantes |
| Membresía vence | Mostrar "RENOVAR" + cambiar color |
| Cancela membresía | Marcar como inactivo |

### 6.2 Estructura del Pass (pass.json)

```json
{
  "formatVersion": 1,
  "passTypeIdentifier": "pass.com.balanceroom.member",
  "serialNumber": "MEMBER-12345",
  "teamIdentifier": "YOUR_TEAM_ID",
  
  "organizationName": "Balance Room Pilates",
  "description": "Membresía Balance Room Pilates",
  "logoText": "BALANCE ROOM PILATES",
  
  "foregroundColor": "rgb(255, 255, 255)",
  "backgroundColor": "rgb(232, 213, 208)",
  "labelColor": "rgb(159, 123, 123)",
  
  "storeCard": {
    "headerFields": [
      {
        "key": "plan",
        "label": "PLAN",
        "value": "MEMBER"
      }
    ],
    "primaryFields": [
      {
        "key": "membership",
        "label": "MEMBRESÍA",
        "value": "Plan Member"
      }
    ],
    "secondaryFields": [
      {
        "key": "classes",
        "label": "CLASES",
        "value": "5 restantes"
      },
      {
        "key": "expiry",
        "label": "VÁLIDO",
        "value": "15 feb 2026",
        "dateStyle": "PKDateStyleMedium"
      }
    ],
    "auxiliaryFields": [
      {
        "key": "points",
        "label": "PUNTOS",
        "value": "0 pts"
      },
      {
        "key": "days",
        "label": "DÍAS",
        "value": "26 restantes"
      }
    ]
  },
  
  "barcode": {
    "format": "PKBarcodeFormatQR",
    "message": "BALANCE-ROOM-MEMBER-12345",
    "messageEncoding": "iso-8859-1"
  },
  
  "relevantDate": "2026-02-15T10:00:00Z",
  
  "expirationDate": "2026-02-15T23:59:59Z"
}
```

### 6.3 Cloud Functions para Wallet

```typescript
// functions/wallet.ts

// Crear pass cuando paga inscripción
export const onMembershipPayment = functions.firestore
  .document('pagosInscripcion/{paymentId}')
  .onCreate(async (snap, context) => {
    const payment = snap.data();
    const userId = payment.userId;
    
    // Obtener datos del usuario
    const userDoc = await admin.firestore().doc(`usuarios/${userId}`).get();
    const user = userDoc.data();
    
    // Generar pass
    const passData = {
      nombre: user.nombre,
      clases: user.clasesRestantes,
      fechaVencimiento: payment.periodoFin,
      memberId: `MEMBER-${userId.substring(0, 8).toUpperCase()}`,
    };
    
    const passUrl = await generateAppleWalletPass(passData);
    
    // Guardar URL en usuario
    await admin.firestore().doc(`usuarios/${userId}`).update({
      'wallet.passUrl': passUrl,
      'wallet.activo': true,
      'wallet.passId': passData.memberId,
    });
    
    // Enviar email con pass
    await sendEmail(user.email, 'Tu Wallet Pass de Balance Room', {
      template: 'wallet-pass',
      data: { passUrl, nombre: user.nombre }
    });
  });

// Actualizar pass cuando compra clases
export const onClassPurchase = functions.firestore
  .document('compras/{purchaseId}')
  .onCreate(async (snap, context) => {
    const purchase = snap.data();
    
    if (!purchase.userId) return; // Es invitada
    
    const userDoc = await admin.firestore().doc(`usuarios/${purchase.userId}`).get();
    const user = userDoc.data();
    
    if (!user.wallet?.passId) return; // No tiene pass
    
    // Actualizar pass con nuevas clases
    await updateAppleWalletPass(user.wallet.passId, {
      clases: user.clasesRestantes + purchase.clasesCompradas,
    });
    
    // Push notification al wallet
    await sendPassUpdateNotification(user.wallet.passId);
  });

// Verificar vencimientos diariamente
export const checkMembershipExpiry = functions.pubsub
  .schedule('0 6 * * *') // 6 AM todos los días
  .timeZone('America/Mexico_City')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    
    // Buscar membresías que vencen hoy
    const expiringToday = await admin.firestore()
      .collection('usuarios')
      .where('membresía.estado', '==', 'activa')
      .where('membresía.fechaVencimiento', '<=', now)
      .get();
    
    for (const doc of expiringToday.docs) {
      const user = doc.data();
      
      // Actualizar estado
      await doc.ref.update({
        'membresía.estado': 'vencida'
      });
      
      // Actualizar wallet pass
      if (user.wallet?.passId) {
        await updateAppleWalletPass(user.wallet.passId, {
          estado: 'RENOVAR',
          colorFondo: 'rgb(200, 150, 150)', // Color más apagado
        });
      }
      
      // Enviar email
      await sendEmail(user.email, 'Tu membresía ha vencido', {
        template: 'membership-expired',
        data: { nombre: user.nombre }
      });
    }
  });
```

---

## 📊 7. PANEL DE ADMINISTRACIÓN

### 7.1 Dashboard Principal

```
┌─────────────────────────────────────────────────────────────────────┐
│  BALANCE ROOM PILATES - ADMIN                          👤 Admin  [Salir] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│
│  │   MIEMBROS  │  │   VENTAS    │  │   CLASES    │  │  POR VENCER ││
│  │    ACTIVOS  │  │    HOY      │  │    HOY      │  │   (30 días) ││
│  │             │  │             │  │             │  │             ││
│  │     127     │  │   $4,200    │  │     18      │  │      12     ││
│  │   +5 esta   │  │  +$800 vs   │  │  85% cap.   │  │   enviar    ││
│  │   semana    │  │  ayer       │  │             │  │   recordat. ││
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘│
│                                                                     │
│  ═══════════════════════════════════════════════════════════════    │
│                                                                     │
│  ACTIVAR MEMBRESÍA MANUAL                                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Buscar usuario: [_______________________] [🔍]             │    │
│  │                                                             │    │
│  │  Usuario: María García (maria@email.com)                    │    │
│  │  Estado actual: Registrada (sin membresía)                  │    │
│  │  Clases restantes: 0                                        │    │
│  │                                                             │    │
│  │  Método de pago: [Efectivo ▼]                               │    │
│  │  Referencia: [_______________________]                      │    │
│  │                                                             │    │
│  │  [✓ Activar Membresía - $500]                               │    │
│  │                                                             │    │
│  │  Esto generará su Wallet Pass automáticamente               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Gestión de Membresías

```
┌─────────────────────────────────────────────────────────────────────┐
│  MEMBRESÍAS                                      [+ Nueva] [Export] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Filtros: [Todas ▼] [Este mes ▼] [Buscar...]                       │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Nombre          │ Email           │ Estado  │ Vence    │ Acc. │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ María García    │ maria@mail.com  │ 🟢 Activa│ 15/12/26 │ ••• │  │
│  │ Ana López       │ ana@mail.com    │ 🟢 Activa│ 20/01/27 │ ••• │  │
│  │ Carmen Ruiz     │ carmen@mail.com │ 🟡 30d   │ 22/02/26 │ ••• │  │
│  │ Laura Torres    │ laura@mail.com  │ 🔴 Venc. │ 10/01/26 │ ••• │  │
│  │ Sofia Méndez    │ sofia@mail.com  │ ⚪ Ninguna│ -        │ ••• │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ••• = Ver perfil, Renovar manual, Agregar clases, Enviar pass     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ 8. CONSIDERACIONES TÉCNICAS

### 8.1 Seguridad

```typescript
// Firestore Security Rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Usuarios solo pueden leer/escribir su propio documento
    match /usuarios/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false; // Solo Cloud Functions
    }
    
    // Productos son públicos para lectura
    match /productos/{productId} {
      allow read: if true;
      allow write: if false; // Solo admin
    }
    
    // Compras: usuario puede leer las suyas
    match /compras/{compraId} {
      allow read: if request.auth != null && 
                    resource.data.userId == request.auth.uid;
      allow create: if false; // Solo Cloud Functions post-pago
    }
    
    // Pagos de inscripción: solo lectura para el usuario
    match /pagosInscripcion/{pagoId} {
      allow read: if request.auth != null && 
                    resource.data.userId == request.auth.uid;
      allow write: if false; // Solo Cloud Functions
    }
  }
}
```

### 8.2 Validaciones de Compra (Cloud Function)

```typescript
// functions/validatePurchase.ts

interface PurchaseValidation {
  valid: boolean;
  error?: string;
  requiredAction?: 'login' | 'activate_membership' | 'renew_membership';
}

async function validatePurchase(
  userId: string | null,
  productoId: string,
  invitadaEmail?: string
): Promise<PurchaseValidation> {
  
  const producto = await getProducto(productoId);
  
  if (!producto) {
    return { valid: false, error: 'Producto no encontrado' };
  }
  
  // Clase muestra: cualquiera puede comprar
  if (producto.tipo === 'clase_muestra') {
    // Verificar límite de 1 por persona
    const previousPurchases = await checkPreviousClaseMuestra(
      userId || invitadaEmail
    );
    
    if (previousPurchases > 0) {
      return { 
        valid: false, 
        error: 'Ya has tomado una clase muestra anteriormente' 
      };
    }
    
    return { valid: true };
  }
  
  // Paquetes requieren membresía
  if (producto.requiereMembresía) {
    if (!userId) {
      return { 
        valid: false, 
        error: 'Debes iniciar sesión',
        requiredAction: 'login'
      };
    }
    
    const user = await getUser(userId);
    
    if (user.membresía.estado === 'ninguna') {
      return {
        valid: false,
        error: 'Necesitas activar tu membresía para acceder a este precio',
        requiredAction: 'activate_membership'
      };
    }
    
    if (user.membresía.estado === 'vencida') {
      return {
        valid: false,
        error: 'Tu membresía ha vencido. Renueva para seguir comprando paquetes',
        requiredAction: 'renew_membership'
      };
    }
    
    // Membresía activa
    return { valid: true };
  }
  
  return { valid: true };
}
```

### 8.3 Emails Automatizados

| Trigger | Template | Contenido |
|---------|----------|-----------|
| Registro | welcome | Bienvenida + beneficios de membresía |
| Compra clase muestra | purchase-confirmation | Confirmación + QR + cómo llegar |
| Activa membresía | membership-activated | Wallet Pass + beneficios |
| Compra paquete | purchase-confirmation | Clases agregadas + saldo |
| 30 días antes de vencer | membership-reminder-30 | Recordatorio suave |
| 7 días antes de vencer | membership-reminder-7 | Urgencia moderada |
| Día de vencimiento | membership-expiring-today | Última oportunidad |
| Membresía vencida | membership-expired | Acceso limitado + renovar |
| Renovación exitosa | membership-renewed | Nuevo período + wallet actualizado |

---

## 📅 9. CRONOGRAMA DE IMPLEMENTACIÓN

### Fase 1: MVP (2 semanas)
- [ ] Modelo de datos en Firebase
- [ ] Página de precios con lógica de estados
- [ ] Checkout para clase muestra (invitada)
- [ ] Registro de usuarios
- [ ] Activación manual de membresía (admin)

### Fase 2: Pagos Online (1 semana)
- [ ] Integración Stripe
- [ ] Checkout completo para todos los productos
- [ ] Webhooks de confirmación

### Fase 3: Wallet Pass (1 semana)
- [ ] Generación de passes
- [ ] Actualización automática
- [ ] Push notifications

### Fase 4: Automatización (1 semana)
- [ ] Cloud Functions para vencimientos
- [ ] Emails automatizados
- [ ] Recordatorios

### Fase 5: Admin Completo (1 semana)
- [ ] Dashboard de métricas
- [ ] Gestión de membresías
- [ ] Reportes

---

## ❓ 10. PREGUNTAS PARA DEFINIR

1. **Clase muestra**: ¿Puede repetir después de cierto tiempo (ej. 1 año)?

2. **Clases no usadas**: Cuando vence la membresía, ¿las clases compradas se mantienen indefinidamente o también expiran?

3. **Período de gracia**: ¿Hay días de gracia después del vencimiento antes de bloquear paquetes?

4. **Precios públicos**: ¿Habrá algún paquete disponible para no-miembros además de la clase muestra?

5. **Congelamiento**: ¿Se puede pausar/congelar la membresía (ej. por viaje)?

6. **Transferencia**: ¿Las clases son transferibles entre personas?

7. **Reembolsos**: ¿Política de reembolso para clases no usadas?

8. **Métodos de pago**: Además de tarjeta, ¿aceptan OXXO, transferencia, efectivo?

---

## 📎 ANEXOS

### A. Ejemplo de Email de Activación

```
Asunto: 🎉 ¡Bienvenida a la familia Balance Room, [Nombre]!

[Logo]

¡Hola [Nombre]!

Tu membresía está activa. Ahora tienes acceso a:

✓ Precios exclusivos de miembro
✓ Tu Wallet Pass digital
✓ Reservas prioritarias
✓ Promociones especiales

[Botón: Agregar a Apple Wallet]
[Botón: Agregar a Google Wallet]

Tu membresía es válida hasta: [Fecha]

¿Lista para tu primera clase?
[Botón: Reservar Clase]

Con cariño,
Equipo Balance Room Pilates
```

### B. Textos para UI

**Modal de membresía bloqueada:**
> "Este precio es exclusivo para miembros. Activa tu membresía anual por $500 y accede a paquetes desde $120/clase. Además recibirás tu Wallet Pass digital para llevar tus clases siempre contigo."

**Banner de vencimiento próximo:**
> "Tu membresía vence en [X] días. Renueva ahora para seguir disfrutando de precios exclusivos."

**Confirmación de clase muestra:**
> "¡Gracias por tu compra! Te esperamos en Balance Room Pilates. Presenta el código QR de tu confirmación al llegar."
