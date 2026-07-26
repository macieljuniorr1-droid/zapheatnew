CREATE TABLE public.wa_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  owner_instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  group_jid text NOT NULL,
  subject text NOT NULL,
  description text,
  participant_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT false,
  ai_model text,
  theme text,
  min_interval_seconds integer NOT NULL DEFAULT 300,
  max_interval_seconds integer NOT NULL DEFAULT 1800,
  active_hour_start integer NOT NULL DEFAULT 0,
  active_hour_end integer NOT NULL DEFAULT 24,
  daily_limit integer NOT NULL DEFAULT 200,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_jid)
);

CREATE TABLE public.wa_group_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.wa_groups(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, instance_id)
);

CREATE TABLE public.wa_group_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.wa_groups(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  content text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wa_groups_user_idx ON public.wa_groups(user_id);
CREATE INDEX wa_groups_next_run_idx ON public.wa_groups(active, next_run_at);
CREATE INDEX wa_group_logs_group_idx ON public.wa_group_logs(group_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_groups TO authenticated;
GRANT ALL ON public.wa_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_group_senders TO authenticated;
GRANT ALL ON public.wa_group_senders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_group_logs TO authenticated;
GRANT ALL ON public.wa_group_logs TO service_role;

ALTER TABLE public.wa_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_group_senders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_group_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own wa_groups" ON public.wa_groups FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own wa_group_senders" ON public.wa_group_senders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.wa_groups g WHERE g.id = group_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.wa_groups g WHERE g.id = group_id AND g.user_id = auth.uid()));

CREATE POLICY "own wa_group_logs" ON public.wa_group_logs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER wa_groups_touch BEFORE UPDATE ON public.wa_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();