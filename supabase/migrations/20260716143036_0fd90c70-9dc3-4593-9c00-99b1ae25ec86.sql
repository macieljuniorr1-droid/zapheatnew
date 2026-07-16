-- =========================================================
-- WALLETS
-- =========================================================
CREATE TABLE public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_owner_select" ON public.wallets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- WALLET TRANSACTIONS (extrato)
-- =========================================================
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('topup','purchase','refund','adjustment')),
  amount_cents bigint NOT NULL, -- positivo = crédito, negativo = débito
  balance_after_cents bigint NOT NULL,
  description text NOT NULL,
  reference_id text, -- pagarme order id, virtual_number_order.id, etc
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;

CREATE INDEX idx_wallet_tx_user_created ON public.wallet_transactions (user_id, created_at DESC);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_tx_owner_select" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- =========================================================
-- VIRTUAL NUMBER ORDERS
-- =========================================================
CREATE TABLE public.virtual_number_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'sms-activate',
  activation_id text, -- id retornado pelo provider
  country_code text NOT NULL,  -- código do provider (ex: "73" brasil)
  country_label text NOT NULL, -- nome amigável ("Brasil")
  service text NOT NULL DEFAULT 'wa', -- WhatsApp
  phone_number text,
  sms_code text,
  full_sms text,
  price_cents bigint NOT NULL, -- valor debitado da carteira
  provider_cost_cents bigint,  -- custo do provider em BRL (auditoria)
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','received','done','canceled','refunded','expired','error')),
  error_message text,
  expires_at timestamptz,
  received_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.virtual_number_orders TO authenticated;
GRANT ALL ON public.virtual_number_orders TO service_role;

CREATE INDEX idx_vno_user_created ON public.virtual_number_orders (user_id, created_at DESC);
CREATE INDEX idx_vno_status ON public.virtual_number_orders (status) WHERE status IN ('waiting','received');

ALTER TABLE public.virtual_number_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vno_owner_select" ON public.virtual_number_orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER vno_updated_at BEFORE UPDATE ON public.virtual_number_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- FUNÇÃO: aplica movimentação atômica na carteira
-- =========================================================
CREATE OR REPLACE FUNCTION public.wallet_apply(
  _user_id uuid,
  _kind text,
  _amount_cents bigint,
  _description text,
  _reference_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(balance_cents bigint, tx_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance bigint;
  v_tx_id uuid;
BEGIN
  INSERT INTO public.wallets (user_id, balance_cents)
    VALUES (_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
     SET balance_cents = balance_cents + _amount_cents,
         updated_at = now()
   WHERE user_id = _user_id
   RETURNING balance_cents INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', _user_id;
  END IF;
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, kind, amount_cents, balance_after_cents, description, reference_id, metadata)
  VALUES (_user_id, _kind, _amount_cents, v_new_balance, _description, _reference_id, _metadata)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_new_balance, v_tx_id;
END $$;

REVOKE ALL ON FUNCTION public.wallet_apply(uuid,text,bigint,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_apply(uuid,text,bigint,text,text,jsonb) TO service_role;