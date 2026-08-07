# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
# 运行时 require 的根目录 JS（baidu/md5、agora/AccessToken 等）
COPY public ./public
RUN pnpm exec prisma generate \
  && pnpm exec tsc \
  && pnpm prune --prod --ignore-scripts

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
RUN mkdir -p /app/uploadDir
EXPOSE 8010 8020 8030
CMD ["node", "dist/main.js"]
