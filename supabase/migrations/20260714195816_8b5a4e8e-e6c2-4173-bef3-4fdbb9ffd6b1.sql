
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE EXECUTE ON FUNCTION public.messages_sent_today(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.messages_sent_today(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
