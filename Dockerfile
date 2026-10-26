FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

FROM dependencies AS build
COPY tsconfig*.json ./
COPY apps ./apps
COPY libs ./libs
COPY docker ./docker
COPY scripts ./scripts
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3004
CMD ["node", "dist/apps/api/main.js"]
