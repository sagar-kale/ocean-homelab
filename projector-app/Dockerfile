FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache android-tools
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install
COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist

EXPOSE 3005
CMD ["node", "server/index.js"]
