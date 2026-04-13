# postguard-docs

Documentation site for [PostGuard](https://postguard.eu), an identity-based encryption system. Built with [VitePress](https://vitepress.dev).

## Browser Compatibility

The PostGuard SDK (`@e4a/pg-js`) uses WebAssembly and top-level `await`. It requires a modern browser that supports both features:

- Chrome / Edge 89+
- Firefox 89+
- Safari 15+

Node.js 18+ is supported for server-side use. No polyfills are needed in any environment.

## Development

```bash
npm install
npm run docs:dev
```
