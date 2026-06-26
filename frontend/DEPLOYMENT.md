# Deployment Guide - Balance Room Pilates

## 🚀 Despliegue Rápido (15 minutos)

### Opción 1: Vercel + Railway (Recomendado)

#### A. Preparación
```bash
# 1. Crear repositorio en GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tu-usuario/balance-room.git
git push -u origin main
```

#### B. Base de Datos (Railway)
1. Ir a [railway.app](https://railway.app)
2. Sign up con GitHub
3. New Project → Provision PostgreSQL
4. Copiar "Postgres Connection URL"

#### C. Backend (Railway)
1. New Service → GitHub Repo
2. Seleccionar tu repositorio
3. Root Directory: `/server`
4. Variables de entorno:
   ```
   NODE_ENV=production
   DATABASE_URL=(pegar URL de Postgres)
   JWT_SECRET=genera-uno-seguro-aqui
   FRONTEND_URL=https://balance-room.vercel.app
   ```
5. Deploy automático ✓

#### D. Frontend (Vercel)
```bash
# Instalar Vercel CLI
npm i -g vercel

# En la raíz del proyecto
vercel

# Seguir prompts:
# - Link to existing project? No
# - Project name: balance-room
# - Root directory: ./
# - Override settings? No

# Configurar variables de entorno
vercel env add VITE_API_URL production
# Valor: https://tu-backend.railway.app
```

#### E. Desplegar cambios futuros
```bash
# Frontend
git push  # Auto-deploy en Vercel

# Backend
git push  # Auto-deploy en Railway
```

---

### Opción 2: Todo en Render

#### Paso 1: Crear cuenta en Render.com
https://render.com

#### Paso 2: Base de Datos
1. New → PostgreSQL
2. Name: `balance-room-db`
3. Plan: Free
4. Crear y guardar "Internal Database URL"

#### Paso 3: Backend
1. New → Web Service
2. Connect repository
3. Configuración:
   - Name: `balance-room-api`
   - Root Directory: `server`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment Variables:
     ```
     NODE_ENV=production
     DATABASE_URL=[Internal Database URL]
     JWT_SECRET=[Auto-generar]
     FRONTEND_URL=https://balance-room.onrender.com
     ```

#### Paso 4: Frontend
1. New → Static Site
2. Connect mismo repositorio
3. Configuración:
   - Name: `balance-room`
   - Root Directory: ./
   - Build Command: `npm run build`
   - Publish Directory: `dist`
   - Environment Variables:
     ```
     VITE_API_URL=https://balance-room-api.onrender.com
     ```

---

## 🔐 Seguridad en Producción

### 1. Generar JWT Secret seguro
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Configurar CORS correctamente
En `server/src/index.ts`, el CORS ya usa `process.env.FRONTEND_URL`

### 3. HTTPS
Vercel y Railway/Render incluyen SSL gratis automáticamente ✓

---

## 📊 Monitoreo

### Railway
- Dashboard → Logs (tiempo real)
- Metrics → Ver uso de recursos

### Vercel
- Dashboard → Deployments → Ver logs
- Analytics (plan Pro)

---

## 🐛 Troubleshooting

### Error: "Cannot connect to database"
```bash
# Verificar DATABASE_URL en Railway/Render
echo $DATABASE_URL

# Debe empezar con postgresql://
```

### Error: CORS
Verificar que `FRONTEND_URL` en backend coincida con tu dominio de Vercel/Render

### Error: 404 en rutas
Vercel needs `vercel.json` con rewrites (ya incluido)

### Backend no responde
Verificar que PORT esté configurado correctamente:
```typescript
const PORT = process.env.PORT || 3002;
```

---

## 💰 Costos Estimados

### Setup Gratis (Suficiente para empezar):
- **Vercel**: Frontend gratis (ilimitado)
- **Railway**: $5/mes crédito gratis
- **PostgreSQL Railway**: Incluido en los $5

### Upgrade cuando crezcas:
- **Railway Pro**: $20/mes (más recursos)
- **Vercel Pro**: $20/mes (más deployments)
- **Database**: $7/mes (más storage)

**Total inicial: $0/mes** 🎉

---

## 📱 Dominio Personalizado

### En Vercel:
1. Settings → Domains
2. Add Domain → `balanceroom.mx`
3. Configurar DNS según instrucciones
4. SSL automático en 24hrs

### Registro de dominio:
- Namecheap: ~$10/año
- GoDaddy: ~$15/año
- Google Domains: ~$12/año

---

## 🔄 CI/CD Automático

Una vez conectado GitHub:
1. Haces cambios localmente
2. `git push`
3. Vercel + Railway despliegan automáticamente
4. Listo! ✓

No necesitas hacer nada más.

---

## ✅ Checklist Pre-Deploy

- [ ] `.env.production` configurado
- [ ] JWT_SECRET generado (64 caracteres)
- [ ] CORS configurado con dominio correcto
- [ ] Build local exitoso: `npm run build`
- [ ] Código en GitHub
- [ ] Variables de entorno en Vercel/Railway
- [ ] Database migrations ejecutadas
- [ ] Test de registro/login en producción

---

## 📞 Soporte

Si algo falla:
1. Revisar logs en Railway/Render Dashboard
2. Verificar variables de entorno
3. Probar endpoints con Postman
4. Revisar CORS en Network tab del navegador
