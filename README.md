# postguard-docs

Documentation site for the PostGuard SDK.

## Browser compatibility

The SDK (`@e4a/pg-js`) runs in any browser that supports WebAssembly and the [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API). In practice, this means:

| Browser | Minimum version |
|---------|----------------|
| Chrome / Edge | 67+ |
| Firefox | 65+ |
| Safari | 15.2+ |

Internet Explorer is not supported.

For Node.js, version 18 or higher is required.

The SDK uses WebAssembly internally for encryption and decryption. No polyfills are needed — the SDK handles this itself.
