FROM node:20-alpine
WORKDIR /app

# Install production dependencies
COPY services/fusion/package.json ./
RUN npm install --omit=dev

# Copy shared module
COPY shared/ ./shared/

# Copy service source
COPY services/fusion/ ./

ENV SHARED_PATH=./shared
EXPOSE 3002
CMD ["node", "server.js"]
