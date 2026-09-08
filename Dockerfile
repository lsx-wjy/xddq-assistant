FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist-dashboard ./dist-dashboard
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/account.js.sample ./account.js

RUN mkdir -p /app/data /app/logs

EXPOSE 4173
VOLUME ["/app/data", "/app/logs"]

CMD ["node", "scripts/dashboard-server.mjs"]
