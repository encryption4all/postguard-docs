# Decryption

The SDK provides a single `decrypt()` method that handles two distinct flows based on the input:

| Input | Decrypts from | Returns |
|-------|---------------|---------|
| `{ uuid }` | Cryptify stored file | `DecryptFileResult` |
| `{ data }` | Raw ciphertext bytes | `DecryptDataResult` |

Both flows require the recipient to prove their identity through Yivi. You provide either an `element` (for browser-based Yivi QR) or a `session` callback (for custom flows).

## Decrypt from Cryptify UUID

Downloads and decrypts a file stored on Cryptify. The SvelteKit example reads the UUID from a URL query parameter and renders a Yivi QR widget:

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
::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

### `DecryptFileResult`

The result contains the decrypted files as a ZIP blob, the sender identity, and a `download()` helper:

| Property | Type | Description |
|----------|------|-------------|
| `files` | `string[]` | Filenames inside the ZIP |
| `sender` | `SenderIdentity \| null` | Verified sender identity |
| `blob` | `Blob` | The decrypted ZIP blob |
| `download` | `(filename?: string) => void` | Trigger a browser download |

## Decrypt from Raw Data

Decrypts raw ciphertext bytes (e.g. from an encrypted email). The Thunderbird addon extracts ciphertext from the email and decrypts using a session callback:

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
### `DecryptDataResult`

| Property | Type | Description |
|----------|------|-------------|
| `plaintext` | `Uint8Array` | The decrypted data |
| `sender` | `SenderIdentity \| null` | Verified sender identity |

## Recipient Selection

When the ciphertext was encrypted for multiple recipients, the SDK needs to know which recipient key to use. Pass the `recipient` parameter with the email address of the intended recipient. If there is only one recipient in the ciphertext, the parameter can be omitted.

## Sender Identity

Both result types include a `sender` field with the verified identity of the person who encrypted the data. The SvelteKit example extracts the sender email:

```ts
			} catch {
				// May not be available before unsealing
			}

```

<small>[Source: +page.svelte#L66-L69](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/routes/download/+page.svelte#L66-L69)</small>
The Thunderbird addon extracts both public and private sender attributes to build identity badges:

```ts
  if (!pending) return null;
  return pending.data;
}

async function handleYiviPopupDone(
  windowId: number | undefined,
  jwt: string
) {
  if (windowId == null) return;
```

<small>[Source: background.ts#L742-L750](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L742-L750)</small>
## Error Handling

Decryption can throw:

- `DecryptionError`: general decryption failure, or missing `element`/`session`
- `IdentityMismatchError`: the Yivi attributes did not match the encryption policy
- `NetworkError`: PKG or Cryptify communication failure

The SvelteKit download page handles these errors:

```ts
			if (!uuid) return;
		}
		dlState = 'loading';

		try {
			unsealer = await createUnsealer(uuid);
			policies = unsealer.inspect_header();

			try {
```

<small>[Source: +page.svelte#L56-L64](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/routes/download/+page.svelte#L56-L64)</small>
See [Error Handling](/sdk/errors) for the full error reference.
