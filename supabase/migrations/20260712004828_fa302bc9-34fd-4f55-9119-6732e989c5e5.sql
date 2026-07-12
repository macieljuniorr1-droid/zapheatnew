
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'seller');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- has_role helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Leads
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_line text NOT NULL,
  phone text,
  ddd text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz
);
CREATE INDEX leads_available_by_ddd ON public.leads (ddd) WHERE used_by IS NULL;
CREATE INDEX leads_used_by ON public.leads (used_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "leads_admin_all" ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Sellers can see leads they claimed
CREATE POLICY "leads_seller_read_own" ON public.leads FOR SELECT TO authenticated
  USING (used_by = auth.uid());

-- Trigger: on signup, create profile + assign role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'seller'::public.app_role END)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Atomic claim function: returns raw_lines that were just marked as used
CREATE OR REPLACE FUNCTION public.claim_leads(_ddd text, _qty int)
RETURNS TABLE (raw_line text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _qty IS NULL OR _qty <= 0 OR _qty > 100000 THEN
    RAISE EXCEPTION 'invalid quantity';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.leads
    WHERE ddd = _ddd AND used_by IS NULL
    ORDER BY uploaded_at
    LIMIT _qty
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.leads l
    SET used_by = _uid, used_at = now()
    FROM picked
    WHERE l.id = picked.id
    RETURNING l.raw_line, l.phone, l.used_at
  )
  SELECT u.raw_line, u.phone FROM updated u ORDER BY u.used_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_leads(text, int) TO authenticated;

-- Stats function for admin
CREATE OR REPLACE FUNCTION public.lead_stats_by_ddd()
RETURNS TABLE (ddd text, available bigint, used bigint, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ddd, '(sem DDD)') AS ddd,
    COUNT(*) FILTER (WHERE used_by IS NULL) AS available,
    COUNT(*) FILTER (WHERE used_by IS NOT NULL) AS used,
    COUNT(*) AS total
  FROM public.leads
  GROUP BY ddd
  ORDER BY ddd;
$$;

GRANT EXECUTE ON FUNCTION public.lead_stats_by_ddd() TO authenticated;

-- Seller-facing availability (public counts, no PII)
CREATE OR REPLACE FUNCTION public.available_by_ddd()
RETURNS TABLE (ddd text, available bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ddd, '(sem DDD)') AS ddd, COUNT(*) AS available
  FROM public.leads
  WHERE used_by IS NULL
  GROUP BY ddd
  ORDER BY ddd;
$$;

GRANT EXECUTE ON FUNCTION public.available_by_ddd() TO authenticated;
