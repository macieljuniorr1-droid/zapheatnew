-- 1. Extensões usadas pelo Pagar.me flow (idempotente)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Colunas de billing no subscriptions existente
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pagarme_customer_id text,
  ADD COLUMN IF NOT EXISTS free_number_bonus int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- 3. Tabela de assinaturas de números (1 linha = 1 chip pago, R$25/mês)
CREATE TABLE IF NOT EXISTS public.number_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pagarme_subscription_id text UNIQUE,
  pagarme_plan_id text,
  payment_method text NOT NULL CHECK (payment_method IN ('pix','credit_card')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','past_due','canceled')),
  price_cents int NOT NULL DEFAULT 2500,
  current_period_end timestamptz,
  canceled_at timestamptz,
  last_charge_url text,
  last_pix_qr_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.number_subscriptions TO authenticated;
GRANT ALL ON public.number_subscriptions TO service_role;

ALTER TABLE public.number_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin"
  ON public.number_subscriptions FOR ALL
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS number_subscriptions_user_status_idx
  ON public.number_subscriptions(user_id, status);

-- 4. Log de eventos do webhook do Pagar.me (idempotência + auditoria)
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  number_subscription_id uuid REFERENCES public.number_subscriptions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  pagarme_event_id text UNIQUE,
  amount_cents int,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin read events"
  ON public.billing_events FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 5. Config global do Pagar.me (opcional — secrets também servem, mas útil pro admin ver status)
CREATE TABLE IF NOT EXISTS public.pagarme_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  plan_id text,
  webhook_url text,
  is_live boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pagarme_config TO authenticated;
GRANT ALL ON public.pagarme_config TO service_role;

ALTER TABLE public.pagarme_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage pagarme_config"
  ON public.pagarme_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.pagarme_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 6. Quota de números do usuário: 2 grátis + bônus manual + chips pagos ativos
CREATE OR REPLACE FUNCTION public.user_number_quota(_user_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 2
    + COALESCE((SELECT free_number_bonus FROM public.subscriptions WHERE user_id = _user_id), 0)
    + COALESCE((SELECT COUNT(*)::int FROM public.number_subscriptions
                WHERE user_id = _user_id AND status = 'active'), 0);
$$;

-- 7. Resumo financeiro para o painel admin master
CREATE OR REPLACE FUNCTION public.admin_financial_summary()
RETURNS TABLE(
  mrr_cents bigint,
  active_paid_numbers bigint,
  past_due_numbers bigint,
  canceled_last_30d bigint,
  active_users bigint,
  suspended_users bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(price_cents) FILTER (WHERE status = 'active'), 0)::bigint,
    COUNT(*) FILTER (WHERE status = 'active')::bigint,
    COUNT(*) FILTER (WHERE status = 'past_due')::bigint,
    COUNT(*) FILTER (WHERE status = 'canceled' AND canceled_at >= now() - interval '30 days')::bigint,
    (SELECT COUNT(*) FROM public.subscriptions WHERE NOT suspended)::bigint,
    (SELECT COUNT(*) FROM public.subscriptions WHERE suspended)::bigint
  FROM public.number_subscriptions;
$$;

-- 8. Trigger para manter updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS number_subscriptions_touch ON public.number_subscriptions;
CREATE TRIGGER number_subscriptions_touch
  BEFORE UPDATE ON public.number_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();