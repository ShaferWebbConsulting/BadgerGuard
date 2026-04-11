FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY simulator.js source-a.js source-b.js ./

CMD ["node", "simulator.js"]
