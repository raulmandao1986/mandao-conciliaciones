# Mandao Conciliaciones

Plataforma interna de gestión administrativa y financiera del ecosistema Mandao (React 19 + Vite + Supabase). Acceso restringido a cuentas `@mandao.app`.

Documentación funcional completa (roles, módulos, reglas de negocio, esquema de base de datos, hosting): [`Instrucciones Conciliaciones Mandao.md`](./Instrucciones%20Conciliaciones%20Mandao.md).

## Correr en local

**Requisitos:** Node.js 20+.

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Crear `.env.local` (a partir de `.env.example`) con:
   ```
   SUPABASE_URL=https://<tu-proyecto>.supabase.co
   SUPABASE_ANON_KEY=<tu-anon-key>
   ```
3. Levantar el servidor de desarrollo:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` — servidor de desarrollo (Vite, puerto 3000)
- `npm run build` — build de producción a `dist/`
- `npm run lint` — type-check (`tsc --noEmit`)
- `npm run preview` — sirve el build de `dist/` en local

## Despliegue a producción (Google Cloud Run)

Ver la sección 20 de [`Instrucciones Conciliaciones Mandao.md`](./Instrucciones%20Conciliaciones%20Mandao.md) para el detalle completo. Resumen rápido, con el `Dockerfile` de la raíz:

```bash
gcloud builds submit \
  --tag gcr.io/<PROYECTO_GCP>/mandao-conciliaciones \
  --substitutions=_SUPABASE_URL=<url>,_SUPABASE_ANON_KEY=<anon-key>

gcloud run deploy mandao-conciliaciones \
  --image gcr.io/<PROYECTO_GCP>/mandao-conciliaciones \
  --region <region> \
  --allow-unauthenticated
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` se incrustan en el bundle en tiempo de **build** (no de runtime), por eso van como build args/substitutions y no como variables de entorno del servicio de Cloud Run.
