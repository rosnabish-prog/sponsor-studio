FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci
COPY apps/api apps/api
# Prisma generation needs a URL shape, but does not connect to the database.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/placeholder npm run build:api

# Database schema changes require the Prisma CLI and migration files, which are
# build-time tools and deliberately omitted from the smaller API runtime image.
FROM build AS migrations
CMD ["npm", "run", "db:deploy"]

FROM node:22-bookworm-slim
ENV NODE_ENV=production API_PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
