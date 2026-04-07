# Web Application Integration

This guide shows how to integrate PostGuard encryption and decryption into a web application. The examples come from the [postguard-examples](https://github.com/encryption4all/postguard-examples) repository and use SvelteKit, but the patterns apply to any frontend framework.

## Setup

Install the SDK, WASM module, and Yivi packages:

```sh
npm install @e4a/pg-js @e4a/pg-wasm
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

You also need Vite plugins for WASM support and Node.js polyfills for browser environments:

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
Configure the PKG and Cryptify URLs via environment variables:

```sh
# Public (available in browser)
PUBLIC_PKG_URL=https://pkg.staging.yivi.app
PUBLIC_CRYPTIFY_URL=https://fileshare.staging.yivi.app
PUBLIC_APP_NAME=PostGuard for Business Example

# Server-only
PG_API_KEY=PG-API-your-key-here
```

<small>[Source: .env.example](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/.env.example)</small>
Keep the API key server-side only:

```ts
import { env } from '$env/dynamic/private';

export const PG_API_KEY = env['PG_API_KEY'] ?? '';
```

<small>[Source: config.server.ts](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/config.server.ts)</small>
The public config provides the PKG and Cryptify URLs to the browser:

```ts
import { env } from '$env/dynamic/public';

export const APP_NAME = env.PUBLIC_APP_NAME || 'PostGuard for Business Example';
export const PKG_URL = env.PUBLIC_PKG_URL || 'https://pkg.staging.yivi.app';
export const CRYPTIFY_URL = env.PUBLIC_CRYPTIFY_URL || 'https://fileshare.staging.yivi.app';

export const UPLOAD_CHUNK_SIZE = 1024 * 1024; // 1MB
export const FILEREAD_CHUNK_SIZE = 1024 * 1024; // 1MB
```

<small>[Source: config.ts](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/config.ts)</small>
## Encrypt and Upload Files

Create a module that initializes PostGuard and wraps the `encryptAndDeliver` call:

```ts
import type { ISealOptions } from '@e4a/pg-wasm';
import type { CitizenRecipient, OrganisationRecipient } from '$lib/types';
import { PKG_URL, UPLOAD_CHUNK_SIZE } from '$lib/config';
import Chunker, { withTransform } from './chunker';
import { createFileReadable, getFileStoreStream } from './file-provider';

// Fetch the master public key from PKG
async function fetchMPK(): Promise<unknown> {
	const response = await fetch(`${PKG_URL}/v2/parameters`);
	if (!response.ok) throw new Error(`Failed to fetch PKG parameters: ${response.status}`);
	const json = await response.json();
	return json.publicKey;
}

// Fetch signing keys using API key auth (no Yivi needed)
async function fetchSigningKeys(
	apiKey: string
): Promise<{ pubSignKey: unknown; privSignKey?: unknown }> {
	const response = await fetch(`${PKG_URL}/v2/irma/sign/key`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			pubSignId: [{ t: 'pbdf.sidn-pbdf.email.email' }]
		})
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to fetch signing keys: ${response.status} ${text}`);
	}
	return response.json();
}

function extractDomain(email: string): string {
	return email.split('@')[1] || '';
}

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

<small>[Source: encryption.ts#L1-L87](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/postguard/encryption.ts#L1-L87)</small>
Then build a page that calls this function. This example uses API key authentication (PostGuard for Business):

```svelte
<script lang="ts">
	import FileDropzone from '$lib/components/FileDropzone.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { encryptAndSend } from '$lib/postguard/encryption';

	let { data } = $props();

	type SendState = 'idle' | 'encrypting' | 'done' | 'error';

	function createDummyFile(name: string, content: string): File {
		return new File([content], name, { type: 'text/plain', lastModified: Date.now() });
	}

	let files: File[] = $state([
		createDummyFile('report.txt', 'This is a sample report for PostGuard encryption testing.'),
		createDummyFile(
			'notes.txt',
			'These are confidential notes.\nOnly the intended recipient should be able to read this.'
		)
	]);
	let citizenEmail = $state('');
	let citizenName = $state('');
	let orgEmail = $state('');
	let orgName = $state('');
	let apiKey = $state(data.apiKey);
	let message = $state('');
	let sendState: SendState = $state('idle');
	let progress = $state(0);
	let errorMessage = $state('');
	let abortController: AbortController | undefined = $state();

	const canSend = $derived(
		files.length > 0 && citizenEmail.includes('@') && orgEmail.includes('@') && apiKey.length > 0
	);

	async function handleSend() {
		if (!canSend) return;

		sendState = 'encrypting';
		progress = 0;
		errorMessage = '';
		abortController = new AbortController();

		try {
			await encryptAndSend({
				files,
				citizen: { email: citizenEmail, name: citizenName },
				organisation: { email: orgEmail, name: orgName },
				apiKey,
				message: message || null,
				onProgress: (pct) => (progress = pct),
				abortController
			});
			sendState = 'done';
		} catch (e) {
			if (abortController.signal.aborted) {
				sendState = 'idle';
				progress = 0;
			} else {
				sendState = 'error';
				errorMessage = e instanceof Error ? e.message : String(e);
				console.error('Encryption error:', e);
			}
		}
	}
```

<small>[Source: +page.svelte#L1-L65](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/routes/send/+page.svelte#L1-L65)</small>
The server load function passes the API key to the page:

```ts
import { PG_API_KEY } from '$lib/config.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		apiKey: PG_API_KEY
	};
};
```

<small>[Source: +page.server.ts](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/routes/send/+page.server.ts)</small>
## Decrypt Files

A page that decrypts files from a Cryptify UUID. The UUID and recipient can come from URL query parameters (as provided in Cryptify notification emails):

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
## Yivi QR Styling

The Yivi QR container needs some CSS to render properly. Import the Yivi CSS or add minimal styles:

```css
#yivi-qr, #yivi-web {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```
