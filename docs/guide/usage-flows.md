# Usage Flows

PostGuard supports four ways to send encrypted messages. Two are for individual users (PostGuard), and two are for organizations (PostGuard for Business).

## PostGuard (personal)

Both personal flows use a Yivi-to-Yivi model. As the sender, you use your Yivi app to sign the message with your verified identity. You also specify which attributes the recipient must prove with their Yivi app to decrypt the message (typically their email address).

### Website

You encrypt your message or files through the [postguard.eu](https://postguard.eu) website. The website sends an email notification to the recipient from `noreply@postguard.eu`. The encrypted content is stored on Cryptify, and the email contains a link for the recipient to download and decrypt it.

### Email addon

You compose your email in Thunderbird or Outlook as usual, then encrypt it before sending. The addon handles the Yivi signing step and the encryption. Because you send the email yourself, it comes from your own email address. If the encrypted content is small enough, the addon embeds it directly in the email body. If it is too large for email, the addon uploads it to Cryptify in the background and includes a download link instead.

## PostGuard for Business

Both business flows replace the Yivi signing step with an API key. When an organization enrolls in PostGuard for Business, PostGuard verifies the organization's identity. After this verification, the organization receives an API key that is linked to their verified information (organization name, domain, etc.). The API key lets the organization's systems sign messages automatically without needing a human to open the Yivi app each time.

The recipient still decrypts using Yivi, the same as with the personal flows. The difference is only on the sender side: the organization's verified identity replaces the individual's Yivi session.

### Send via Cryptify

You encrypt the message and send it through the Cryptify server. Cryptify delivers an email notification to the recipient from `noreply@postguard.eu` with a link to download and decrypt the content. This is the simplest business integration: one API call handles encryption, storage, and delivery.

### Upload to Cryptify, send your own email

You encrypt the message and upload the ciphertext to Cryptify, which returns a UUID. You then send your own email (from your own address, through your own mail server) and include the UUID or a download link in the message body. This gives you full control over the email content, sender address, and delivery.

## Comparison

| | Sender signing | Sender address | Delivery | Best for |
|---|---|---|---|---|
| Website | Yivi | `noreply@postguard.eu` | Cryptify email | Individuals sharing files |
| Email addon | Yivi | Your own | Email (small) or Cryptify (large) | Individuals sending encrypted email |
| Business: Cryptify send | API key | `noreply@postguard.eu` | Cryptify email | Automated notifications, simple integration |
| Business: Cryptify upload | API key | Your own | You handle it | Custom workflows, branded emails |
