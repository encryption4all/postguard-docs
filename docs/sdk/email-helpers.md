# Email Helpers

The SDK includes email helper methods for building and parsing PostGuard-encrypted emails. These are available both as instance methods on `pg.email.*` and as standalone exports. All examples below come from the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon).

## Overview

Encrypting an email with PostGuard follows this workflow:

```
1. Build inner MIME    -->  pg.email.buildMime()
2. Encrypt the MIME    -->  pg.encrypt()
3. Create envelope     -->  pg.email.createEnvelope()
4. Send the envelope via your email client / API
```

Decrypting reverses the process:

```
1. Extract ciphertext  -->  pg.email.extractCiphertext()
2. Decrypt             -->  pg.decrypt({ data })
3. Parse the plaintext MIME
```

## `buildMime()`

Constructs a MIME message from structured input. Returns the raw MIME bytes as a `Uint8Array`. The output includes proper headers (Date, MIME-Version, Content-Type, X-PostGuard) and handles multipart encoding for attachments.

The Thunderbird addon builds the inner MIME from compose details:

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
```

<small>[Source: background.ts#L348-L360](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L348-L360)</small>

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | `string` | Yes | Sender email address |
| `to` | `string[]` | Yes | Recipient email addresses |
| `cc` | `string[]` | No | CC email addresses |
| `subject` | `string` | Yes | Email subject line |
| `htmlBody` | `string` | No | HTML body content |
| `plainTextBody` | `string` | No | Plain text body content |
| `date` | `Date` | No | Send date (defaults to now) |
| `inReplyTo` | `string` | No | Message-ID of the email being replied to |
| `references` | `string` | No | References header for threading |
| `attachments` | `Array<{ name, type, data }>` | No | File attachments (data as ArrayBuffer) |

::: tip
Provide at least one of `htmlBody` or `plainTextBody`. If both are provided, the MIME message includes both as a `multipart/alternative` section. If attachments are present, the message uses `multipart/mixed`.
:::

## `createEnvelope()`

Takes encrypted bytes and wraps them into an email envelope structure. The envelope contains a placeholder HTML body (informing the recipient to use PostGuard to decrypt), a plain text fallback, and the ciphertext as a file attachment named `postguard.encrypted`.

If the ciphertext is under 100 KB, the encrypted data is also embedded as an armored (base64-encoded) block in the HTML body. This allows email addons to extract the ciphertext directly from the HTML without needing the attachment.

The Thunderbird addon creates the envelope and attaches it:

```ts
        date,
        inReplyTo,
        references,
        attachments: attachmentData,
      });

      // Build per-recipient policy
      const customPolicies = state.policy;
```

<small>[Source: background.ts#L403-L410](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L403-L410)</small>

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `encrypted` | `Uint8Array` | Yes | The encrypted ciphertext |
| `from` | `string` | Yes | Sender email address |
| `websiteUrl` | `string` | No | URL to link in the placeholder body |
| `unencryptedMessage` | `string` | No | Unencrypted message shown in the placeholder |

## `extractCiphertext()`

Extracts the encrypted ciphertext from a received email. It checks two locations in order:

1. Attachments: looks for a file named `postguard.encrypted`
2. HTML body: looks for an armored payload between `-----BEGIN POSTGUARD MESSAGE-----` and `-----END POSTGUARD MESSAGE-----` markers

Returns a `Uint8Array` with the ciphertext, or `null` if nothing is found.

```ts
  };

  const jwtPromise = new Promise<string>((resolve, reject) => {
    pendingYiviPopups.set(popupId, { data, resolve, reject });
```

<small>[Source: background.ts#L713-L716](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L713-L716)</small>

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `htmlBody` | `string` | No | The HTML body of the received email |
| `attachments` | `Array<{ name, data }>` | No | Email attachments (data as ArrayBuffer) |

## `injectMimeHeaders()`

Adds or replaces headers in a raw MIME string. The function splits the MIME at the `\r\n\r\n` separator, processes the header section (including folded multi-line headers), and reassembles the result.

The Thunderbird addon injects threading headers and an `X-PostGuard` marker into decrypted messages:

```ts
  if (!pending) return;

  pending.resolve(jwt);
  pendingYiviPopups.delete(windowId);
}

// --- Decrypt message ---

async function handleDecryptMessage(messageId: number): Promise<{ ok: boolean; error?: string }> {
  console.log("[PostGuard] Decrypt requested for message:", messageId);

  if (!vk || !pgWasm) {
    console.error("[PostGuard] pg-wasm or verification key not loaded");
    notifyError("startupError");
    return { ok: false, error: "startupError" };
  }

  try {
    const msg = await browser.messages.get(messageId);
    const attachments = await browser.messages.listAttachments(messageId);
```

<small>[Source: background.ts#L752-L771](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L752-L771)</small>

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mime` | `string` | Yes | The raw MIME string |
| `headersToInject` | `Record<string, string>` | Yes | Headers to add |
| `headersToRemove` | `string[]` | No | Headers to remove first |

## Full Encryption Workflow

The Thunderbird addon's `handleBeforeSend` function shows the complete email encryption workflow: build MIME, encrypt, create envelope, and replace the email content:

```ts
      });
      return encrypted || wasEncrypted;
    }
  } catch (e) {
    console.warn("[PostGuard] shouldEncrypt error:", e);
  }
  return false;
}

async function isPGEncrypted(msgId: number): Promise<boolean> {
  // Primary: check for encrypted attachment
  const attachments = await browser.messages.listAttachments(msgId);
  if (attachments.some((att) => att.name === "postguard.encrypted")) return true;

  // Fallback: check for armor block in HTML body
  try {
    const full = await browser.messages.getFull(msgId);
    const bodyHtml = findHtmlBody(full);
    if (bodyHtml && extractArmoredPayload(bodyHtml)) return true;
  } catch {
    // ignore
  }

  return false;
}

// --- Alarm keepalive for onBeforeSend (MV3 anti-termination pattern) ---

function keepAlive(name: string, promise: Promise<unknown>) {
  const listener = (alarm: { name: string }) => {
    if (alarm.name === name) {
      console.log(`[PostGuard] Keepalive: waiting for ${name}`);
    }
  };
  browser.alarms.create(name, { periodInMinutes: 0.25 });
  browser.alarms.onAlarm.addListener(listener);

  return promise.finally(() => {
    browser.alarms.clear(name);
    browser.alarms.onAlarm.removeListener(listener);
  });
}

// --- onBeforeSend: encryption hook ---

async function handleBeforeSend(tab: { id: number }, details: any) {
  const state = composeTabs.get(tab.id);
  if (!state?.encrypt) return;

  // BCC check
  if (details.bcc.length > 0) {
    console.warn("[PostGuard] BCC not supported with encryption");
    return { cancel: true };
  }

  // If policy editor is open, bring it to focus
  if (state.configWindowId) {
    await browser.windows.update(state.configWindowId, {
      drawAttention: true,
      focused: true,
    });
    return { cancel: true };
  }

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
      const recipients = [...details.to, ...details.cc];
      const sealPolicy: Record<string, { ts: number; con: Array<{ t: string; v: string }> }> = {};

      for (const recipient of recipients) {
        const id = toEmail(recipient);
        if (customPolicies && customPolicies[id]) {
          sealPolicy[id] = {
            ts: timestamp,
            con: customPolicies[id].map(({ t, v }) =>
              t === EMAIL_ATTRIBUTE_TYPE ? { t, v: v.toLowerCase() } : { t, v }
            ),
          };
        } else {
          sealPolicy[id] = {
            ts: timestamp,
            con: [{ t: EMAIL_ATTRIBUTE_TYPE, v: id }],
          };
        }
      }

      // Get signing identity
```

<small>[Source: background.ts#L284-L431](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L284-L431)</small>

## Full Decryption Workflow

The decryption handler extracts ciphertext, decrypts, builds identity badges, injects headers, and imports the decrypted message back into the folder:

```ts
      } catch {}
    }, 100)
  ).catch(() => {});
}

// --- Yivi popup flow ---

export async function createYiviPopup(
  con: AttributeCon,
  sort: KeySort,
  hints?: AttributeCon,
  senderId?: string
): Promise<string> {
  const popup = await browser.windows.create({
    url: "pages/yivi-popup/yivi-popup.html",
    type: "popup",
    height: 700,
    width: 620,
  });

  const popupId = popup.id;
  await browser.windows.update(popupId, {
    drawAttention: true,
    focused: true,
  });

  const data: PopupData = {
    hostname: PKG_URL,
    header: PG_CLIENT_HEADER,
    con,
    sort,
    hints,
    senderId,
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

async function handleYiviPopupInit(windowId: number | undefined) {
  if (windowId == null) return null;
  const pending = pendingYiviPopups.get(windowId);
  if (!pending) return null;
  return pending.data;
}

async function handleYiviPopupDone(
  windowId: number | undefined,
  jwt: string
) {
  if (windowId == null) return;
  const pending = pendingYiviPopups.get(windowId);
  if (!pending) return;

  pending.resolve(jwt);
  pendingYiviPopups.delete(windowId);
}

// --- Decrypt message ---

async function handleDecryptMessage(messageId: number): Promise<{ ok: boolean; error?: string }> {
  console.log("[PostGuard] Decrypt requested for message:", messageId);

  if (!vk || !pgWasm) {
    console.error("[PostGuard] pg-wasm or verification key not loaded");
    notifyError("startupError");
    return { ok: false, error: "startupError" };
  }

  try {
    const msg = await browser.messages.get(messageId);
    const attachments = await browser.messages.listAttachments(messageId);
    const pgAtt = attachments.find((att) => att.name === "postguard.encrypted");

    let createReadable: () => Promise<ReadableStream<Uint8Array>>;

    if (pgAtt) {
      // Primary: decrypt from attachment
      createReadable = async () => {
        const attFile = await browser.messages.getAttachmentFile(
          messageId,
          pgAtt.partName
        );
        return (attFile as any).stream();
      };
    } else {
      // Fallback: extract armored payload from body
      const full = await browser.messages.getFull(messageId);
      const bodyHtml = findHtmlBody(full);
      if (!bodyHtml) return;

      const armoredBase64 = extractArmoredPayload(bodyHtml);
      if (!armoredBase64) return;

      console.log("[PostGuard] Found armored payload in body, length:", armoredBase64.length);
      const binaryString = atob(armoredBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      createReadable = async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        });
```

<small>[Source: background.ts#L680-L806](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L680-L806)</small>