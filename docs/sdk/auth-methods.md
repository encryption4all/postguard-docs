# Authentication Methods

PostGuard requires the sender to prove their identity before encrypting. The SDK supports three authentication methods, each suited to a different environment.

## Comparison

| Method | Environment | Yivi packages needed | Interactive |
|--------|-------------|---------------------|-------------|
| `pg.sign.apiKey()` | Server-side, trusted clients | No | No |
| `pg.sign.yivi()` | Browser apps | Yes | Yes (QR code) |
| `pg.sign.session()` | Extensions, custom flows | No | Depends on callback |

## API Key

Uses a pre-shared API key (prefixed with `PG-API-`) to authenticate with the PKG. Suitable for server-side applications or trusted client environments where you don't need interactive identity verification.

The SvelteKit example uses an API key for encryption:

```ts
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
```

<small>[Source: encryption.ts#L17-L32](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/postguard/encryption.ts#L17-L32)</small>

The SDK sends the API key as a `Bearer` token in the `Authorization` header when requesting signing keys from the PKG at `POST /v2/irma/sign/key`.

::: info
API keys are part of PostGuard for Business. Contact your PKG administrator to obtain one.
:::

## Yivi Web

Runs an interactive Yivi session directly in the browser. The SDK renders a QR code (or app link on mobile) in the specified DOM element. The user scans it with the Yivi app to prove their email address.

The SvelteKit download page uses the `element` parameter for Yivi-based decryption:

```ts
		recipientParam = params.get('recipient') ?? '';

		if (uuid) {
			startDownload();
		} else {
			dlState = 'loading';
```

<small>[Source: +page.svelte#L44-L49](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/routes/download/+page.svelte#L44-L49)</small>

### Requirements

The Yivi web packages must be installed:

```sh
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

If they are not installed, the SDK throws a `YiviNotInstalledError` when you try to use this method.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element` | `string` | Yes | CSS selector for the QR code container |
| `senderEmail` | `string` | Yes | The sender's email address to prove |
| `includeSender` | `boolean` | No | Also encrypt for the sender (default: `false`) |

## Session Callback

The most flexible method. You provide a callback function that receives a session request and must return a JWT string. This lets you handle the Yivi session yourself: in a popup window, a separate process, or any custom flow.

The Thunderbird addon uses this for both encryption and decryption. For encryption, the session callback opens a Yivi popup:

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

For decryption:

```ts
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

<small>[Source: background.ts#L727-L738](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L727-L738)</small>

The `createYiviPopup` function opens a browser popup and resolves with the JWT when the Yivi session completes:

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
```

<small>[Source: background.ts#L608-L658](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L608-L658)</small>

### The popup page

The popup uses the SDK's `runYiviSession()` utility to handle the full Yivi flow:

```ts
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

<small>[Source: yivi-popup.ts#L56-L96](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/pages/yivi-popup/yivi-popup.ts#L56-L96)</small>

### Outlook dialog pattern

The Outlook addon uses `Office.context.ui.displayDialogAsync()` instead of `browser.windows.create()`:

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

See the [Email Addon Integration](/integrations/email-addon) guide for the full patterns.

## Decryption Authentication

Decryption also requires identity verification. The same `element` and `session` patterns apply. You must provide either `element` or `session` for decryption. If neither is provided, the SDK throws a `DecryptionError`.
