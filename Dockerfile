FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Copy config example (users can mount their own config.json)
COPY config.json.example ./

# Create a directory for config
RUN mkdir -p /config

# Set environment variables (can be overridden)
ENV HOMEBOX_URL=http://homebox:7745
ENV HOMEBOX_EMAIL=
ENV HOMEBOX_PASSWORD=

# The server will look for config in this order:
# 1. /config/config.json (mounted volume)
# 2. Environment variables
# 3. ./config.json (in the app directory)

ENV PORT=8811

CMD ["node", "dist/index.js"]
