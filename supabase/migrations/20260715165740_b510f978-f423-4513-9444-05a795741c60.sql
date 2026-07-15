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
  SELECT wg.next_run_at, wg.active
    INTO v_next, v_active
    FROM public.warmup_groups AS wg
   WHERE wg.id = _group_id;

  SELECT MAX(wl.created_at)
    INTO v_last
    FROM public.warmup_logs AS wl
   WHERE wl.group_id = _group_id
     AND wl.status = 'sent';

  SELECT COUNT(*)
    INTO v_today
    FROM public.warmup_logs AS wl
   WHERE wl.group_id = _group_id
     AND wl.status = 'sent'
     AND wl.created_at >= date_trunc('day', now());

  SELECT COUNT(*)
    INTO v_total
    FROM public.warmup_logs AS wl
   WHERE wl.group_id = _group_id
     AND wl.status = 'sent';

  SELECT
    COUNT(*) FILTER (WHERE wi.status = 'connected'),
    COUNT(*)
    INTO v_connected, v_all
    FROM public.warmup_group_members AS wgm
    JOIN public.whatsapp_instances AS wi ON wi.id = wgm.instance_id
   WHERE wgm.group_id = _group_id;

  RETURN QUERY SELECT
    v_last,
    v_next,
    COALESCE(v_today, 0),
    COALESCE(v_total, 0),
    COALESCE(v_active, false),
    COALESCE(v_connected, 0),
    COALESCE(v_all, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.group_engine_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_engine_status(uuid) TO authenticated, service_role;