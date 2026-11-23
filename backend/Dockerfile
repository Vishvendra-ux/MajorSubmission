FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN addgroup -S sumindiq && adduser -S sumindiq -G sumindiq && \
    mkdir -p /app/data /app/storage/documents && \
    chown -R sumindiq:sumindiq /app

USER sumindiq

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8000/api/v1/health || exit 1

CMD ["npm", "start"]
