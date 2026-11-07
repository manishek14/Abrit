# ============================================================================
# AbrIT frontend — build once, serve static, PROXY the API + WebSocket.
#   build : npm ci → vite build
#   run   : nginx serves the static bundle AND reverse-proxies:
#             /api/*       → backend:3000        (REST)
#             /socket.io/* → backend:3000        (WebSocket, upgrade supported)
#           Same-origin in production → no CORS exposure, cookies "first-party".
# ============================================================================

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# API/WS base URLs are baked at build time; both default to SAME-ORIGIN paths
# (/api and /socket.io behind this nginx), which is exactly what production wants.
ARG VITE_API_URL=/api
ARG VITE_WS_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache wget
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
