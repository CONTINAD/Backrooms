# Container image for any host that runs Docker (Fly.io, Railway, Render, Cloud Run, etc.)
FROM node:20-alpine
WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
ENV SOLANA_NETWORK=devnet
# Hosts inject PORT; the server reads process.env.PORT (defaults to 8080).
EXPOSE 8080
CMD ["npm", "start"]
