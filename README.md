# Next.js Static Export with Nginx & Docker

This repository contains a modern **Next.js (v16)** application configured for **Static HTML Export**, containerized using a multi-stage **Docker** build, and served securely via an unprivileged **Nginx** container.

## Architectural Overview

- **Framework**: Next.js 16 (React 19, TailwindCSS v4)
- **Deployment Strategy**: Static Export (`output: "export"`)
- **Containerization**: Multi-stage Docker build separating dependencies, build process, and production serving.
- **Web Server**: `nginxinc/nginx-unprivileged:alpine3.22` (serving on port `8080`)
- **Package Manager**: pnpm

## Local Development

To run the development server locally:

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Docker Deployment (Production Ready)

The project includes a multi-stage `Dockerfile` and a `compose.yml` to build and serve the production-ready static assets seamlessly.

### Using Docker Compose

The simplest way to run the production build locally is using Docker Compose:

```bash
# Build and start the container in the background
docker compose up -d --build
```

The application will be served at [http://localhost:8080](http://localhost:8080).

To stop the container:
```bash
docker compose down
```

### Manual Docker Build

If you prefer building and running the Docker container manually:

```bash
# Build the Docker image
docker build -t nextjs-static-export .

# Run the Docker container mapping port 8080
docker run -p 8080:8080 nextjs-static-export
```

## How It Works

1. **Dependencies Stage**: Uses `node:24.13.0-slim` to install dependencies via `pnpm` utilizing a cache mount for faster reproducible builds.
2. **Builder Stage**: Builds the Next.js application. Because `next.config.ts` sets `output: "export"`, Next.js compiles the application into static HTML/CSS/JS files inside the `/app/out` directory.
3. **Runner Stage**: Uses `nginxinc/nginx-unprivileged` to serve the static contents. The `out` directory is copied into the Nginx HTML path, and an included `nginx.conf` handles the routing safely without root privileges.