# postguard-docs

Documentation site for [PostGuard](https://github.com/encryption4all/postguard), built with [VitePress](https://vitepress.dev/).

## Local development

```bash
npm install
npm run docs:dev
```

## Build

```bash
npm run docs:build
npm run docs:preview   # preview the built site
```

## Docker

The CI pipeline builds a Docker image served by nginx:

```bash
docker build -t postguard-docs .
docker run -p 8080:80 postguard-docs
```
