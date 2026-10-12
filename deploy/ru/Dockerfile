ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=${SOURCE_REVISION}
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts/gym-container-env.mjs ./scripts/gym-container-env.mjs
COPY --from=build --chown=node:node /app/lib/gymValkeyTransport.mjs /app/lib/gymBackupStore.mjs ./lib/
COPY --from=build --chown=node:node /app/scripts/gym-runtime.mjs /app/scripts/gym-team-worker.mjs ./scripts/
COPY --from=build --chown=node:node /app/lib/teamQueue.mjs /app/lib/teamQueueWorker.mjs ./lib/
USER 1000:1000
EXPOSE 3000
CMD ["node", "--import", "./scripts/gym-container-env.mjs", "./scripts/gym-runtime.mjs"]
