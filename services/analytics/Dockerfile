# ---------- Sandbox Analytics Service ----------
# Security constraints (enforced at orchestration layer):
#   - Read-only filesystem (--read-only flag in Docker/K8s)
#   - No network egress in production (network policy / --network=none)
#   - No host mounts or privileged capabilities
#   - Memory and CPU limits enforced via cgroup constraints
#   - Runs as non-root user inside the container

FROM node:20-alpine
WORKDIR /app

# Install production dependencies
COPY services/analytics/package.json ./
RUN npm install --omit=dev

# Copy shared module
COPY shared/ ./shared/

# Copy service source
COPY services/analytics/ ./

ENV SHARED_PATH=./shared
EXPOSE 3004
CMD ["node", "server.js"]
