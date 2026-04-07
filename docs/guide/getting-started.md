# Getting Started

This guide walks you through installing the PostGuard SDK, encrypting data, and decrypting it again. All code examples come from the [postguard-examples](https://github.com/encryption4all/postguard-examples) SvelteKit app and the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon).

## Prerequisites

- Node.js 18+ or a modern browser environment
- A PostGuard PKG server URL

## 1. Install

Install the SDK and its peer dependency for WebAssembly cryptography:

::: code-group

```sh [npm]
npm install @e4a/pg-js @e4a/pg-wasm
```

```sh [pnpm]
pnpm add @e4a/pg-js @e4a/pg-wasm
```

```sh [yarn]
yarn add @e4a/pg-js @e4a/pg-wasm
```

:::

If you plan to use Yivi-based authentication in the browser, also install the Yivi packages:

```sh
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

## 2. Initialize and Encrypt

Create a PostGuard instance and encrypt files for delivery. This module from the SvelteKit example initializes the client and wraps `encryptAndDeliver` with an API key:

```ts
export interface EncryptAndSendOptions {
	files: File[];
	citizen: CitizenRecipient;
	organisation: OrganisationRecipient;
	apiKey: string;
	message: string | null;
	onProgress?: (percentage: number) => void;
	abortController?: AbortController;
}

export async function encryptAndSend(options: EncryptAndSendOptions): Promise<void> {
	const {
		files,
		citizen,
		organisation,
		apiKey,
		message,
		onProgress,
		abortController = new AbortController()
	} = options;

	// Fetch MPK and signing keys in parallel
	const [mpk, signingKeys] = await Promise.all([fetchMPK(), fetchSigningKeys(apiKey)]);

	// Build encryption policy
	const ts = Math.round(Date.now() / 1000);
	const policy: Record<string, { ts: number; con: { t: string; v?: string }[] }> = {};

	// Citizen: must prove exact email address
	policy[citizen.email] = {
		ts,
		con: [{ t: 'pbdf.sidn-pbdf.email.email', v: citizen.email }]
	};

	// Organisation: must prove an email at the correct domain
	policy[organisation.email] = {
		ts,
		con: [{ t: 'pbdf.sidn-pbdf.email.domain', v: extractDomain(organisation.email) }]
	};

	const sealOptions: ISealOptions = {
		policy,
		pubSignKey: signingKeys.pubSignKey as ISealOptions['pubSignKey']
	};
	if (signingKeys.privSignKey) {
		sealOptions.privSignKey = signingKeys.privSignKey as ISealOptions['pubSignKey'];
	}

```

<small>[Source: encryption.ts#L40-L87](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/postguard/encryption.ts#L40-L87)</small>

The configuration comes from environment variables:

```ts
import { env } from '$env/dynamic/public';

export const APP_NAME = env.PUBLIC_APP_NAME || 'PostGuard for Business Example';
export const PKG_URL = env.PUBLIC_PKG_URL || 'https://pkg.staging.yivi.app';
export const CRYPTIFY_URL = env.PUBLIC_CRYPTIFY_URL || 'https://fileshare.staging.yivi.app';

export const UPLOAD_CHUNK_SIZE = 1024 * 1024; // 1MB
export const FILEREAD_CHUNK_SIZE = 1024 * 1024; // 1MB
```

<small>[Source: config.ts](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/config.ts)</small>

```sh
# Public (available in browser)
PUBLIC_PKG_URL=https://pkg.staging.yivi.app
PUBLIC_CRYPTIFY_URL=https://fileshare.staging.yivi.app
PUBLIC_APP_NAME=PostGuard for Business Example

# Server-only
PG_API_KEY=PG-API-your-key-here
```

<small>[Source: .env.example](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/.env.example)</small>

### Encrypting raw data for email

For email integration, the Thunderbird addon uses `pg.encrypt()` with raw MIME bytes instead of files. It builds the MIME, encrypts with a Yivi session callback, and wraps the result in an envelope:

```ts
  if (!pk) {
    console.error("[PostGuard] No public key available, cannot encrypt");
    notifyError("encryptionError");
    return { cancel: true };
  }

  const { promise, resolve } = Promise.withResolvers<
    { cancel?: boolean; details?: Partial<typeof details> } | void
  >();

  keepAlive("onBeforeSend", (async () => {
    try {
      const originalSubject = details.subject;
      const date = new Date();
      const timestamp = Math.round(date.getTime() / 1000);

      // Build attachments list
      const composeAttachments = await browser.compose.listAttachments(tab.id);
      const attachmentData = await Promise.all(
        composeAttachments.map(async (att) => {
          const file = await browser.compose.getAttachmentFile(att.id) as unknown as File;
          return {
            name: file.name,
            type: file.type,
            data: await file.arrayBuffer(),
          };
        })
      );

      // Fetch threading headers if replying
      let inReplyTo: string | undefined;
      let references: string | undefined;
      if (details.relatedMessageId) {
        try {
          const relFull = await browser.messages.getFull(details.relatedMessageId);
          const relMsgId = relFull.headers["message-id"]?.[0];
          if (relMsgId) {
            inReplyTo = relMsgId;
            const relRefs = relFull.headers["references"]?.[0];
            references = relRefs ? `${relRefs} ${relMsgId}` : relMsgId;
          }
        } catch (e) {
          console.warn("[PostGuard] Could not fetch related message headers:", e);
        }
      }

      // Build inner MIME
      const mimeData = buildInnerMime({
        from: details.from,
        to: [...details.to],
        cc: [...details.cc],
        subject: originalSubject,
        body: details.body,
        plainTextBody: details.plainTextBody,
        isPlainText: details.isPlainText,
        date,
        inReplyTo,
        references,
        attachments: attachmentData,
      });

      // Build per-recipient policy
      const customPolicies = state.policy;
```

<small>[Source: background.ts#L348-L410](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L348-L410)</small>

## 3. Decrypt

The SvelteKit example decrypts files from a Cryptify UUID using the Yivi QR widget:

```svelte
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import {
		createUnsealer,
		sortPolicies,
		secondsTill4AM,
		readZipFilenames
	} from '$lib/postguard/decryption';
	import { PKG_URL } from '$lib/config';

	type DownloadState =
		| 'loading'
		| 'recipients'
		| 'ready'
		| 'decrypting'
		| 'done'
		| 'error'
		| 'identity-mismatch';

	let dlState: DownloadState = $state('loading');
	let errorMessage = $state('');

	let uuid = $state('');
	let recipientParam = $state('');
	let manualUuid = $state('');

	let policies: Map<string, any>;
	let keylist: string[] = $state([]);
	let key = $state('');
	let timestamp: number;
	let keyRequest: any;
	let usk: any;
	let unsealer: any;

	let decryptedBlobUrl = $state('');
	let senderIdentity: any = $state(null);
	let fileList: string[] = $state([]);

	onMount(() => {
		if (!browser) return;
		const params = new URLSearchParams(window.location.search);
		uuid = params.get('uuid') ?? '';
		recipientParam = params.get('recipient') ?? '';

		if (uuid) {
			startDownload();
		} else {
			dlState = 'loading';
		}
	});

	async function startDownload() {
		if (!uuid) {
			uuid = manualUuid;
			if (!uuid) return;
		}
		dlState = 'loading';

		try {
			unsealer = await createUnsealer(uuid);
			policies = unsealer.inspect_header();

			try {
				senderIdentity = unsealer.public_identity();
			} catch {
				// May not be available before unsealing
			}

			checkRecipients();
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
			dlState = 'error';
		}
	}
```

<small>[Source: +page.svelte#L1-L75](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/routes/download/+page.svelte#L1-L75)</small>

### Decrypting raw data

The Thunderbird addon decrypts raw ciphertext using a session callback that opens a Yivi popup:

```ts
  };

  const jwtPromise = new Promise<string>((resolve, reject) => {
    pendingYiviPopups.set(popupId, { data, resolve, reject });
  });

  const closeListener = (closedId: number) => {
    if (closedId === popupId) {
      const pending = pendingYiviPopups.get(popupId);
      if (pending) {
        pending.reject(new Error("Yivi popup closed"));
        pendingYiviPopups.delete(popupId);
      }
      browser.windows.onRemoved.removeListener(closeListener);
    }
  };
  browser.windows.onRemoved.addListener(closeListener);

  return keepAlive(
    "yivi-session",
    jwtPromise.finally(() => {
      browser.windows.onRemoved.removeListener(closeListener);
    })
  ) as Promise<string>;
}

```

<small>[Source: background.ts#L713-L738](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L713-L738)</small>

## Bundler configuration

The SDK depends on `@e4a/pg-wasm`, which is a WebAssembly module. Most bundlers need plugins to handle WASM imports.

### Vite / SvelteKit

You need Vite plugins for WASM support and Node.js polyfills for browser environments. Here is a full working `vite.config.ts` from the [SvelteKit example](https://github.com/encryption4all/postguard-examples):

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill';
import nodePolyfills from 'rollup-plugin-node-polyfills';

export default defineConfig({
	resolve: {
		alias: {
			util: 'rollup-plugin-node-polyfills/polyfills/util',
			events: 'rollup-plugin-node-polyfills/polyfills/events',
			stream: 'rollup-plugin-node-polyfills/polyfills/stream',
			url: 'rollup-plugin-node-polyfills/polyfills/url',
			http: 'rollup-plugin-node-polyfills/polyfills/http',
			https: 'rollup-plugin-node-polyfills/polyfills/http',
			buffer: 'rollup-plugin-node-polyfills/polyfills/buffer-es6',
			process: 'rollup-plugin-node-polyfills/polyfills/process-es6'
		}
	},
	optimizeDeps: {
		esbuildOptions: {
			define: {
				global: 'globalThis'
			},
			plugins: [
				NodeGlobalsPolyfillPlugin({
					process: true,
					buffer: true
				}),
				NodeModulesPolyfillPlugin()
			]
		}
	},
	build: {
		rollupOptions: {
			// @ts-ignore
			plugins: [nodePolyfills()]
		}
	},
	plugins: [sveltekit(), wasm(), topLevelAwait()]
});
```

<small>[Source: vite.config.ts](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/vite.config.ts)</small>

### Browser extensions

Browser extensions often cannot use dynamic `import()` for WASM modules. The Thunderbird addon loads WASM indirectly and passes it to the constructor:

```ts
// --- Load pg-wasm and fetch PKG keys on startup ---
console.log("[PostGuard] Loading pg-wasm and fetching PKG keys...");

// Use indirect dynamic import to prevent esbuild from resolving it
const pgWasmPath = "./pg-wasm/load.js";
const modPromise = import(/* @vite-ignore */ pgWasmPath).then((mod: any) => {
  setSealStream(mod.sealStream as Parameters<typeof setSealStream>[0]);
  setStreamUnsealer(mod.StreamUnsealer);
  console.log("[PostGuard] pg-wasm loaded");
  return mod;
}).catch((e: Error) => {
  console.error("[PostGuard] Failed to load pg-wasm:", e);
  return null;
});

const pkPromise = fetchPublicKey();
const vkPromise = fetchVerificationKey();

// --- Register message display script ---
// A restarting background will try to re-register — catch the error.
browser.scripting.messageDisplay
  .registerScripts([
    {
      id: "postguard-message-display",
      css: ["/content/message-display.css"],
      js: ["/content/message-display.js"],
    },
  ])
  .catch(console.info);
```

<small>[Source: background.ts#L78-L106](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L78-L106)</small>

## Next Steps

- [SDK Overview](/sdk/overview): architecture and constructor options
- [Encryption](/sdk/encryption): all encryption options in depth
- [Decryption](/sdk/decryption): UUID and raw data decryption
- [Authentication Methods](/sdk/auth-methods): API key, Yivi, and session callbacks
- [Web Application Integration](/integrations/web-app): full SvelteKit example
- [Email Addon Integration](/integrations/email-addon): Thunderbird and Outlook patterns
