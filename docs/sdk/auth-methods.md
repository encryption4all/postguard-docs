# Authentication Methods

PostGuard requires the sender to prove their identity before encrypting. The SDK supports three authentication methods, each suited to a different environment.

## Comparison

| Method | Environment | Yivi packages needed | Interactive |
|--------|-------------|---------------------|-------------|
| `pg.sign.apiKey()` | Server-side, trusted clients | No | No |
| `pg.sign.yivi()` | Browser apps | Yes | Yes (QR code) |
| `pg.sign.session()` | Extensions, custom flows | No | Depends on callback |

## API Key

The simplest method. Uses a pre-shared API key to authenticate with the PKG. Suitable for server-side applications or trusted client environments where you don't need interactive identity verification.

```ts
const sign = pg.sign.apiKey('your-api-key')

await pg.encrypt({
  sign,
  recipients: [pg.recipient.email('alice@example.com')],
  data: plaintext,
})
```

::: info
API keys are part of PostGuard for Business. Contact your PKG administrator to obtain one.
:::

### When to use

- Backend services that send encrypted emails
- Automated workflows
- Environments where Yivi is not available
- Development and testing

## Yivi Web

Runs an interactive Yivi session directly in the browser. The SDK renders a QR code (or app link on mobile) in the specified DOM element. The user scans it with the Yivi app to prove their email address.

```ts
const sign = pg.sign.yivi({
  element: '#yivi-qr',            // CSS selector for the QR container
  senderEmail: 'sender@example.com',
  includeSender: true,            // optional: include sender as recipient
})

await pg.encryptAndUpload({
  sign,
  recipients: [pg.recipient.email('alice@example.com')],
  files: myFiles,
})
```

### Requirements

The Yivi web packages must be installed:

```sh
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

If they are not installed, the SDK throws a `YiviNotInstalledError`.

### DOM element

The `element` parameter is a CSS selector pointing to a container where the Yivi QR code will be rendered:

```html
<div id="yivi-qr"></div>
```

```ts
pg.sign.yivi({ element: '#yivi-qr', senderEmail: 'sender@example.com' })
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element` | `string` | Yes | CSS selector for the QR code container |
| `senderEmail` | `string` | Yes | The sender's email address to prove |
| `includeSender` | `boolean` | No | Also encrypt for the sender (default: `false`) |

### When to use

- Web applications where the user is present in the browser
- SvelteKit, Next.js, or other frontend frameworks
- Any environment where you can render a DOM element for the QR code

## Session Callback

The most flexible method. You provide a callback function that receives a session request and must return a JWT. This lets you handle the Yivi session yourself -- in a popup window, a separate process, or any custom flow.

```ts
const sign = pg.sign.session(
  async (request) => {
    // request.con  -- attributes to prove, e.g.:
    //   [{ t: 'pbdf.sidn-pbdf.email.email', v: 'sender@example.com' }]
    // request.sort -- 'Signing'

    const jwt = await myCustomYiviFlow(request)
    return jwt
  },
  { senderEmail: 'sender@example.com' }
)
```

### The `SessionRequest` object

```ts
interface SessionRequest {
  con: { t: string; v?: string }[]  // required attribute constraints
  sort: 'Signing' | 'Decryption'   // what the session is for
  hints?: { t: string; v?: string }[] // display hints (decryption only)
  senderId?: string                 // sender identifier (decryption only)
}
```

### Browser extension pattern

In a Thunderbird or Outlook extension, you typically open a popup window to show the Yivi QR code, then resolve the promise when the popup returns the JWT:

```ts
const sign = pg.sign.session(
  async (request) => {
    return new Promise((resolve, reject) => {
      // Open a popup window
      const popup = window.open('/yivi-popup.html')

      // Listen for the result
      window.addEventListener('message', (event) => {
        if (event.data.type === 'yivi-jwt') {
          resolve(event.data.jwt)
        } else if (event.data.type === 'yivi-error') {
          reject(new Error(event.data.error))
        }
      }, { once: true })

      // Pass the session request to the popup
      popup.postMessage({ type: 'yivi-request', request })
    })
  },
  { senderEmail: 'sender@example.com' }
)
```

### Thunderbird extension pattern

The Thunderbird addon uses browser extension messaging to bridge between the background script and a popup:

```ts
// Background script
const sign = pg.sign.session(
  async ({ con, sort }) => {
    // Open popup and wait for JWT
    return createYiviPopup(con, sort)
  },
  { senderEmail: fromEmail }
)

// The createYiviPopup function opens a browser.windows.create()
// popup and resolves when the popup sends back a JWT via
// browser.runtime.sendMessage()
```

See the [Email Addon Integration](/integrations/email-addon) guide for the full pattern.

### When to use

- Browser extensions (Thunderbird, Outlook, Chrome)
- Environments where DOM-based Yivi rendering is not possible
- Custom Yivi flows (mobile apps, CLI tools)
- Server-mediated Yivi sessions

## Decryption Authentication

Decryption also requires identity verification. The same `element` and `session` patterns apply:

```ts
// Yivi Web (browser)
await pg.decrypt({
  uuid: '...',
  element: '#yivi-container',
})

// Session callback (extension)
await pg.decrypt({
  data: ciphertext,
  session: async (request) => {
    // request.sort is 'Decryption'
    // request.hints contains display hints for the user
    return await runYiviSession(request)
  },
  recipient: 'alice@example.com',
})
```

::: warning
You must provide either `element` or `session` for decryption. If neither is provided, the SDK throws a `DecryptionError`.
:::
