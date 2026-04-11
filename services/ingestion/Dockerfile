FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY services/ingestion/package.json ./
RUN npm install --omit=dev

# Copy shared module
COPY shared/ ./shared/

# Copy service source
COPY services/ingestion/ ./

ENV SHARED_PATH=./shared
EXPOSE 3001

CMD ["node", "server.js"]
