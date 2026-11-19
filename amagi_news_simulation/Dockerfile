FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 --create-home nextjs

COPY --from=build --chown=nextjs:nextjs /app /app

USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]
