FROM node:20-alpine

WORKDIR /app

COPY frontend/package.json ./
RUN npm install --omit=dev

# Copy vendor UMD bundles into public/
RUN cp node_modules/react/umd/react.production.min.js public/react.production.min.js 2>/dev/null; true
RUN cp node_modules/react-dom/umd/react-dom.production.min.js public/react-dom.production.min.js 2>/dev/null; true
RUN cp node_modules/@babel/standalone/babel.min.js public/babel.min.js 2>/dev/null; true

COPY frontend/ .

# Ensure vendor files exist (copy from node_modules if not already in public/)
RUN cp -n node_modules/react/umd/react.production.min.js public/react.production.min.js 2>/dev/null; true
RUN cp -n node_modules/react-dom/umd/react-dom.production.min.js public/react-dom.production.min.js 2>/dev/null; true
RUN cp -n node_modules/@babel/standalone/babel.min.js public/babel.min.js 2>/dev/null; true

EXPOSE 3000

CMD ["node", "server.js"]
