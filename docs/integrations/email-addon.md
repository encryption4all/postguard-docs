# Email Addon Integration

This guide explains how to build an email addon (Thunderbird, Outlook, or similar) using the PostGuard SDK. Email addons run in extension environments where DOM-based Yivi rendering is handled in separate popup windows, and dynamic imports may not work as expected.

Both the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon) and the [Outlook addon](https://github.com/encryption4all/postguard-outlook-addon) follow the patterns described here. All code snippets below come directly from those repositories.

## Architecture

An email addon typically has three components:

```
+---------------------------+
|  Background script        |  PostGuard SDK lives here
|  - Intercepts send/read   |  - pg.encrypt() / pg.open().decrypt()
|  - Manages state          |  - pg.email.* helpers
+---------------------------+
           |
           | extension messaging
           |
+---------------------------+
|  Popup windows            |  Yivi QR rendering
|  - Policy editor          |  - Receives session request
|  - Yivi session popup     |  - Returns JWT via messaging
+---------------------------+
           |
+---------------------------+
|  Content scripts / UI     |
|  - Compose action button  |
|  - Decrypt banner         |
|  - Sender identity badges |
+---------------------------+
```

The background script owns the PostGuard SDK instance. The session callback bridges the background script (where encryption/decryption runs) and the popup (where the Yivi QR is shown).

## Initialization with Pre-loaded WASM

Browser extensions often cannot use dynamic `import()` for WASM modules. The Thunderbird addon loads WASM at startup and passes it to the constructor:

```ts
// Use indirect dynamic import to prevent esbuild from resolving it
const pgWasmPath = "./pg-wasm/load.js";
const modPromise = import(/* @vite-ignore */ pgWasmPath).then((mod: any) => {
  console.log("[PostGuard] pg-wasm loaded");
  return mod as WasmModule;
}).catch((e: Error) => {
  console.error("[PostGuard] Failed to load pg-wasm:", e);
  return null;
});

// Later, after awaiting the module:
pgWasm = await modPromise;

if (pgWasm) {
  pg = new PostGuard({
    pkgUrl: PKG_URL!,
    headers: PG_CLIENT_HEADER,
    wasm: pgWasm,
  });
}
```

<small>[Source: background.ts#L66-L73, L170-L180](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L66-L73)</small>

The SDK handles all PKG communication (master public key fetching, key generation, etc.) internally — the addon only needs to provide the `pkgUrl`.

## The Session Callback Pattern

Since the background script cannot render DOM elements, `pg.sign.session()` opens a popup, waits for the Yivi session to complete, and returns the JWT.

### Popup bridge (background script)

The background script tracks pending popups in a Map and resolves the Promise when the popup sends back a JWT:

```ts
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
```

<small>[Source: background.ts#L588-L637](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L588-L637)</small>

### Message handler

The background script routes `yiviPopupInit` and `yiviPopupDone` messages from the popup:

```ts
switch (msg.type) {
  // ...
  case "yiviPopupInit":
    return handleYiviPopupInit(sender.tab?.windowId);
  case "yiviPopupDone":
    return handleYiviPopupDone(
      sender.tab?.windowId,
      msg.jwt as string
    );
  // ...
}
```

<small>[Source: background.ts#L108-L137](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L108-L137)</small>

### Yivi popup page

The popup uses the SDK's `runYiviSession()` to handle the full Yivi flow (QR code rendering + polling + JWT retrieval), then sends the JWT back to the background:

```ts
import { runYiviSession } from "@e4a/pg-js";

async function init() {
  const data = (await browser.runtime.sendMessage({
    type: "yiviPopupInit",
  })) as YiviPopupData | null;

  if (!data) {
    showError("Failed to initialize session.");
    return;
  }

  try {
    loadingEl.style.display = "none";

    const jwt = await runYiviSession({
      pkgUrl: data.hostname,
      element: "#yivi-web-form",
      con: data.con,
      sort: data.sort as "Signing" | "Decryption",
      headers: data.header,
    });

    await browser.runtime.sendMessage({ type: "yiviPopupDone", jwt });

    // Auto-close after a short delay
    setTimeout(async () => {
      const win = await browser.windows.getCurrent();
      browser.windows.remove(win.id);
    }, 750);
  } catch (e) {
    showError(e instanceof Error ? e.message : "Yivi session failed.");
  }
}
```

<small>[Source: yivi-popup.ts#L23-L81](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/pages/yivi-popup/yivi-popup.ts#L23-L81)</small>

## Email Encryption Flow

With the session callback in place, the encryption flow intercepts the compose send event. The key steps are:

1. Build attachments list from the compose tab
2. Fetch threading headers if replying
3. Build the inner MIME using `pg.email.buildMime()`
4. Build recipients (with custom policies if configured)
5. Create the `Sealed` builder with `pg.encrypt()` using a session callback
6. Create the encrypted envelope with `pg.email.createEnvelope()`
7. Replace the email body and subject with the envelope contents

```ts
// Build inner MIME using SDK
const mimeData = pg!.email.buildMime({
  from: details.from,
  to: [...details.to],
  cc: [...details.cc],
  subject: originalSubject,
  htmlBody: details.isPlainText ? undefined : details.body,
  plainTextBody: details.isPlainText ? details.plainTextBody : undefined,
  date,
  inReplyTo,
  references,
  attachments: attachmentData,
});

// Build recipients with custom policies if set
const pgRecipients = recipients.map((r: string) => {
  const id = toEmail(r);
  if (customPolicies && customPolicies[id]) {
    return pg!.recipient.withPolicy(
      id,
      customPolicies[id].map(({ t, v }) =>
        t === EMAIL_ATTRIBUTE_TYPE ? { t, v: v.toLowerCase() } : { t, v }
      )
    );
  }
  return pg!.recipient.email(id);
});

// Build sealed encryption builder (lazy — encrypts when createEnvelope calls toBytes)
const sealed = pg!.encrypt({
  sign: pg!.sign.session(
    async ({ con, sort }) => createYiviPopup(con as AttributeCon, sort as KeySort),
    { senderEmail: from }
  ),
  recipients: pgRecipients,
  data: mimeData,
});

// Create encrypted email envelope using SDK (encrypts + builds placeholder HTML)
const envelope = await pg!.email.createEnvelope({
  sealed,
  from: details.from,
});

// Add encrypted attachment and replace body/subject
await browser.compose.addAttachment(tab.id, { file: envelope.attachment });
resolve({
  details: {
    subject: envelope.subject,
    body: envelope.htmlBody,
    plainTextBody: envelope.plainTextBody,
  },
});
```

<small>[Source: background.ts#L331-L405](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L331-L405)</small>

### BCC limitation

PostGuard does not support BCC recipients. The Thunderbird addon blocks sending if any BCC recipients are present when encryption is enabled.

### Sent copy management

After sending, the addon stores the unencrypted MIME in a "PostGuard Sent" folder so the sender can read their own messages later.

## Email Decryption Flow

The decryption flow extracts ciphertext from a received email, decrypts it with a session callback, and replaces the encrypted message with the decrypted one.

The key steps are:
1. Extract ciphertext from attachments or HTML body using `pg.email.extractCiphertext()`
2. Open and decrypt with `pg.open({ data }).decrypt()` using a session callback
3. Build sender identity badges from the `FriendlySender` result
4. Inject threading headers and an `X-PostGuard` marker into the decrypted MIME
5. Import the decrypted message back into the folder and delete the encrypted original

```ts
// Extract ciphertext using SDK
const ciphertext = pg.email.extractCiphertext({
  htmlBody: htmlBody ?? undefined,
  attachments: attData,
});

if (!ciphertext) {
  return { ok: false, error: "decryptionError" };
}

// Decrypt using SDK: open sealed data, then decrypt with session callback
const opened = pg.open({ data: ciphertext });
const result = await opened.decrypt({
  recipient: myAddresses[0],
  session: async ({ con, sort, hints, senderId }) => {
    return createYiviPopup(
      con as AttributeCon,
      sort as KeySort,
      hints as AttributeCon | undefined,
      senderId
    );
  },
}) as DecryptDataResult;

const plaintext = new TextDecoder().decode(result.plaintext);

// Build badges from sender identity (FriendlySender format)
const sender = result.sender;
const badges = (sender?.attributes ?? []).map(
  ({ type: t, value: v }) => ({
    type: typeToImage(t),
    value: v ?? "",
  })
);

// Inject threading headers and X-PostGuard marker
let markedPlaintext = plaintext;
if (Object.keys(threadingHeaders).length > 0) {
  markedPlaintext = pg.email.injectMimeHeaders(
    markedPlaintext, threadingHeaders, threadingRemove
  );
}
markedPlaintext = pg.email.injectMimeHeaders(
  markedPlaintext, { "X-PostGuard": "decrypted" }
);

// Import decrypted message into the original folder
const file = new File([markedPlaintext], "decrypted.eml", { type: "text/plain" });
const importedMsg = await browser.messages.import(file, msg.folder.id);
```

<small>[Source: background.ts#L693-L771](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L693-L771)</small>

## Detecting PostGuard Emails

Check if a message is PostGuard-encrypted by looking for the attachment or armored payload marker:

```ts
async function isPGEncrypted(msgId: number): Promise<boolean> {
  const attachments = await browser.messages.listAttachments(msgId);
  if (attachments.some((att) => att.name === "postguard.encrypted")) return true;

  try {
    const full = await browser.messages.getFull(msgId);
    const bodyHtml = findHtmlBody(full);
    if (bodyHtml && bodyHtml.includes("-----BEGIN POSTGUARD MESSAGE-----")) return true;
  } catch {
    // ignore
  }

  return false;
}
```

<small>[Source: background.ts#L232-L248](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L232-L248)</small>

## Outlook-Specific Notes

The Outlook addon uses the Office JS API instead of WebExtension APIs:

- Manifest: XML-based (`manifest.xml`) instead of `manifest.json`
- Taskpane: decryption UI shown in a side panel when reading encrypted messages
- Compose pane: encryption toggle and policy editor
- Dialog: `Office.context.ui.displayDialogAsync()` for Yivi popups, with `messageParent()` to return JWTs
- Event handlers: `OnMessageSend` for encryption, `OnMessageRead` for auto-decryption
- State: `sessionStorage` for compose state (encryption toggle, policies, signing identity)

The core encryption/decryption logic is the same. Only the UI plumbing and extension APIs differ.

### Yivi dialog (Outlook)

The Outlook addon opens a dialog for Yivi sessions using `Office.context.ui.displayDialogAsync()`:

```ts
async function openYiviDialogForSigning(con: AttributeCon): Promise<string> {
  const dialogData = {
    hostname: PKG_URL,
    header: PG_CLIENT_HEADER,
    con,
    sort: "Signing",
    validity: secondsTill4AM(),
  };

  const encodedData = encodeURIComponent(JSON.stringify(dialogData));
  const dialogUrl = `${window.location.origin}/dialog.html?data=${encodedData}`;

  return new Promise<string>((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      dialogUrl,
      { height: 60, width: 40, promptBeforeOpen: false },
      (asyncResult) => {
        if (asyncResult.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error("Failed to open signing dialog"));
          return;
        }
        const dialog = asyncResult.value;

        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg: { message: string }) => {
          dialog.close();
          try {
            const message = JSON.parse(arg.message);
            if (message.jwt) resolve(message.jwt);
            else reject(new Error(message.error || "No JWT"));
          } catch {
            reject(new Error("Invalid dialog response"));
          }
        });

        dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
          reject(new Error("Dialog was closed"));
        });
      }
    );
  });
}
```

<small>[Source: commands.ts#L149-L189](https://github.com/encryption4all/postguard-outlook-addon/blob/dd0073b568a94524e2658dd44e2851d2dccfac82/src/commands/commands.ts#L149-L189)</small>

The dialog receives data via URL parameters and sends the JWT back with `Office.context.ui.messageParent()`:

```ts
function initializeDialog(): void {
  let data: DialogData;
  try {
    data = getDialogData();
  } catch (e) {
    console.error("[PostGuard Dialog] Failed to get dialog data:", e);
    return;
  }

  // Initialize Yivi
  const yivi = new YiviCore({
    debugging: false,
    element: "#yivi-web-form",
    language: navigator.language.startsWith("nl") ? "nl" : "en",
    state: {
      serverSentEvents: false,
      polling: {
        endpoint: "status",
        interval: 500,
        startState: "INITIALIZED",
      },
    },
    session: {
      url: data.hostname,
      start: {
        url: (o: { url: string }) => `${o.url}/v2/request/start`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...data.header,
        },
        body: JSON.stringify({ con: data.con, validity: data.validity }),
      },
      result: {
        url: (o: { url: string }, { sessionToken }: { sessionToken: string }) =>
          `${o.url}/v2/request/jwt/${sessionToken}`,
        headers: data.header,
        parseResponse: (r: Response) => r.text(),
      },
    },
  });

  yivi.use(YiviClient);
  yivi.use(YiviWeb);
  yivi
    .start()
    .then((jwt: string) => {
      Office.context.ui.messageParent(JSON.stringify({ jwt }));
    })
    .catch((e: Error) => {
      Office.context.ui.messageParent(JSON.stringify({ error: e.message || "Yivi authentication failed" }));
    });
}
```

<small>[Source: dialog.ts#L50-L137](https://github.com/encryption4all/postguard-outlook-addon/blob/dd0073b568a94524e2658dd44e2851d2dccfac82/src/dialog/dialog.ts#L50-L137)</small>

## Bundling Considerations

Email extension environments have specific bundling requirements:

- WASM loading: use the `wasm` constructor option with a pre-loaded module. Copy the WASM binary to your extension's output directory during build.
- Dynamic imports: avoid where possible. Use static imports or extension-compatible loading patterns.
- Content Security Policy: your extension manifest must allow WASM execution (`'wasm-unsafe-eval'` in Manifest V3).
- File size: the `@e4a/pg-wasm` module is around 2 MB. Load it eagerly at startup rather than on first use.
- EventSource polyfill: the Yivi client uses `EventSource` for server-sent events. In Thunderbird, you may need to shim this module in your bundler since it is not used at runtime (SSE is disabled in favor of polling).
