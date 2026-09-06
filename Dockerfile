# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20

# --- deps (full install for the build) ---
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build (compile TypeScript) ---
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npx tsc

# --- prod deps only (smaller runtime image) ---
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- runtime ---
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as a non-root user.
RUN addgroup -S omada && adduser -S -G omada omada

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build    /app/dist          ./dist
COPY package.json ./

USER omada

# Informational only; Docker does not publish this port unless explicitly mapped.
EXPOSE 3000

# Default transport is stdio. For authenticated Streamable HTTP set
# MCP_TRANSPORT=http, MCP_HTTP_ENABLE=true and MCP_HTTP_API_KEY.
ENTRYPOINT ["node", "dist/index.js"]
