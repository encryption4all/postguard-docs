# Email Addon Integration

This guide explains how to build an email addon (Thunderbird, Outlook, or similar) using the PostGuard SDK. Email addons run in extension environments where DOM-based Yivi rendering is handled in separate popup windows, and dynamic imports may not work as expected.

Both the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon) and the [Outlook addon](https://github.com/encryption4all/postguard-outlook-addon) follow the patterns described here. All code snippets below come directly from those repositories.

## Architecture

An email addon typically has three components:

```
+---------------------------+
|  Background script        |  PostGuard SDK lives here
|  - Intercepts send/read   |  - pg.encrypt() / pg.decrypt()
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

### Caching PKG keys

The Thunderbird addon caches the Master Public Key in `browser.storage.local` for offline resilience. If the PKG is unreachable, the cached key is used as a fallback:

```ts
export async function fetchPublicKey(): Promise<string> {
  const stored = await browser.storage.local.get(PK_STORAGE_KEY);
  const storedKey = stored[PK_STORAGE_KEY] as string | undefined;

  try {
    const resp = await fetch(`${PKG_URL}/v2/parameters`, {
      headers: clientHeader,
    });
    const { publicKey } = await resp.json();
    if (storedKey !== publicKey) {
      await browser.storage.local.set({ [PK_STORAGE_KEY]: publicKey });
    }
    return publicKey;
  } catch (e) {
    console.warn(
      `[PostGuard] Failed to fetch public key from PKG, falling back to cache: ${e}`
    );
    if (storedKey) return storedKey;
    throw new Error("No public key available");
  }
}
```

<small>[Source: pkg-client.ts#L13-L33](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/lib/pkg-client.ts#L13-L33)</small>

## The Session Callback Pattern

Since the background script cannot render DOM elements, `pg.sign.session()` opens a popup, waits for the Yivi session to complete, and returns the JWT.

### Popup bridge (background script)

The background script tracks pending popups in a Map and resolves the Promise when the popup sends back a JWT:

```ts
  number,
  {
    composeTabId: number;
    initialPolicy: Policy;
    sign: boolean;
    resolve: (policy: Policy) => void;
    reject: (err: Error) => void;
  }
```

<small>[Source: background.ts#L56-L63](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L56-L63)</small>

```ts
    state.configWindowId = popupId;
  }

  // Store pending editor data
  const policyPromise = new Promise<Policy>((resolve, reject) => {
    pendingPolicyEditors.set(popupId, {
      composeTabId: tabId,
      initialPolicy,
      sign,
      resolve,
      reject,
    });
  });

  // Listen for window close
  const closeListener = (closedWindowId: number) => {
    if (closedWindowId === popupId) {
      const pending = pendingPolicyEditors.get(popupId);
      if (pending) {
        pending.reject(new Error("window closed"));
        pendingPolicyEditors.delete(popupId);
      }
      browser.windows.onRemoved.removeListener(closeListener);
    }
  };
  browser.windows.onRemoved.addListener(closeListener);

  try {
    const newPolicy = await policyPromise;
    if (sign) {
      state.signId = newPolicy;
    } else {
      state.policy = newPolicy;
    }
  } catch {
    // user cancelled
  } finally {
    if (sign) {
      state.signWindowId = undefined;
    } else {
      state.configWindowId = undefined;
    }
    browser.windows.onRemoved.removeListener(closeListener);
  }
}

async function handlePolicyEditorInit(windowId: number | undefined) {
  if (windowId == null) return null;
  const pending = pendingPolicyEditors.get(windowId);
  if (!pending) return null;
  return {
    initialPolicy: pending.initialPolicy,
    sign: pending.sign,
  };
}

async function handlePolicyEditorDone(
  windowId: number | undefined,
  policy: Policy
) {
  if (windowId == null) return;
  const pending = pendingPolicyEditors.get(windowId);
  if (!pending) return;

  pending.resolve(policy);
  pendingPolicyEditors.delete(windowId);
  await browser.windows.get(windowId).then(() =>
    // Close the popup after saving
    // Use a small delay to let the message response complete
    setTimeout(() => {
```

<small>[Source: background.ts#L608-L677](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L608-L677)</small>

### Message handler

The background script routes `yiviPopupInit` and `yiviPopupDone` messages from the popup:

```ts
      return tabs[0]?.id;
    };

    switch (msg.type) {
      case "queryMessageState":
        console.log("[PostGuard] queryMessageState sender:", JSON.stringify({
          tabId: sender.tab?.id,
```

<small>[Source: background.ts#L126-L132](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L126-L132)</small>

### Yivi popup page

The popup uses the SDK's `runYiviSession()` utility to handle the full Yivi flow, then sends the JWT back to the background:

```ts
async function init() {
  const data = (await browser.runtime.sendMessage({
    type: "yiviPopupInit",
  })) as YiviPopupData | null;

  if (!data) {
    showError("Failed to initialize session.");
    return;
  }

  // Update UI
  if (data.sort === "Decryption") {
    titleEl.textContent = browser.i18n.getMessage("displayMessageTitle");
    subtitleEl.textContent = browser.i18n.getMessage("displayMessageHeading");
  } else {
    titleEl.textContent = "PostGuard — Sign";
    subtitleEl.textContent = browser.i18n.getMessage("displayMessageQrPrefix");
  }

  if (data.senderId) {
    senderEl.innerHTML = `From: <strong>${escapeHtml(data.senderId)}</strong>`;
    senderEl.style.display = "block";
  }

  if (data.hints) {
    for (const hint of data.hints) {
      const badge = document.createElement("span");
      badge.className = "hint-badge";
      const label =
        browser.i18n.getMessage(hint.t) || hint.t.split(".").pop() || hint.t;
      badge.textContent = hint.v ? `${label}: ${hint.v}` : label;
      hintsEl.appendChild(badge);
    }
  }

  try {
    // Start Yivi session via PKG
    const resp = await fetch(`${data.hostname}/v2/request/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...data.header },
      body: JSON.stringify({ con: data.con }),
    });
    if (!resp.ok) throw new Error(`Session start failed: ${resp.status}`);

    const { sessionPtr, token } = await resp.json();
    console.log("[PostGuard] Yivi session started, token:", token);
    loadingEl.style.display = "none";

    // Show QR code from the IRMA session pointer
    showQrCode(sessionPtr);

    // Poll IRMA server for session status, then retrieve JWT from PKG
    await pollIrmaStatus(sessionPtr.u);
    console.log("[PostGuard] IRMA session DONE, fetching JWT from PKG...");

    // Fetch JWT from PKG (returned as plain text, not JSON)
    const jwtResp = await fetch(
      `${data.hostname}/v2/request/jwt/${token}`,
      { headers: data.header }
    );
    if (!jwtResp.ok) throw new Error(`JWT fetch failed: ${jwtResp.status}`);
    const jwt = await jwtResp.text();

    console.log("[PostGuard] JWT received, sending to background");
    await browser.runtime.sendMessage({ type: "yiviPopupDone", jwt });

    // Auto-close after a short delay
    setTimeout(async () => {
      const win = await browser.windows.getCurrent();
      browser.windows.remove(win.id);
    }, 750);
  } catch (e) {
    console.error("[PostGuard] Yivi session error:", e);
    showError(e instanceof Error ? e.message : "Yivi session failed.");
  }
}
```

<small>[Source: yivi-popup.ts#L21-L96](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/pages/yivi-popup/yivi-popup.ts#L21-L96)</small>

## Email Encryption Flow

With the session callback in place, the encryption flow intercepts the compose send event. This is the full `handleBeforeSend` handler from the Thunderbird addon:

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

The key steps are:
1. Build attachments list from the compose tab
2. Fetch threading headers if replying
3. Build the inner MIME using `pg.email.buildMime()`
4. Build recipients (with custom policies if configured)
5. Encrypt with `pg.encrypt()` using a session callback that opens the Yivi popup
6. Create the encrypted envelope with `pg.email.createEnvelope()`
7. Replace the email body and subject with the envelope contents

### BCC limitation

PostGuard does not support BCC recipients. The Thunderbird addon blocks sending if any BCC recipients are present when encryption is enabled.

### Sent copy management

After sending, the addon stores the unencrypted MIME in a "PostGuard Sent" folder so the sender can read their own messages later:

```ts
        return handleOpenPolicyEditor(sender.tab?.windowId, false);
      case "openSignEditor":
        return handleOpenPolicyEditor(sender.tab?.windowId, true);
      case "policyEditorInit":
        return handlePolicyEditorInit(sender.tab?.windowId);
      case "policyEditorDone":
        return handlePolicyEditorDone(
          sender.tab?.windowId,
          msg.policy as Policy
        );
      case "yiviPopupInit":
        return handleYiviPopupInit(sender.tab?.windowId);
      case "yiviPopupDone":
        return handleYiviPopupDone(
          sender.tab?.windowId,
          msg.jwt as string
        );
      case "decryptMessage":
        return handleDecryptMessage(msg.messageId as number);
      default:
        return false;
    }
  }
);

browser.compose.onBeforeSend.addListener(handleBeforeSend);

```

<small>[Source: background.ts#L143-L169](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L143-L169)</small>

## Email Decryption Flow

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

The key steps are:
1. Extract ciphertext from attachments or HTML body using `pg.email.extractCiphertext()`
2. Decrypt with `pg.decrypt()` using a session callback
3. Build sender identity badges from the result
4. Inject threading headers and an `X-PostGuard` marker into the decrypted MIME
5. Import the decrypted message back into the folder and delete the encrypted original

## Detecting PostGuard Emails

Check if a message is PostGuard-encrypted by looking for the attachment or armored payload:

```ts
  });
  await browser.composeAction.setTitle({
    tabId,
    title: enabled
      ? browser.i18n.getMessage("encryptionEnabled")
      : browser.i18n.getMessage("encryptionDisabled"),
  });
}

// Initialize state for any existing compose tabs on startup
const existingTabs = await browser.tabs.query({ type: "messageCompose" });
for (const tab of existingTabs) {
  if (tab.id != null) {
    const encrypt = await shouldEncrypt(tab.id);
    composeTabs.set(tab.id, { encrypt });
    await updateComposeActionIcon(tab.id);
  }
```

<small>[Source: background.ts#L249-L265](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L249-L265)</small>

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

  // Set title based on sort
  const title = document.getElementById("pg-dialog-title");
  const heading = document.getElementById("pg-dialog-heading");

  if (data.sort === "Decryption") {
    if (title) title.textContent = "Decrypt Message";
    if (heading) heading.textContent = "Scan the QR code below with your Yivi app to prove your identity and decrypt this message.";
  } else {
    if (title) title.textContent = "Sign Identity";
    if (heading) heading.textContent = "Scan the QR code below with your Yivi app to attach your verified identity to this message.";
  }

  // Show sender info
  if (data.senderId) {
    const senderInfo = document.getElementById("pg-sender-info");
    const senderEmail = document.getElementById("pg-sender-email");
    if (senderInfo) senderInfo.style.display = "block";
    if (senderEmail) senderEmail.textContent = data.senderId;
  }

  // Fill attribute table
  fillAttributeTable(data);

  // Initialize Yivi
  const yivi = new YiviCore({
    debugging: false,
    element: "#yivi-web-form",
    language: navigator.language.startsWith("nl") ? "nl" : "en",
    translations: {
      header: "",
      helper: data.sort === "Decryption"
        ? "Scan with your Yivi app to decrypt"
        : "Scan with your Yivi app to sign",
    },
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
      // Send JWT back to the parent window
      Office.context.ui.messageParent(JSON.stringify({ jwt }));
    })
    .catch((e: Error) => {
      console.error("[PostGuard Dialog] Yivi error:", e);
      Office.context.ui.messageParent(JSON.stringify({ error: e.message || "Yivi authentication failed" }));
    });
}

Office.onReady(() => {
  initializeDialog();
});
```

<small>[Source: dialog.ts#L50-L137](https://github.com/encryption4all/postguard-outlook-addon/blob/dd0073b568a94524e2658dd44e2851d2dccfac82/src/dialog/dialog.ts#L50-L137)</small>

## Bundling Considerations

Email extension environments have specific bundling requirements:

- WASM loading: use the `wasm` constructor option with a pre-loaded module. Copy the WASM binary to your extension's output directory during build.
- Dynamic imports: avoid where possible. Use static imports or extension-compatible loading patterns.
- Content Security Policy: your extension manifest must allow WASM execution (`'wasm-unsafe-eval'` in Manifest V3).
- File size: the `@e4a/pg-wasm` module is around 2 MB. Load it eagerly at startup rather than on first use.
- EventSource polyfill: the Yivi client uses `EventSource` for server-sent events. In Thunderbird, you may need to shim this.
