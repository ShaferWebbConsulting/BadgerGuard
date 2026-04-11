FROM node:20-alpine
WORKDIR /app

# Install production dependencies
COPY services/validation/package.json ./
RUN npm install --omit=dev

# Copy shared module
COPY shared/ ./shared/

# Copy service source
COPY services/validation/ ./

ENV SHARED_PATH=./shared
EXPOSE 3003
CMD ["node", "server.js"]
