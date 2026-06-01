# Resend Email Infrastructure

Deplyze Quant sends email only from the Cloud Run gateway. The Vite client only reads and updates user email preferences through authenticated gateway routes.

## Production Requirements

- Verify the Deplyze sending domain in Resend before live sends.
- Set `RESEND_FROM_EMAIL` to an address on that verified domain, for example `Deplyze Quant <intelligence@deplyze.com>`.
- Store `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `EMAIL_UNSUBSCRIBE_SECRET` as Cloud Run secrets or Secret Manager-backed environment variables.
- Register the webhook endpoint in Resend:
  - `POST https://<gateway-host>/webhooks/resend`
  - Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.opened`, and `email.clicked`.

## Firestore Collections

- `users/{uid}/emailPreferences/current`: per-user preferences.
- `emailDeliveryLogs/{emailType_date_uid}`: idempotent delivery state and Resend IDs.
- `emailWebhookEvents/{svix-id}`: verified webhook event store for duplicate suppression and audit.
- `emailPreferenceEvents/{id}`: unsubscribe and preference audit events.

## Safe Send Flow

1. Send only to internal test recipients:
   `npm --prefix cloud-run/gateway run email:test -- --email-type=daily_portfolio_brief --to=ops@deplyze.com`
2. Confirm the email in the Resend dashboard and verify webhook ingestion:
   `npm --prefix cloud-run/gateway run email:verify-webhooks`
3. Dry-run the opted-in batch:
   `npm --prefix cloud-run/gateway run email:batch:dry-run -- --email-type=daily_portfolio_brief --date=YYYY-MM-DD`
4. Enable live controlled batch sends only for the production run:
   `EMAIL_BATCH_ENABLE=true npm --prefix cloud-run/gateway run email:batch:send -- --email-type=daily_portfolio_brief --date=YYYY-MM-DD`

Each Resend batch is capped at 100 recipients, uses an idempotency key, waits between batches, and skips users with an existing pending or sent log for the same user/date/email type.
