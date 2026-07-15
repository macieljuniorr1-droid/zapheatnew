
ALTER TABLE public.number_subscriptions
  ADD COLUMN IF NOT EXISTS renewal_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS pagarme_card_id text,
  ADD COLUMN IF NOT EXISTS last_order_id text,
  ADD COLUMN IF NOT EXISTS renewal_order_id text;

CREATE INDEX IF NOT EXISTS number_subscriptions_renewal_idx
  ON public.number_subscriptions (status, current_period_end)
  WHERE status IN ('active','past_due');
