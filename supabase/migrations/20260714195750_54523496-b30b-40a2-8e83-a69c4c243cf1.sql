
-- Drop old leads system
DROP FUNCTION IF EXISTS public.claim_leads(text, integer);
DROP FUNCTION IF EXISTS public.lead_stats_by_ddd();
DROP FUNCTION IF EXISTS public.available_by_ddd();
DROP TABLE IF EXISTS public.leads CASCADE;

-- Plans
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  max_instances int NOT NULL DEFAULT 1,
  max_messages_per_day int NOT NULL DEFAULT 20,
  price_cents int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated, anon;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_read ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY plans_admin_all ON public.plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subs_self_read ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY subs_admin_all ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- WhatsApp instances
CREATE TABLE public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  evolution_instance text NOT NULL UNIQUE,
  phone text,
  status text NOT NULL DEFAULT 'disconnected',
  last_qr text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY wi_owner_all ON public.whatsapp_instances FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Warmup groups
CREATE TABLE public.warmup_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_delay_seconds int NOT NULL DEFAULT 60,
  max_delay_seconds int NOT NULL DEFAULT 300,
  daily_limit int NOT NULL DEFAULT 40,
  active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warmup_groups TO authenticated;
GRANT ALL ON public.warmup_groups TO service_role;
ALTER TABLE public.warmup_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY wg_owner_all ON public.warmup_groups FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Group members
CREATE TABLE public.warmup_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.warmup_groups(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  UNIQUE(group_id, instance_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warmup_group_members TO authenticated;
GRANT ALL ON public.warmup_group_members TO service_role;
ALTER TABLE public.warmup_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY wgm_owner_all ON public.warmup_group_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warmup_groups g WHERE g.id = group_id AND (g.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.warmup_groups g WHERE g.id = group_id AND (g.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Message templates
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_global boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY mt_read ON public.message_templates FOR SELECT TO authenticated
  USING (is_global OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY mt_owner_write ON public.message_templates FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() AND NOT is_global) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY mt_owner_update ON public.message_templates FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY mt_owner_delete ON public.message_templates FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Warmup logs
CREATE TABLE public.warmup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.warmup_groups(id) ON DELETE SET NULL,
  from_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  to_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  content text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.warmup_logs TO authenticated;
GRANT ALL ON public.warmup_logs TO service_role;
ALTER TABLE public.warmup_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY wl_owner_read ON public.warmup_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_warmup_logs_user_created ON public.warmup_logs(user_id, created_at DESC);
CREATE INDEX idx_warmup_logs_created ON public.warmup_logs(created_at DESC);

-- Evolution config (single row, admin only)
CREATE TABLE public.evolution_config (
  id int PRIMARY KEY DEFAULT 1,
  api_url text,
  api_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.evolution_config TO authenticated;
GRANT ALL ON public.evolution_config TO service_role;
ALTER TABLE public.evolution_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY ec_admin_all ON public.evolution_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Default plans
INSERT INTO public.plans (name, max_instances, max_messages_per_day, price_cents) VALUES
  ('Free', 1, 20, 0),
  ('Starter', 3, 40, 4900),
  ('Pro', 10, 150, 14900),
  ('Business', 30, 400, 39900)
ON CONFLICT DO NOTHING;

-- Default global message templates
INSERT INTO public.message_templates (content, is_global) VALUES
  ('Bom dia! Tudo bem?', true),
  ('Oi, como vai?', true),
  ('kkkk', true),
  ('E aí, tudo certo?', true),
  ('Boa tarde!', true),
  ('👍', true),
  ('👋', true),
  ('Tranquilo?', true),
  ('Show!', true),
  ('Vamos marcar algo', true),
  ('Beleza, obrigado!', true),
  ('Boa noite', true),
  ('Ok, entendi', true),
  ('Legal!', true),
  ('Depois te chamo', true),
  ('Estou por aqui', true),
  ('😂', true),
  ('❤️', true),
  ('Massa!', true),
  ('Valeu!', true);

-- Auto-create Free subscription on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first boolean;
  free_plan_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT (id) DO NOTHING;
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'seller'::public.app_role END)
  ON CONFLICT DO NOTHING;

  SELECT id INTO free_plan_id FROM public.plans WHERE name = 'Free' LIMIT 1;
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id) VALUES (NEW.id, free_plan_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: usage count today
CREATE OR REPLACE FUNCTION public.messages_sent_today(_user_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*) FROM public.warmup_logs
  WHERE user_id = _user_id AND status = 'sent' AND created_at >= date_trunc('day', now());
$$;
