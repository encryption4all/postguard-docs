---
layout: home

hero:
  name: PostGuard
  text: Encryption based on identity, not keys
  tagline: Send encrypted messages and files to anyone using just their email address. No key exchange, no certificates, no hassle.
  actions:
    - theme: brand
      text: What is PostGuard?
      link: /guide/what-is-postguard
    - theme: alt
      text: Core Concepts
      link: /guide/concepts
    - theme: alt
      text: Getting Started
      link: /guide/getting-started

features:
  - title: No key exchange needed
    details: Encrypt data using nothing more than the recipient's email address. There are no public keys to look up and no certificates to manage.
  - title: Identity verification built in
    details: Recipients prove they own their email address (or other attributes) before they can decrypt. Sender identity can be verified too.
  - title: Time-limited keys
    details: Decryption keys expire automatically. Even if a key is compromised, it only works for a specific time window.
  - title: Works everywhere
    details: The JavaScript SDK runs in browsers and Node.js. Addons exist for Thunderbird and Outlook. A CLI tool handles server-side and scripting use cases.
---

## Quick Start

Install the SDK:

```bash
npm install @e4a/pg-js @e4a/pg-wasm
```

Initialize PostGuard and encrypt files for delivery:

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
```

<small>[Source: encryption.ts#L40-L78](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/postguard/encryption.ts#L40-L78)</small>

Read the [concepts guide](/guide/concepts) to understand how this works, or jump straight to [getting started](/guide/getting-started).
