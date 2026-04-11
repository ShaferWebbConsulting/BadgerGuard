FROM node:20-alpine

WORKDIR /app

COPY services/sources/package.json ./
COPY services/sources/simulator.js services/sources/source-a.js services/sources/source-b.js ./

CMD ["node", "simulator.js"]
