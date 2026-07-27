# Smart BCC — inbound email setup (ops)

Backend code is shipped (feature F3). To actually capture mail, the pieces
below have to be wired up on the deploy host and in Cloudflare. Nothing here
is reversible without breaking capture, so do it in one sitting.

## What it does

The user BCCs a personal magic address from Outlook / Gmail / Apple Mail —
whatever they already use — and the message lands on the right company,
contact and deal timeline in the CRM. No OAuth, no mailbox sync, no Google
verification review.

```
user's mail client
  └─ BCC: bcc+<token>@in.simplecrm.cz
       └─ MX  →  Cloudflare Email Routing
            └─ Email Worker  ──POST raw MIME──►  POST /api/v1/inbound-email
                                                   (X-Inbound-Secret header)
                                                        └─ parse → match → timeline
```

The `+<token>` is per user (`users.inbound_token`, 96 bits of lowercase hex,
minted on first read of the address in the app, rotatable from the UI). One MX
record serves every user in every org. **The token is a credential** — anyone
who knows it can write into that user's timeline — so it is only ever shown to
its owner. It is matched case-insensitively, and deliberately minted from a
case-flat alphabet: addresses are lower-cased on the way in (MTAs rewrite case
freely), so a mixed-case token would never resolve back to its user.

Matching, in order, and never a guess:

1. token in any of `To` / `Cc` / `Bcc` / `Delivered-To` / `X-Original-To` →
   the owning user (no token → HTTP 202, nothing stored);
2. correspondent = first `To`/`Cc` address that is neither the user's own nor
   an `@in.simplecrm.cz` one; falls back to `From` for received mail;
3. contact with that email in the user's org → its company; else a company
   with that email;
4. deal — only when the matched company has **exactly one** open deal.
   Two or more, or none: the mail stays on the company timeline.
5. No match at all still stores the message (`outcome: "unmatched"`) so the
   user is never silently ignored.

---

## 1. DNS — MX for `in.simplecrm.cz`

The subdomain is deliberately separate from `simplecrm.cz`, whose MX points
at Zoho (see the Zoho block in `docs/TODO.md`). Do **not** touch those.

1. Cloudflare dashboard → the `simplecrm.cz` zone → **Email** → **Email
   Routing** → Get started.
2. Add `in.simplecrm.cz` as the routed domain (Email Routing → Settings →
   Custom domains, or add `in.simplecrm.cz` as its own zone if the parent's
   DNS is not on Cloudflare).
3. Cloudflare shows the exact records to publish — three `MX` records at
   `*.mx.cloudflare.net` plus one `TXT` SPF record. If DNS for the zone is on
   Cloudflare it adds them itself; if the zone still lives at wedos.cz, copy
   them **verbatim** from that screen (the hostnames are zone-specific — do
   not copy them from a blog post).
4. Wait for the Email Routing status to flip to **Active** before continuing.
   `dig MX in.simplecrm.cz +short` should return the Cloudflare hosts.

## 2. Cloudflare Email Worker

Email Routing → **Email Workers** → Create. Paste the script below, deploy it,
then go back to Email Routing → **Routes** and set the **catch-all** action for
`in.simplecrm.cz` to *Send to a Worker* → this worker. Catch-all matters: every
user has a different `+token`, so per-address rules are unusable.

```js
// Cloudflare Email Worker — forwards the raw message to SimpleCRM.
// Bindings (Settings → Variables): INBOUND_URL, INBOUND_SHARED_SECRET (encrypt it).
export default {
  async email(message, env) {
    // Match INBOUND_MAX_BYTES on the API side; rejecting here saves a
    // pointless 10 MB upload and gives the sender a real bounce.
    const maxBytes = Number(env.INBOUND_MAX_BYTES || 10 * 1024 * 1024);
    if (message.rawSize > maxBytes) {
      message.setReject("Message too large for CRM capture");
      return;
    }

    const res = await fetch(env.INBOUND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "message/rfc822",
        "X-Inbound-Secret": env.INBOUND_SHARED_SECRET,
      },
      // `message.raw` is a ReadableStream of the exact bytes we received —
      // no re-encoding, so signatures and non-UTF8 charsets survive intact.
      body: message.raw,
    });

    // 2xx = handled (including "not ours" and "nothing matched" — both are
    // deliberate). Only a server-side failure should make the MTA retry.
    if (res.status >= 500) {
      message.setReject("CRM temporarily unavailable, retry later");
    }
  },
};
```

Worker variables:

```
INBOUND_URL           = https://api.simplecrm.cz/api/v1/inbound-email
INBOUND_SHARED_SECRET = <same value as the API env var below — mark as Secret>
INBOUND_MAX_BYTES     = 10485760
```

## 3. API env vars (Coolify UI → SimpleCRM service → Environment)

```
INBOUND_EMAIL_DOMAIN       = in.simplecrm.cz
INBOUND_EMAIL_LOCAL_PREFIX = bcc
INBOUND_SHARED_SECRET      = <openssl rand -base64 32>
INBOUND_MAX_BYTES          = 10485760
```

⚠️ **`INBOUND_SHARED_SECRET` is a boot requirement.** With `APP_ENV != dev`
the app now refuses to start without it — it is the only credential on a
public write endpoint, and an empty value would let anyone on the internet
inject email into any org's timeline. Set it in the same deploy as the code,
or the service will not come up.

Generate it with:

```bash
openssl rand -base64 32
```

`INBOUND_EMAIL_LOCAL_PREFIX` only changes the human-readable half of the
address (`bcc+…`). Changing `INBOUND_EMAIL_DOMAIN` or the prefix after users
have saved their address in their contacts **invalidates the addresses they
are already using** — the tokens still exist, but mail to the old domain no
longer arrives. Pick both before launch.

**In dev** (`APP_ENV=dev`) nothing sets `INBOUND_SHARED_SECRET` — neither
`docker-compose.dev.yml` nor host mode — so the endpoint accepts the fallback
`dev-inbound-secret` there, and only there. Any deployment reaching this
branch is impossible: the boot check above rejects an empty secret outside
dev. Use it for the smoke test below on localhost:

```bash
-H "X-Inbound-Secret: dev-inbound-secret"
```

## 4. Smoke test

With a `.eml` file on disk (any mail client can "Save as" one), or the
minimal message below:

```bash
cat > /tmp/sample.eml <<'EOF'
From: Jan Novak <jan@acme.cz>
To: prodejce@example.cz, bcc+PASTE_TOKEN_HERE@in.simplecrm.cz
Subject: Cenova nabidka
Message-ID: <smoke-test-1@acme.cz>
Date: Mon, 27 Jul 2026 10:15:00 +0200
Content-Type: text/plain; charset="utf-8"

Dobry den, posilam nabidku.
EOF

curl -i -X POST https://api.simplecrm.cz/api/v1/inbound-email \
  -H "X-Inbound-Secret: $INBOUND_SHARED_SECRET" \
  -H "Content-Type: message/rfc822" \
  --data-binary @/tmp/sample.eml
```

Get `PASTE_TOKEN_HERE` from the app: `GET /api/v1/me/inbound-address` while
logged in returns `{"address": "...", "local_part": "..."}` (the address is
minted on that first call).

Expected answers — **every one of them is a 2xx on purpose**, so a routing
decision never turns into a mail-server retry loop or a bounce to the user:

| Status | `outcome`   | Meaning                                                   |
| ------ | ----------- | --------------------------------------------------------- |
| 201    | `matched`   | Stored and linked to a company (and a deal, if unambiguous) |
| 201    | `unmatched` | Stored, but the correspondent matched nothing in the CRM   |
| 200    | `duplicate` | This `Message-ID` was already captured for the org         |
| 202    | `no_token`  | No (or unknown) magic address in the recipients — not ours |
| 202    | `no_org`    | Token resolved, but that user has no organization yet      |
| 401    | —           | Missing/wrong `X-Inbound-Secret`                           |
| 413    | —           | Body over `INBOUND_MAX_BYTES`                              |

The JSON shape is also accepted, which is handy when the raw bytes are
awkward to pipe:

```bash
curl -i -X POST https://api.simplecrm.cz/api/v1/inbound-email \
  -H "X-Inbound-Secret: $INBOUND_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"raw_mime\": \"$(base64 < /tmp/sample.eml | tr -d '\n')\"}"
```

`raw_mime` is decoded as base64 first and as plain text if that fails, so a
verbatim message pasted into the JSON also works. The raw-body form is
preferred — it is byte-exact and needs no encoding step in the worker.

Then, end to end: send yourself a real mail with the magic address in BCC and
confirm it appears on the customer's company timeline within a few seconds.

## 5. Privacy note (tell users, and put it in the DPA)

**Inbound message bodies are stored in the CRM.** Whatever a user BCCs is
persisted in `sent_emails` (subject, plain-text body capped at 100k chars,
sender/recipient addresses, attachment *filenames*), visible to everyone in
their organization who can see that company or deal, per the normal
role-scoping rules. Attachment *contents* are never stored.

Consequences worth stating explicitly to a customer:

- BCCing a private conversation copies it into a shared workspace. That is
  the point of the feature, and also its main footgun.
- The capture is per-user and revocable: rotating the address in the app
  (`POST /api/v1/me/inbound-address/rotate`) instantly makes the old one
  inert.
- GDPR erasure requests already cascade from the organization and company
  records; inbound rows are ordinary `sent_emails` rows and follow that path.
- Cloudflare Email Routing processes the message in transit. It is covered by
  the same DPA as the rest of the Cloudflare edge; note it in the sub-
  processor list next to Hetzner and ComGate.

## 6. Troubleshooting

| Symptom                                | Look at                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Nothing arrives at all                  | Email Routing status **Active**? `dig MX in.simplecrm.cz`. Catch-all route points at the Worker? |
| Worker logs a 401                       | `INBOUND_SHARED_SECRET` differs between the Worker binding and the API env. They must be byte-identical. |
| Everything answers `no_token`           | The BCC was stripped and no `Delivered-To`/`X-Original-To` survived, or the address's domain/prefix does not match `INBOUND_EMAIL_DOMAIN`/`INBOUND_EMAIL_LOCAL_PREFIX`. |
| Mail is captured but sits on no company | Expected `unmatched`: the correspondent's address is not on any contact or company in that org. Add the contact and re-BCC (the `Message-ID` differs, so it is not a duplicate). |
| Mail lands on the company, not the deal | By design when the company has zero or 2+ open deals — we never guess which opportunity a mail belongs to. |
| Duplicates                              | Shouldn't happen: `(organization_id, message_id)` is unique, and a repeat answers 200 `duplicate`. |
