# Encryption

The SDK provides three encryption methods, each suited to a different use case.

| Method | Upload | Email delivery | Returns |
|--------|--------|----------------|---------|
| `encrypt()` | No | No | `Uint8Array` |
| `encryptAndUpload()` | Yes | No | `{ uuid }` |
| `encryptAndDeliver()` | Yes | Yes | `{ uuid }` |

## Recipients

Before encrypting, build one or more recipients. PostGuard can encrypt with any wallet attribute. Email is the most common, but you can also target recipients by name, BSN, domain, or any other verified attribute.

The SvelteKit example uses `pg.recipient.email()` and `pg.recipient.emailDomain()`:

```ts
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
```

<small>[Source: encryption.ts#L20-L31](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/postguard/encryption.ts#L20-L31)</small>

The Thunderbird addon builds recipients with custom policies when configured:

```ts
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

```

<small>[Source: background.ts#L362-L376](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L362-L376)</small>

Under the hood, `pg.recipient.email()` creates a policy with the attribute type `pbdf.sidn-pbdf.email.email`, while `pg.recipient.emailDomain()` extracts the domain from the email and uses `pbdf.sidn-pbdf.email.domain`.

## `encrypt()`

Encrypts raw data and returns the ciphertext as a `Uint8Array`. No files are uploaded. The Thunderbird addon uses this to encrypt MIME email content:

```ts
          }
        } catch (e) {
          console.warn("[PostGuard] Could not fetch related message headers:", e);
        }
      }

      // Build inner MIME
      const mimeData = buildInnerMime({
        from: details.from,
```

<small>[Source: background.ts#L388-L396](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L388-L396)</small>

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sign` | `SignMethod` | Yes | Authentication method |
| `recipients` | `Recipient[]` | Yes | One or more recipients |
| `data` | `Uint8Array \| ReadableStream<Uint8Array>` | Yes | Data to encrypt |

## `encryptAndUpload()`

Encrypts one or more files and uploads them to Cryptify. The files are bundled into a ZIP archive, encrypted, and streamed to Cryptify in chunks (1 MB by default). Returns a UUID that recipients can use to download and decrypt.

::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sign` | `SignMethod` | Yes | Authentication method |
| `recipients` | `Recipient[]` | Yes | One or more recipients |
| `files` | `File[] \| FileList` | Yes | Files to encrypt |
| `onProgress` | `(pct: number) => void` | No | Upload progress callback (0-100) |
| `signal` | `AbortSignal` | No | Cancel the operation |

## `encryptAndDeliver()`

Same as `encryptAndUpload`, but also triggers Cryptify to send email notifications to all recipients with a link to decrypt. The SvelteKit example uses this with an API key:

```ts
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

<small>[Source: encryption.ts#L50-L87](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/postguard/encryption.ts#L50-L87)</small>

### Delivery options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `message` | `string` | `undefined` | Custom message in the notification email |
| `language` | `'EN' \| 'NL'` | `'EN'` | Language of the notification email |
| `confirmToSender` | `boolean` | `false` | Send a delivery confirmation to the sender |

## Error handling

All encryption methods can throw:

- `PostGuardError`: general SDK error
- `NetworkError`: PKG or Cryptify communication failure (includes `status` and `body` properties)
- `YiviNotInstalledError`: Yivi packages not installed (when using `pg.sign.yivi`)

See [Error Handling](/sdk/errors) for the full error reference.
