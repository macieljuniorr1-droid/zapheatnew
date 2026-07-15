
-- Chip temperature: hot / warm / cold based on last 7d message volume + consecutive active days
CREATE OR REPLACE FUNCTION public.chip_temperature(_instance_id uuid)
RETURNS TABLE(
  temperature text,
  msgs_7d bigint,
  msgs_total bigint,
  active_days_7d int,
  last_activity timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msgs_7d bigint;
  v_msgs_total bigint;
  v_active_days int;
  v_last timestamptz;
  v_temp text;
BEGIN
  SELECT COUNT(*) INTO v_msgs_7d FROM public.warmup_logs
    WHERE (from_instance_id = _instance_id OR to_instance_id = _instance_id)
      AND status = 'sent'
      AND created_at >= now() - interval '7 days';

  SELECT COUNT(*) INTO v_msgs_total FROM public.warmup_logs
    WHERE (from_instance_id = _instance_id OR to_instance_id = _instance_id)
      AND status = 'sent';

  SELECT COUNT(DISTINCT date_trunc('day', created_at)) INTO v_active_days
    FROM public.warmup_logs
    WHERE (from_instance_id = _instance_id OR to_instance_id = _instance_id)
      AND status = 'sent'
      AND created_at >= now() - interval '7 days';

  SELECT MAX(created_at) INTO v_last FROM public.warmup_logs
    WHERE (from_instance_id = _instance_id OR to_instance_id = _instance_id)
      AND status = 'sent';

  IF v_msgs_7d >= 200 AND v_active_days >= 5 THEN
    v_temp := 'hot';
  ELSIF v_msgs_7d >= 50 AND v_active_days >= 2 THEN
    v_temp := 'warm';
  ELSE
    v_temp := 'cold';
  END IF;

  RETURN QUERY SELECT v_temp, COALESCE(v_msgs_7d, 0), COALESCE(v_msgs_total, 0), COALESCE(v_active_days, 0), v_last;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chip_temperature(uuid) TO authenticated, service_role;

-- Daily series of messages for the given user (or all users if _user_id is NULL) for last _days days.
CREATE OR REPLACE FUNCTION public.messages_daily_series(_user_id uuid, _days int DEFAULT 30)
RETURNS TABLE(day date, sent bigint, failed bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', now() - (_days - 1) * interval '1 day')::date,
      date_trunc('day', now())::date,
      interval '1 day'
    )::date AS day
  )
  SELECT
    d.day,
    COALESCE(SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
    COALESCE(SUM(CASE WHEN l.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
  FROM days d
  LEFT JOIN public.warmup_logs l
    ON date_trunc('day', l.created_at)::date = d.day
    AND (_user_id IS NULL OR l.user_id = _user_id)
  GROUP BY d.day
  ORDER BY d.day ASC;
$$;

GRANT EXECUTE ON FUNCTION public.messages_daily_series(uuid, int) TO authenticated, service_role;

-- Engine status per group: last activity + next_run_at + total messages
CREATE OR REPLACE FUNCTION public.group_engine_status(_group_id uuid)
RETURNS TABLE(
  last_activity timestamptz,
  next_run_at timestamptz,
  msgs_today bigint,
  msgs_total bigint,
  active boolean,
  connected_members int,
  total_members int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
  v_next timestamptz;
  v_today bigint;
  v_total bigint;
  v_active boolean;
  v_connected int;
  v_all int;
BEGIN
  SELECT next_run_at, active INTO v_next, v_active FROM public.warmup_groups WHERE id = _group_id;

  SELECT MAX(created_at) INTO v_last FROM public.warmup_logs
    WHERE group_id = _group_id AND status = 'sent';

  SELECT COUNT(*) INTO v_today FROM public.warmup_logs
    WHERE group_id = _group_id AND status = 'sent'
      AND created_at >= date_trunc('day', now());

  SELECT COUNT(*) INTO v_total FROM public.warmup_logs
    WHERE group_id = _group_id AND status = 'sent';

  SELECT
    COUNT(*) FILTER (WHERE i.status = 'connected'),
    COUNT(*)
  INTO v_connected, v_all
  FROM public.warmup_group_members m
  JOIN public.whatsapp_instances i ON i.id = m.instance_id
  WHERE m.group_id = _group_id;

  RETURN QUERY SELECT v_last, v_next, COALESCE(v_today,0), COALESCE(v_total,0), COALESCE(v_active,false), COALESCE(v_connected,0), COALESCE(v_all,0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.group_engine_status(uuid) TO authenticated, service_role;

-- Ensure realtime is enabled on warmup_logs (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.warmup_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
