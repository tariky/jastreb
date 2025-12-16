# Jastreb Deployment Guide

This guide covers deploying the Jastreb marketing application to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Database Setup](#database-setup)
4. [Build Process](#build-process)
5. [Deployment Options](#deployment-options)
   - [VPS Deployment](#vps-deployment)
   - [Docker Deployment](#docker-deployment)
   - [Cloud Platform Deployment](#cloud-platform-deployment)
6. [Production Configuration](#production-configuration)
7. [Post-Deployment](#post-deployment)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Bun** (v1.3.3 or later) - Runtime and package manager
- **Node.js** (v18+ recommended) - For some native dependencies
- **SQLite3** - Database (included with better-sqlite3)
- **System dependencies** for Sharp (image processing):
  - Ubuntu/Debian: `apt-get install libvips-dev`
  - Alpine: `apk add vips-dev`
  - macOS: `brew install vips`

### System Requirements

- **CPU**: 2+ cores recommended
- **RAM**: 2GB minimum, 4GB+ recommended
- **Storage**: 10GB+ (depends on media storage)
- **Network**: Outbound HTTPS access for API calls

---

## Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Application
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=./prod.db

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
SESSION_SECRET=your-session-secret-change-this-too

# Google Gen AI (Gemini)
GOOGLE_AI_API_KEY=your-google-ai-api-key

# S3 Storage (Scaleway Object Storage)
S3_ACCESS_KEY=your-scaleway-access-key
S3_SECRET_KEY=your-scaleway-secret-key
S3_REGION=fr-par
S3_ENDPOINT=https://s3.fr-par.scw.cloud
S3_BUCKET=jastreb-media

# Local Storage Fallback (if S3 not configured)
LOCAL_STORAGE_DIR=./public/uploads

# CORS (if needed)
ALLOWED_ORIGINS=https://yourdomain.com
```

### Generating Secrets

Generate secure secrets:

```bash
# Generate JWT secret (32+ characters)
openssl rand -base64 32

# Generate session secret
openssl rand -base64 32
```

### Environment-Specific Files

- `.env` - Production (DO NOT commit)
- `.env.local` - Local development (DO NOT commit)
- `.env.example` - Template (safe to commit)

---

## Database Setup

### Initial Setup

1. **Create database directory** (if using relative path):

   ```bash
   mkdir -p data
   ```

2. **Initialize database schema**:

   ```bash
   bun run db:push
   ```

   This creates the SQLite database and applies all schema changes.

### Database Location

- **Development**: `./dev.db` (default)
- **Production**: Set via `DATABASE_URL` environment variable
  - Example: `DATABASE_URL=./data/prod.db`
  - Or absolute path: `DATABASE_URL=/var/lib/jastreb/prod.db`

### Database Migrations

For production, use migrations instead of `db:push`:

```bash
# Generate migrations
bun run db:generate

# Apply migrations
bun run db:migrate
```

### Backup Strategy

**Manual Backup**:

```bash
# Backup database
cp prod.db prod.db.backup.$(date +%Y%m%d_%H%M%S)

# Restore from backup
cp prod.db.backup.20240101_120000 prod.db
```

**Automated Backup** (cron job):

```bash
# Add to crontab (crontab -e)
0 2 * * * cd /path/to/jastreb && cp prod.db backups/prod.db.$(date +\%Y\%m\%d)
```

---

## Build Process

### Production Build

```bash
# Install dependencies
bun install --production

# Build application
bun run build
```

The build process:

1. Compiles TypeScript
2. Bundles frontend assets
3. Prepares server-side code
4. Outputs to `.output/` directory

### Build Output

After building, you'll find:

- `.output/server/` - Server files
- `.output/public/` - Static assets
- `.output/nitro.json` - Nitro configuration

### Verify Build

```bash
# Test production build locally
bun run preview
```

---

## Deployment Options

### VPS Deployment

#### 1. Server Setup (Ubuntu/Debian)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install system dependencies
sudo apt-get install -y libvips-dev build-essential

# Install PM2 (process manager)
bun install -g pm2
```

#### 2. Application Setup

```bash
# Clone repository
git clone https://github.com/yourusername/jastreb.git
cd jastreb

# Install dependencies
bun install --production

# Create environment file
cp .env.example .env
nano .env  # Edit with your values

# Initialize database
bun run db:push

# Build application
bun run build
```

#### 3. Run with PM2

Create `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: "jastreb",
      script: ".output/server/index.mjs",
      cwd: "/path/to/jastreb",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_memory_restart: "1G",
    },
  ],
};
```

Start application:

```bash
# Start
pm2 start ecosystem.config.cjs

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

#### 4. Nginx Reverse Proxy

Install Nginx:

```bash
sudo apt install nginx
```

Create `/etc/nginx/sites-available/jastreb`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # Proxy to application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static files (if using local storage)
    location /uploads {
        alias /path/to/jastreb/public/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/jastreb /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 5. SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

### Docker Deployment

#### 1. Create Dockerfile

Create `Dockerfile`:

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Install system dependencies for Sharp
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
FROM base AS install
RUN bun install --frozen-lockfile --production

# Copy source code
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

# Create directories
RUN mkdir -p data public/uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --bun .output/server/index.mjs --health || exit 1

# Start application
CMD ["bun", "--bun", ".output/server/index.mjs"]
```

#### 2. Create docker-compose.yml

```yaml
version: "3.8"

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=./data/prod.db
      - JWT_SECRET=${JWT_SECRET}
      - SESSION_SECRET=${SESSION_SECRET}
      - GOOGLE_AI_API_KEY=${GOOGLE_AI_API_KEY}
      - S3_ACCESS_KEY=${S3_ACCESS_KEY}
      - S3_SECRET_KEY=${S3_SECRET_KEY}
      - S3_REGION=${S3_REGION}
      - S3_ENDPOINT=${S3_ENDPOINT}
      - S3_BUCKET=${S3_BUCKET}
    volumes:
      - ./data:/app/data
      - ./public/uploads:/app/public/uploads
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
```

#### 3. Build and Run

```bash
# Build image
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### 4. Initialize Database

```bash
# Run database setup
docker-compose exec app bun run db:push
```

---

### Cloud Platform Deployment

#### Vercel / Netlify

These platforms require serverless configuration. TanStack Start with Nitro supports serverless deployment.

**Vercel**:

1. Install Vercel CLI: `bun add -g vercel`
2. Deploy: `vercel --prod`
3. Set environment variables in Vercel dashboard

**Note**: SQLite may not work well on serverless platforms. Consider migrating to PostgreSQL or using a managed database.

#### Railway

1. Connect GitHub repository
2. Set environment variables
3. Railway auto-detects Bun and builds
4. Database: Use Railway's PostgreSQL addon

#### Render

1. Create new Web Service
2. Connect repository
3. Build command: `bun install && bun run build`
4. Start command: `bun --bun .output/server/index.mjs`
5. Set environment variables

---

## Production Configuration

### Performance Optimization

1. **Enable Gzip** (Nginx config above)
2. **CDN for Static Assets**: Use Cloudflare or similar
3. **Database Indexing**: Already configured in schema
4. **Image Optimization**: Sharp handles this automatically

### Security Hardening

1. **HTTPS Only**: Enforce SSL/TLS
2. **Security Headers**: Add to Nginx config
3. **Rate Limiting**: Consider adding rate limiting middleware
4. **Input Validation**: Already implemented with Zod
5. **SQL Injection**: Drizzle ORM prevents this

### File Permissions

```bash
# Set proper permissions
chmod 600 .env
chmod 644 prod.db
chmod -R 755 public/uploads
```

---

## Post-Deployment

### Initial Setup

1. **Create Admin User**:
   - Register via `/auth/register`
   - Or create directly in database (hash password with bcrypt)

2. **Configure WooCommerce Connection**:
   - Go to Settings → WooCommerce
   - Add your store URL and API credentials
   - Test connection

3. **Sync Products**:
   - Go to Products page
   - Click "Sync Products"
   - Select connection and options

4. **Configure Storage**:
   - Set up S3 credentials (recommended)
   - Or use local storage fallback

### Health Checks

Create a health check endpoint or use:

```bash
curl http://localhost:3000/
```

---

## Monitoring & Maintenance

### Logs

**PM2 Logs**:

```bash
pm2 logs jastreb
pm2 logs jastreb --lines 100
```

**Docker Logs**:

```bash
docker-compose logs -f app
```

### Monitoring Tools

- **PM2 Monitoring**: `pm2 monit`
- **Uptime Monitoring**: UptimeRobot, Pingdom
- **Error Tracking**: Sentry (optional)

### Database Maintenance

**Vacuum Database** (reclaim space):

```bash
sqlite3 prod.db "VACUUM;"
```

**Check Database Size**:

```bash
ls -lh prod.db
```

**Analyze Tables**:

```bash
sqlite3 prod.db "ANALYZE;"
```

### Backup Automation

Create `/usr/local/bin/jastreb-backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/jastreb"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
cp /path/to/jastreb/prod.db $BACKUP_DIR/prod.db.$DATE

# Backup uploads (if local)
tar -czf $BACKUP_DIR/uploads.$DATE.tar.gz /path/to/jastreb/public/uploads

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
```

Make executable and add to cron:

```bash
chmod +x /usr/local/bin/jastreb-backup.sh
# Add to crontab: 0 2 * * * /usr/local/bin/jastreb-backup.sh
```

---

## Troubleshooting

### Application Won't Start

1. **Check logs**: `pm2 logs` or `docker-compose logs`
2. **Verify environment variables**: Ensure all required vars are set
3. **Check port**: Ensure port 3000 is available
4. **Database permissions**: Ensure database file is writable

### Database Errors

1. **Locked database**: Check for other processes accessing DB
2. **Corruption**: Restore from backup
3. **Permissions**: Ensure read/write permissions

### Image Processing Fails

1. **Sharp dependencies**: Install `libvips-dev`
2. **Memory**: Increase available memory
3. **File permissions**: Check upload directory permissions

### S3 Upload Fails

1. **Credentials**: Verify S3 keys are correct
2. **Bucket permissions**: Ensure bucket allows uploads
3. **Network**: Check outbound HTTPS access
4. **Fallback**: Application will use local storage if S3 fails

### High Memory Usage

1. **Image processing**: Limit concurrent image operations
2. **Database**: Vacuum database regularly
3. **Cache**: Clear image cache if using local storage

---

## Scaling Considerations

### Horizontal Scaling

SQLite doesn't support multiple writers. For scaling:

1. **Migrate to PostgreSQL**: Better for multi-instance deployments
2. **Use read replicas**: Separate read/write operations
3. **Load balancer**: Distribute traffic across instances

### Vertical Scaling

1. **Increase RAM**: For larger databases and image processing
2. **SSD Storage**: Faster database and file access
3. **CPU**: More cores for concurrent requests

---

## Support

For issues or questions:

- Check logs first
- Review this guide
- Check GitHub issues
- Contact support

---

## Quick Reference

```bash
# Start application
pm2 start ecosystem.config.cjs

# Stop application
pm2 stop jastreb

# Restart application
pm2 restart jastreb

# View logs
pm2 logs jastreb

# Database backup
cp prod.db prod.db.backup.$(date +%Y%m%d_%H%M%S)

# Database restore
cp prod.db.backup.YYYYMMDD_HHMMSS prod.db

# Update application
git pull
bun install --production
bun run build
pm2 restart jastreb
```

---

**Last Updated**: 2024-01-XX
**Version**: 1.0.0
