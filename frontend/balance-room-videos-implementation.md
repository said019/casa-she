# 🎬 Balance Room Pilates - Implementación Sistema de Videos

## 📋 Especificaciones Finales

| Característica | Decisión |
|----------------|----------|
| **Hosting** | Cloudinary |
| **Acceso** | Videos gratuitos + Videos solo miembros |
| **Descargas** | ❌ No permitidas |
| **Comentarios** | ✅ Sí, con moderación |
| **Quien sube** | Solo admin |
| **Frecuencia** | Ocasional |

---

## ☁️ 1. CLOUDINARY - CONFIGURACIÓN

### 1.1 Por qué Cloudinary

```
✅ Plan gratuito: 25 GB storage + 25 GB bandwidth/mes
✅ Streaming adaptativo (HLS)
✅ URLs firmadas (expiran, no se pueden compartir)
✅ Transformaciones on-the-fly (thumbnails automáticos)
✅ Player embebido o custom
✅ Sin anuncios
✅ CDN global incluido
```

### 1.2 Configuración Inicial

```typescript
// lib/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;
```

### 1.3 Variables de Entorno

```env
# .env.local
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz
CLOUDINARY_UPLOAD_PRESET=balance_videos
```

### 1.4 Estructura de Carpetas en Cloudinary

```
balance-room/
├── videos/
│   ├── gratuitos/
│   │   ├── bienvenida-balance-room.mp4
│   │   └── que-es-pilates.mp4
│   └── miembros/
│       ├── tecnica/
│       │   ├── roll-up-correcto.mp4
│       │   └── the-hundred.mp4
│       ├── rutinas/
│       │   └── rutina-15min-manana.mp4
│       └── estiramientos/
│           └── estiramiento-post-clase.mp4
└── thumbnails/
    └── (generados automáticamente)
```

---

## 🗄️ 2. MODELO DE DATOS ACTUALIZADO

### 2.1 Firestore Collections

```typescript
// ============================================
// Collection: videos
// ============================================
interface Video {
  id: string;
  
  // Información básica
  titulo: string;
  slug: string;  // "roll-up-tecnica-correcta"
  descripcion: string;
  duracion: number;  // segundos
  
  // Cloudinary
  cloudinaryId: string;  // "balance-room/videos/miembros/tecnica/roll-up"
  cloudinaryUrl: string;  // URL base (sin firmar)
  thumbnailUrl: string;  // Auto-generado por Cloudinary
  
  // Categorización
  categoria: string;  // ID de categoría
  subcategoria: string;
  tags: string[];
  nivel: 'principiante' | 'intermedio' | 'avanzado' | 'todos';
  
  // Acceso
  acceso: 'gratuito' | 'miembros';
  
  // Estado
  publicado: boolean;
  destacado: boolean;
  orden: number;
  
  // Fechas
  fechaCreacion: Timestamp;
  fechaPublicacion: Timestamp | null;
  fechaActualizacion: Timestamp;
  
  // Stats (denormalizados para lectura rápida)
  vistas: number;
  likes: number;
  comentarios: number;
}

// ============================================
// Collection: categorias_video
// ============================================
interface CategoriaVideo {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  color: string;  // Para UI
  orden: number;
  activa: boolean;
  videoCount: number;
}

// ============================================
// Collection: comentarios_video
// ============================================
interface ComentarioVideo {
  id: string;
  videoId: string;
  
  // Autor
  userId: string;
  userName: string;
  userAvatar: string | null;
  
  // Contenido
  texto: string;
  
  // Moderación
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'reportado';
  motivoRechazo: string | null;
  
  // Respuestas (solo 1 nivel de profundidad)
  esRespuesta: boolean;
  comentarioPadreId: string | null;
  respuestasCount: number;
  
  // Fechas
  fechaCreacion: Timestamp;
  fechaModeracion: Timestamp | null;
  moderadoPor: string | null;
  
  // Interacciones
  likes: number;
}

// ============================================
// Subcolección: usuarios/{userId}/video_historial
// ============================================
interface VideoHistorial {
  videoId: string;
  
  // Progreso
  ultimoSegundo: number;
  porcentajeVisto: number;
  completado: boolean;
  
  // Interacciones
  liked: boolean;
  
  // Fechas
  primeraVista: Timestamp;
  ultimaVista: Timestamp;
  vecesVisto: number;
}

// ============================================
// Subcolección: usuarios/{userId}/video_likes
// ============================================
interface VideoLike {
  videoId: string;
  fecha: Timestamp;
}
```

### 2.2 Índices Firestore

```javascript
// firestore.indexes.json
{
  "indexes": [
    // Videos públicos ordenados
    {
      "collectionGroup": "videos",
      "fields": [
        { "fieldPath": "publicado", "order": "ASCENDING" },
        { "fieldPath": "acceso", "order": "ASCENDING" },
        { "fieldPath": "orden", "order": "ASCENDING" }
      ]
    },
    // Videos por categoría
    {
      "collectionGroup": "videos",
      "fields": [
        { "fieldPath": "publicado", "order": "ASCENDING" },
        { "fieldPath": "categoria", "order": "ASCENDING" },
        { "fieldPath": "orden", "order": "ASCENDING" }
      ]
    },
    // Comentarios aprobados por video
    {
      "collectionGroup": "comentarios_video",
      "fields": [
        { "fieldPath": "videoId", "order": "ASCENDING" },
        { "fieldPath": "estado", "order": "ASCENDING" },
        { "fieldPath": "fechaCreacion", "order": "DESCENDING" }
      ]
    },
    // Comentarios pendientes (para admin)
    {
      "collectionGroup": "comentarios_video",
      "fields": [
        { "fieldPath": "estado", "order": "ASCENDING" },
        { "fieldPath": "fechaCreacion", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## 🔐 3. URLS FIRMADAS (SEGURIDAD)

### 3.1 Generar URL Firmada (Server-side)

```typescript
// lib/cloudinary-signed.ts
import cloudinary from './cloudinary';

interface SignedUrlOptions {
  videoId: string;
  expiresInMinutes?: number;
}

export function generateSignedVideoUrl({ 
  videoId, 
  expiresInMinutes = 120  // 2 horas por defecto
}: SignedUrlOptions): string {
  
  const expirationTime = Math.floor(Date.now() / 1000) + (expiresInMinutes * 60);
  
  // Generar URL firmada que expira
  const signedUrl = cloudinary.url(videoId, {
    resource_type: 'video',
    type: 'authenticated',  // Requiere firma
    sign_url: true,
    expires_at: expirationTime,
    // Streaming adaptativo
    streaming_profile: 'auto',
  });
  
  return signedUrl;
}

// Para thumbnail
export function generateThumbnailUrl(videoId: string): string {
  return cloudinary.url(videoId, {
    resource_type: 'video',
    format: 'jpg',
    transformation: [
      { width: 640, height: 360, crop: 'fill' },
      { quality: 'auto' },
      { start_offset: '10' }  // Frame a los 10 segundos
    ]
  });
}
```

### 3.2 API Route para Obtener URL Firmada

```typescript
// app/api/videos/[videoId]/stream/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { db } from '@/lib/firebase-admin';
import { generateSignedVideoUrl } from '@/lib/cloudinary-signed';

export async function GET(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  try {
    // Obtener video
    const videoDoc = await db.collection('videos').doc(params.videoId).get();
    
    if (!videoDoc.exists) {
      return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 });
    }
    
    const video = videoDoc.data();
    
    // Si es gratuito, devolver URL directamente
    if (video.acceso === 'gratuito') {
      return NextResponse.json({
        url: generateSignedVideoUrl({ 
          videoId: video.cloudinaryId,
          expiresInMinutes: 60 
        }),
        thumbnail: video.thumbnailUrl,
      });
    }
    
    // Si es de miembros, verificar autenticación
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    
    // Verificar membresía
    const userDoc = await db.collection('usuarios').doc(decodedToken.uid).get();
    const user = userDoc.data();
    
    if (user?.membresía?.estado !== 'activa') {
      return NextResponse.json({ 
        error: 'Requiere membresía activa',
        code: 'MEMBERSHIP_REQUIRED'
      }, { status: 403 });
    }
    
    // Generar URL firmada
    const signedUrl = generateSignedVideoUrl({ 
      videoId: video.cloudinaryId,
      expiresInMinutes: 120 
    });
    
    return NextResponse.json({
      url: signedUrl,
      thumbnail: video.thumbnailUrl,
    });
    
  } catch (error) {
    console.error('Error getting video URL:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

---

## 💬 4. SISTEMA DE COMENTARIOS

### 4.1 Reglas de Comentarios

```
┌─────────────────────────────────────────────────────────────────────┐
│                    REGLAS DE COMENTARIOS                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ Quién puede comentar:                                           │
│     • Solo miembros activos (incluso en videos gratuitos)           │
│                                                                     │
│  ✅ Moderación:                                                      │
│     • Comentarios aparecen inmediatamente (post-moderación)         │
│     • Admin puede aprobar/rechazar/eliminar                         │
│     • Usuarios pueden reportar comentarios                          │
│                                                                     │
│  ✅ Estructura:                                                      │
│     • 1 nivel de respuestas (no threads infinitos)                  │
│     • Máximo 500 caracteres por comentario                          │
│     • Likes en comentarios                                          │
│                                                                     │
│  ✅ Notificaciones:                                                  │
│     • Admin recibe notificación de nuevos comentarios               │
│     • Usuario recibe notificación si le responden                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Componente de Comentarios

```typescript
// components/videos/ComentariosSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Comentario {
  id: string;
  texto: string;
  userName: string;
  userAvatar: string | null;
  fechaCreacion: Date;
  likes: number;
  respuestas?: Comentario[];
  esRespuesta: boolean;
}

interface ComentariosSectionProps {
  videoId: string;
}

export function ComentariosSection({ videoId }: ComentariosSectionProps) {
  const { user, membershipStatus } = useAuth();
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canComment = user && membershipStatus === 'activa';

  // Escuchar comentarios en tiempo real
  useEffect(() => {
    const q = query(
      collection(db, 'comentarios_video'),
      where('videoId', '==', videoId),
      where('estado', '==', 'aprobado'),
      where('esRespuesta', '==', false),
      orderBy('fechaCreacion', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const comentariosData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fechaCreacion: doc.data().fechaCreacion?.toDate(),
      })) as Comentario[];
      
      setComentarios(comentariosData);
    });

    return () => unsubscribe();
  }, [videoId]);

  const enviarComentario = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canComment || !nuevoComentario.trim()) return;
    
    setEnviando(true);
    setError(null);

    try {
      const comentarioData = {
        videoId,
        userId: user.uid,
        userName: user.displayName || 'Miembro',
        userAvatar: user.photoURL || null,
        texto: nuevoComentario.trim(),
        estado: 'aprobado',  // O 'pendiente' si quieres pre-moderación
        esRespuesta: !!respondiendo,
        comentarioPadreId: respondiendo || null,
        respuestasCount: 0,
        likes: 0,
        fechaCreacion: serverTimestamp(),
        fechaModeracion: null,
        moderadoPor: null,
        motivoRechazo: null,
      };

      await addDoc(collection(db, 'comentarios_video'), comentarioData);

      // Actualizar contador en video
      await updateDoc(doc(db, 'videos', videoId), {
        comentarios: increment(1)
      });

      // Si es respuesta, actualizar contador en comentario padre
      if (respondiendo) {
        await updateDoc(doc(db, 'comentarios_video', respondiendo), {
          respuestasCount: increment(1)
        });
      }

      setNuevoComentario('');
      setRespondiendo(null);

    } catch (err) {
      console.error('Error al enviar comentario:', err);
      setError('No se pudo enviar el comentario. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const darLike = async (comentarioId: string) => {
    if (!user) return;
    
    // Toggle like (simplificado, en producción usarías subcolección)
    await updateDoc(doc(db, 'comentarios_video', comentarioId), {
      likes: increment(1)
    });
  };

  return (
    <div className="comentarios-section">
      <h3 className="text-lg font-semibold mb-4">
        Comentarios ({comentarios.length})
      </h3>

      {/* Formulario de nuevo comentario */}
      {canComment ? (
        <form onSubmit={enviarComentario} className="mb-6">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-200 flex items-center justify-center flex-shrink-0">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <span className="text-rose-600 font-medium">
                  {user.displayName?.[0] || 'M'}
                </span>
              )}
            </div>
            <div className="flex-1">
              <textarea
                value={nuevoComentario}
                onChange={(e) => setNuevoComentario(e.target.value)}
                placeholder="Escribe un comentario..."
                maxLength={500}
                rows={3}
                className="w-full p-3 border border-stone-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-stone-400">
                  {nuevoComentario.length}/500
                </span>
                <button
                  type="submit"
                  disabled={enviando || !nuevoComentario.trim()}
                  className="px-4 py-2 bg-rose-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-rose-600 transition-colors"
                >
                  {enviando ? 'Enviando...' : 'Comentar'}
                </button>
              </div>
              {error && (
                <p className="text-red-500 text-sm mt-2">{error}</p>
              )}
            </div>
          </div>
        </form>
      ) : (
        <div className="bg-stone-50 rounded-xl p-4 mb-6 text-center">
          {!user ? (
            <p className="text-stone-600">
              <a href="/login" className="text-rose-500 font-medium">Inicia sesión</a>
              {' '}para comentar
            </p>
          ) : (
            <p className="text-stone-600">
              <a href="/membresia" className="text-rose-500 font-medium">Activa tu membresía</a>
              {' '}para comentar
            </p>
          )}
        </div>
      )}

      {/* Lista de comentarios */}
      <div className="space-y-4">
        {comentarios.length === 0 ? (
          <p className="text-stone-400 text-center py-8">
            Sé la primera en comentar 💬
          </p>
        ) : (
          comentarios.map((comentario) => (
            <ComentarioItem
              key={comentario.id}
              comentario={comentario}
              onResponder={() => setRespondiendo(comentario.id)}
              onLike={() => darLike(comentario.id)}
              canInteract={canComment}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Componente individual de comentario
function ComentarioItem({ 
  comentario, 
  onResponder, 
  onLike,
  canInteract 
}: {
  comentario: Comentario;
  onResponder: () => void;
  onLike: () => void;
  canInteract: boolean;
}) {
  const [showRespuestas, setShowRespuestas] = useState(false);

  return (
    <div className="flex gap-3">
      <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center flex-shrink-0">
        {comentario.userAvatar ? (
          <img src={comentario.userAvatar} alt="" className="w-10 h-10 rounded-full" />
        ) : (
          <span className="text-stone-600 font-medium">
            {comentario.userName[0]}
          </span>
        )}
      </div>
      <div className="flex-1">
        <div className="bg-stone-50 rounded-xl p-3">
          <p className="font-medium text-sm text-stone-800">
            {comentario.userName}
          </p>
          <p className="text-stone-600 mt-1">
            {comentario.texto}
          </p>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-stone-400">
          <span>
            {formatRelativeTime(comentario.fechaCreacion)}
          </span>
          {canInteract && (
            <>
              <button 
                onClick={onLike}
                className="hover:text-rose-500 transition-colors"
              >
                ♡ {comentario.likes || ''}
              </button>
              <button 
                onClick={onResponder}
                className="hover:text-rose-500 transition-colors"
              >
                Responder
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  
  return date.toLocaleDateString('es-MX', { 
    day: 'numeric', 
    month: 'short' 
  });
}
```

### 4.3 Moderación de Comentarios (Admin)

```typescript
// app/admin/comentarios/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface ComentarioPendiente {
  id: string;
  videoId: string;
  videoTitulo?: string;
  userId: string;
  userName: string;
  texto: string;
  estado: string;
  fechaCreacion: Date;
}

export default function ModeracionComentarios() {
  const { user, isAdmin } = useAuth();
  const [comentarios, setComentarios] = useState<ComentarioPendiente[]>([]);
  const [filtro, setFiltro] = useState<'pendiente' | 'reportado' | 'todos'>('pendiente');
  const [procesando, setProcesando] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    let q;
    if (filtro === 'todos') {
      q = query(
        collection(db, 'comentarios_video'),
        orderBy('fechaCreacion', 'desc')
      );
    } else {
      q = query(
        collection(db, 'comentarios_video'),
        where('estado', '==', filtro),
        orderBy('fechaCreacion', 'asc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fechaCreacion: doc.data().fechaCreacion?.toDate(),
      })) as ComentarioPendiente[];
      
      setComentarios(data);
    });

    return () => unsubscribe();
  }, [isAdmin, filtro]);

  const aprobarComentario = async (comentarioId: string) => {
    setProcesando(comentarioId);
    try {
      await updateDoc(doc(db, 'comentarios_video', comentarioId), {
        estado: 'aprobado',
        fechaModeracion: serverTimestamp(),
        moderadoPor: user?.uid,
      });
    } finally {
      setProcesando(null);
    }
  };

  const rechazarComentario = async (comentarioId: string, motivo: string) => {
    setProcesando(comentarioId);
    try {
      await updateDoc(doc(db, 'comentarios_video', comentarioId), {
        estado: 'rechazado',
        motivoRechazo: motivo,
        fechaModeracion: serverTimestamp(),
        moderadoPor: user?.uid,
      });
    } finally {
      setProcesando(null);
    }
  };

  const eliminarComentario = async (comentarioId: string, videoId: string) => {
    if (!confirm('¿Eliminar este comentario permanentemente?')) return;
    
    setProcesando(comentarioId);
    try {
      await deleteDoc(doc(db, 'comentarios_video', comentarioId));
      
      // Decrementar contador en video
      await updateDoc(doc(db, 'videos', videoId), {
        comentarios: increment(-1)
      });
    } finally {
      setProcesando(null);
    }
  };

  if (!isAdmin) {
    return <p>No autorizado</p>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Moderación de Comentarios</h1>

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFiltro('pendiente')}
          className={`px-4 py-2 rounded-lg ${
            filtro === 'pendiente' 
              ? 'bg-amber-500 text-white' 
              : 'bg-stone-100'
          }`}
        >
          Pendientes
        </button>
        <button
          onClick={() => setFiltro('reportado')}
          className={`px-4 py-2 rounded-lg ${
            filtro === 'reportado' 
              ? 'bg-red-500 text-white' 
              : 'bg-stone-100'
          }`}
        >
          Reportados
        </button>
        <button
          onClick={() => setFiltro('todos')}
          className={`px-4 py-2 rounded-lg ${
            filtro === 'todos' 
              ? 'bg-stone-800 text-white' 
              : 'bg-stone-100'
          }`}
        >
          Todos
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-4">
        {comentarios.length === 0 ? (
          <p className="text-stone-400 text-center py-12">
            No hay comentarios {filtro === 'pendiente' ? 'pendientes' : 'reportados'}
          </p>
        ) : (
          comentarios.map((comentario) => (
            <div 
              key={comentario.id}
              className="bg-white border border-stone-200 rounded-xl p-4"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium">{comentario.userName}</p>
                  <p className="text-xs text-stone-400">
                    {comentario.fechaCreacion?.toLocaleString('es-MX')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  comentario.estado === 'pendiente' ? 'bg-amber-100 text-amber-700' :
                  comentario.estado === 'reportado' ? 'bg-red-100 text-red-700' :
                  comentario.estado === 'aprobado' ? 'bg-green-100 text-green-700' :
                  'bg-stone-100 text-stone-700'
                }`}>
                  {comentario.estado}
                </span>
              </div>

              <p className="text-stone-700 mb-4 p-3 bg-stone-50 rounded-lg">
                {comentario.texto}
              </p>

              <div className="flex gap-2">
                {comentario.estado !== 'aprobado' && (
                  <button
                    onClick={() => aprobarComentario(comentario.id)}
                    disabled={procesando === comentario.id}
                    className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
                  >
                    ✓ Aprobar
                  </button>
                )}
                {comentario.estado !== 'rechazado' && (
                  <button
                    onClick={() => rechazarComentario(comentario.id, 'Contenido inapropiado')}
                    disabled={procesando === comentario.id}
                    className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-50"
                  >
                    ✗ Rechazar
                  </button>
                )}
                <button
                  onClick={() => eliminarComentario(comentario.id, comentario.videoId)}
                  disabled={procesando === comentario.id}
                  className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 disabled:opacity-50"
                >
                  🗑 Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

---

## 📤 5. SUBIDA DE VIDEOS (ADMIN)

### 5.1 Componente de Subida

```typescript
// components/admin/VideoUploader.tsx
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface VideoUploaderProps {
  onUploadComplete: (result: CloudinaryUploadResult) => void;
}

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  duration: number;
  thumbnail_url: string;
}

export function VideoUploader({ onUploadComplete }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Validar
    if (!file.type.startsWith('video/')) {
      setError('Solo se permiten archivos de video');
      return;
    }

    if (file.size > 500 * 1024 * 1024) { // 500MB límite
      setError('El video no puede superar 500MB');
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      // Obtener firma del servidor
      const signatureRes = await fetch('/api/admin/cloudinary-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: 'balance-room/videos/miembros',
        }),
      });
      
      const { signature, timestamp, cloudName, apiKey } = await signatureRes.json();

      // Subir a Cloudinary
      const formData = new FormData();
      formData.append('file', file);
      formData.append('signature', signature);
      formData.append('timestamp', timestamp);
      formData.append('api_key', apiKey);
      formData.append('folder', 'balance-room/videos/miembros');
      formData.append('resource_type', 'video');

      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setProgress(percentComplete);
        }
      });

      xhr.onload = () => {
        if (xhr.status === 200) {
          const result = JSON.parse(xhr.responseText);
          onUploadComplete({
            public_id: result.public_id,
            secure_url: result.secure_url,
            duration: result.duration,
            thumbnail_url: result.secure_url.replace(/\.[^.]+$/, '.jpg'),
          });
        } else {
          setError('Error al subir el video');
        }
        setUploading(false);
      };

      xhr.onerror = () => {
        setError('Error de conexión');
        setUploading(false);
      };

      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`);
      xhr.send(formData);

    } catch (err) {
      console.error('Upload error:', err);
      setError('Error al subir el video');
      setUploading(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.webm']
    },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-colors
          ${isDragActive ? 'border-rose-400 bg-rose-50' : 'border-stone-300 hover:border-rose-300'}
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        {uploading ? (
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
            <p className="text-stone-600">Subiendo video... {progress}%</p>
            <div className="w-full bg-stone-200 rounded-full h-2">
              <div 
                className="bg-rose-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : isDragActive ? (
          <div>
            <p className="text-rose-500 font-medium">Suelta el video aquí</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl">🎬</div>
            <p className="text-stone-600">
              Arrastra un video o <span className="text-rose-500 font-medium">haz clic para seleccionar</span>
            </p>
            <p className="text-xs text-stone-400">
              MP4, MOV, AVI, WebM • Máximo 500MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-500 text-sm text-center">{error}</p>
      )}
    </div>
  );
}
```

### 5.2 API para Firma de Cloudinary

```typescript
// app/api/admin/cloudinary-signature/route.ts
import { NextRequest, NextResponse } from 'next/server';
import cloudinary from '@/lib/cloudinary';
import { verifyAdminToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Verificar que es admin
    const isAdmin = await verifyAdminToken(request);
    if (!isAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { folder } = await request.json();
    
    const timestamp = Math.round(new Date().getTime() / 1000);
    
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder,
      },
      process.env.CLOUDINARY_API_SECRET!
    );

    return NextResponse.json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });

  } catch (error) {
    console.error('Signature error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

---

## 🖥️ 6. REPRODUCTOR DE VIDEO

### 6.1 Componente VideoPlayer

```typescript
// components/videos/VideoPlayer.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface VideoPlayerProps {
  video: {
    id: string;
    titulo: string;
    cloudinaryId: string;
    duracion: number;
    acceso: 'gratuito' | 'miembros';
  };
  initialProgress?: number;
}

export function VideoPlayer({ video, initialProgress = 0 }: VideoPlayerProps) {
  const { user, membershipStatus } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(initialProgress);
  const lastSavedTime = useRef(initialProgress);

  // Obtener URL firmada
  useEffect(() => {
    async function fetchVideoUrl() {
      try {
        const headers: HeadersInit = {};
        
        if (user) {
          const token = await user.getIdToken();
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`/api/videos/${video.id}/stream`, { headers });
        
        if (!res.ok) {
          const data = await res.json();
          if (data.code === 'MEMBERSHIP_REQUIRED') {
            setError('MEMBERSHIP_REQUIRED');
          } else {
            setError('No se pudo cargar el video');
          }
          return;
        }

        const { url } = await res.json();
        setVideoUrl(url);

      } catch (err) {
        console.error('Error fetching video URL:', err);
        setError('Error de conexión');
      } finally {
        setLoading(false);
      }
    }

    fetchVideoUrl();
  }, [video.id, user]);

  // Guardar progreso cada 10 segundos
  useEffect(() => {
    if (!user || !videoRef.current) return;

    const saveProgress = async () => {
      const video = videoRef.current;
      if (!video) return;

      const currentTime = Math.floor(video.currentTime);
      
      // Solo guardar si cambió significativamente (más de 5 segundos)
      if (Math.abs(currentTime - lastSavedTime.current) < 5) return;
      
      lastSavedTime.current = currentTime;

      const porcentaje = Math.floor((currentTime / video.duration) * 100);
      const completado = porcentaje >= 90;

      await setDoc(
        doc(db, 'usuarios', user.uid, 'video_historial', video.id),
        {
          videoId: video.id,
          ultimoSegundo: currentTime,
          porcentajeVisto: porcentaje,
          completado,
          ultimaVista: serverTimestamp(),
        },
        { merge: true }
      );
    };

    const interval = setInterval(saveProgress, 10000);
    
    return () => clearInterval(interval);
  }, [user, video.id]);

  // Continuar donde dejó
  useEffect(() => {
    if (videoRef.current && initialProgress > 0) {
      videoRef.current.currentTime = initialProgress;
    }
  }, [videoUrl, initialProgress]);

  if (loading) {
    return (
      <div className="aspect-video bg-stone-900 rounded-xl flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error === 'MEMBERSHIP_REQUIRED') {
    return (
      <div className="aspect-video bg-gradient-to-br from-stone-800 to-stone-900 rounded-xl flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-5xl mb-4">🔒</div>
          <h3 className="text-white text-xl font-semibold mb-2">
            Contenido Exclusivo
          </h3>
          <p className="text-stone-400 mb-4">
            Activa tu membresía para ver este video
          </p>
          <a
            href="/membresia"
            className="inline-block px-6 py-3 bg-rose-500 text-white rounded-xl font-medium hover:bg-rose-600 transition-colors"
          >
            Activar Membresía - $500/año
          </a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aspect-video bg-stone-900 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-stone-700 text-white rounded-lg"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        src={videoUrl!}
        className="w-full h-full"
        controls
        controlsList="nodownload"  // Deshabilitar descarga
        onContextMenu={(e) => e.preventDefault()}  // Deshabilitar click derecho
        playsInline
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      >
        Tu navegador no soporta video HTML5.
      </video>
    </div>
  );
}
```

---

## 📁 7. ESTRUCTURA DE ARCHIVOS

```
app/
├── (public)/
│   └── videos/
│       ├── page.tsx                    # Biblioteca pública (muestra gratuitos + promo)
│       └── [slug]/
│           └── page.tsx                # Página de video individual
│
├── (member)/
│   └── videos/
│       ├── page.tsx                    # Biblioteca completa (miembros)
│       └── [slug]/
│           └── page.tsx                # Video con acceso completo
│
├── admin/
│   └── videos/
│       ├── page.tsx                    # Lista de videos
│       ├── nuevo/
│       │   └── page.tsx                # Subir nuevo video
│       ├── [id]/
│       │   └── page.tsx                # Editar video
│       ├── categorias/
│       │   └── page.tsx                # Gestionar categorías
│       └── comentarios/
│           └── page.tsx                # Moderación
│
├── api/
│   ├── videos/
│   │   └── [videoId]/
│   │       └── stream/
│   │           └── route.ts            # URL firmada
│   └── admin/
│       ├── cloudinary-signature/
│       │   └── route.ts                # Firma para upload
│       └── videos/
│           └── route.ts                # CRUD videos
│
components/
├── videos/
│   ├── VideoPlayer.tsx
│   ├── VideoCard.tsx
│   ├── VideoGrid.tsx
│   ├── ComentariosSection.tsx
│   ├── VideosRelacionados.tsx
│   ├── ContinuarViendo.tsx
│   └── FiltrosVideos.tsx
│
└── admin/
    └── videos/
        ├── VideoUploader.tsx
        ├── VideoForm.tsx
        └── VideosList.tsx

lib/
├── cloudinary.ts
└── cloudinary-signed.ts
```

---

## ✅ RESUMEN DE FEATURES

| Feature | Estado | Notas |
|---------|--------|-------|
| Hosting Cloudinary | ✅ | URLs firmadas, sin descarga |
| Videos gratuitos | ✅ | Cualquiera puede ver |
| Videos miembros | ✅ | Solo membresía activa |
| Sin descargas | ✅ | `controlsList="nodownload"` + sin click derecho |
| Comentarios | ✅ | Solo miembros, con moderación |
| Progreso guardado | ✅ | Continuar donde dejó |
| Admin sube videos | ✅ | Drag & drop con progreso |
| Categorías | ✅ | Organizados por tema |
| Búsqueda | ✅ | Por título y tags |

---

¿Quieres que empiece a crear los componentes React completos para implementar esto?
