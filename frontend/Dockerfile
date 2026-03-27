FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG VITE_API_URL=""
ARG VITE_TURN_URL=""
ARG VITE_TURN_USER=""
ARG VITE_TURN_PASS=""
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile.static /etc/caddy/Caddyfile
EXPOSE 80
