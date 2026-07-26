CREATE TABLE public.wa_group_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.wa_groups(id) ON DELETE CASCADE,
  jid text NOT NULL,
  phone text,
  name text,
  is_admin boolean NOT NULL DEFAULT false,
  is_mine boolean NOT NULL DEFAULT false,
  present boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (group_id, jid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_group_participants TO authenticated;
GRANT ALL ON public.wa_group_participants TO service_role;

ALTER TABLE public.wa_group_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own wa_group_participants" ON public.wa_group_participants
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX wa_group_participants_group_idx ON public.wa_group_participants (group_id, present);

CREATE TABLE public.wa_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_stickers TO authenticated;
GRANT ALL ON public.wa_stickers TO service_role;

ALTER TABLE public.wa_stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own wa_stickers" ON public.wa_stickers
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.wa_groups
  ADD COLUMN sticker_chance integer NOT NULL DEFAULT 15,
  ADD COLUMN participants_synced_at timestamptz;

ALTER TABLE public.wa_group_logs
  ADD COLUMN kind text NOT NULL DEFAULT 'text';