
-- 1) touch_updated_at: set search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 2) Revoke EXECUTE from anon/PUBLIC on SECURITY DEFINER helpers (defense in depth)
REVOKE EXECUTE ON FUNCTION public.admin_financial_summary()        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_financial_summary()        TO service_role;

REVOKE EXECUTE ON FUNCTION public.messages_sent_today(uuid)        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.messages_sent_today(uuid)        TO service_role;

REVOKE EXECUTE ON FUNCTION public.chip_temperature(uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.group_engine_status(uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.messages_daily_series(uuid,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_number_quota(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.billing_owner(uuid)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_team_master(uuid,uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid,public.app_role)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                FROM PUBLIC, anon, authenticated;

-- 3) Rescope billing policies to `authenticated`
DROP POLICY IF EXISTS "own or admin read events" ON public.billing_events;
CREATE POLICY "own or admin read events" ON public.billing_events
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "own or admin" ON public.number_subscriptions;
CREATE POLICY "own or admin" ON public.number_subscriptions
  FOR ALL TO authenticated
  USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin manage pagarme_config" ON public.pagarme_config;
CREATE POLICY "admin manage pagarme_config" ON public.pagarme_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) profiles: explicit self-insert policy, and prevent owner_id self-escalation
CREATE POLICY profiles_self_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND (owner_id IS NULL OR owner_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.profiles_prevent_owner_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'owner_id can only be modified by an administrator';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.profiles_prevent_owner_id_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_owner_id_change_trg ON public.profiles;
CREATE TRIGGER profiles_prevent_owner_id_change_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_prevent_owner_id_change();

-- 5) campaign_instances: add direct user_id ownership column + trigger + tighter policy
ALTER TABLE public.campaign_instances ADD COLUMN IF NOT EXISTS user_id uuid;
UPDATE public.campaign_instances ci
   SET user_id = c.user_id
  FROM public.campaigns c
 WHERE ci.campaign_id = c.id
   AND ci.user_id IS NULL;
ALTER TABLE public.campaign_instances ALTER COLUMN user_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.campaign_instances_set_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT c.user_id INTO NEW.user_id
    FROM public.campaigns c
   WHERE c.id = NEW.campaign_id;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'campaign not found for campaign_instances.campaign_id=%', NEW.campaign_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.campaign_instances_set_user_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS campaign_instances_set_user_id_trg ON public.campaign_instances;
CREATE TRIGGER campaign_instances_set_user_id_trg
  BEFORE INSERT OR UPDATE ON public.campaign_instances
  FOR EACH ROW EXECUTE FUNCTION public.campaign_instances_set_user_id();

DROP POLICY IF EXISTS ci_owner ON public.campaign_instances;
CREATE POLICY ci_owner ON public.campaign_instances
  FOR ALL TO authenticated
  USING (
    (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role))
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
       WHERE c.id = campaign_instances.campaign_id
         AND (c.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role))
    )
  )
  WITH CHECK (
    (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role))
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
       WHERE c.id = campaign_instances.campaign_id
         AND (c.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role))
    )
  );
