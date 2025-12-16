FROM oven/bun:1 AS base
WORKDIR /app

# Install system dependencies for Sharp (image processing)
RUN apt-get update && apt-get install -y \
    libvips-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
FROM base AS install
RUN bun install --frozen-lockfile --production

# Copy source code and build
FROM base AS build
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build

# Production image
FROM base AS runtime
ENV NODE_ENV=production

# Copy built application
COPY --from=build /app/.output ./.output
COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle.config.ts ./

# Create necessary directories
RUN mkdir -p data public/uploads

# Set working directory
WORKDIR /app

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start application
CMD ["bun", "--bun", ".output/server/index.mjs"]

