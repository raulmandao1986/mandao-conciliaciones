# Build del frontend (React + Vite) para desplegar en Cloud Run.
#
# SUPABASE_URL / SUPABASE_ANON_KEY se inyectan como --build-arg porque
# vite.config.ts los incrusta en el bundle en tiempo de BUILD (via
# define/loadEnv), no en tiempo de ejecucion — no son variables de
# entorno normales de un contenedor corriendo.
#
# Ejemplo de build + deploy manual (ver Instrucciones Conciliaciones
# Mandao.md, seccion 20, para el detalle completo):
#
#   gcloud builds submit --tag gcr.io/PROYECTO/mandao-conciliaciones \
#     --substitutions=_SUPABASE_URL=...,_SUPABASE_ANON_KEY=...
#
# o localmente:
#
#   docker build \
#     --build-arg SUPABASE_URL=https://xxx.supabase.co \
#     --build-arg SUPABASE_ANON_KEY=xxxxx \
#     -t mandao-conciliaciones .

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ARG GEMINI_API_KEY
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Cloud Run espera que el contenedor escuche en el puerto 8080 por defecto.
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
