NOT A PROMPT its for me, the human, only
Setup real payment method.
Setup real company email for invoices emailing.
Implement feedback window into the app
LEarn how to use super admin
Implement invoices management

Claude Zone here:
- After real Stripe is wired up: add a scheduled `process_period_rollovers()`
  job that walks subscriptions whose `current_period_ends_at` has passed and
  applies `pending_plan_id`, `pending_seat_count`, and
  `pending_user_deactivations` automatically. Today the super-admin Aktivovat
  path is the only apply route — fine for the no-Stripe phase.
