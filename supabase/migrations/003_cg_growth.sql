-- 003: Growth for Cờ Gánh — web-push subscriptions, the notification
-- inbox, and community (UGC) puzzles. Mirrors CCT 003 with `cg_`
-- prefixes; puzzle `turn` is a Cờ Gánh color ('blue' | 'red') and
-- `pos` is the 25-char board string; `solution` holds engine move
-- labels (moveLabel format). Library progress reuses the SHARED
-- `library_progress` table with `cg-`-prefixed lesson ids. Daily
-- puzzles are a static engine-verified bank in lib/coganh/puzzles.ts.
-- Idempotent throughout. Run in the Dashboard SQL editor.

-- ================= 1. Push subscriptions =================
create table if not exists cg_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table cg_push_subscriptions enable row level security;
drop policy if exists "cg_push_subscriptions owner all" on cg_push_subscriptions;
create policy "cg_push_subscriptions owner all" on cg_push_subscriptions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ================= 2. Notification inbox =================
create table if not exists cg_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null, -- 'challenge' | 'challenge_declined' | 'room_turn' | 'corr_turn' | 'corr_end'
  title text not null,
  body text not null default '',
  url text not null default '/',
  ref_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cg_notifications_user_idx
  on cg_notifications (user_id, created_at desc);
alter table cg_notifications enable row level security;
drop policy if exists "cg_notifications select own" on cg_notifications;
create policy "cg_notifications select own" on cg_notifications
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "cg_notifications update own" on cg_notifications;
create policy "cg_notifications update own" on cg_notifications
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Unread count for the avatar badge. AFTER the table: language sql
-- functions resolve relations at creation time.
create or replace function public.cg_unread_notifications()
returns int
language sql security definer stable set search_path = public as $$
  select count(*)::int from cg_notifications
  where user_id = auth.uid() and read_at is null;
$$;
revoke all on function public.cg_unread_notifications() from public;
revoke all on function public.cg_unread_notifications() from anon;
grant execute on function public.cg_unread_notifications() to authenticated;

-- ================= 3. Community puzzles (UGC) =================
create table if not exists cg_puzzles (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  pos text not null, -- 25-char board string
  turn text not null check (turn in ('blue', 'red')),
  solution jsonb not null default '[]'::jsonb, -- canonical "c,r-c,r" move labels, solver moves (+ scripted replies for mate-in-2)
  solves int not null default 0,
  created_at timestamptz not null default now()
);
alter table cg_puzzles enable row level security;
drop policy if exists "cg_puzzles public read" on cg_puzzles;
create policy "cg_puzzles public read" on cg_puzzles
  for select to anon, authenticated using (true);
drop policy if exists "cg_puzzles creator insert" on cg_puzzles;
create policy "cg_puzzles creator insert" on cg_puzzles
  for insert to authenticated with check (auth.uid() = creator_id);
drop policy if exists "cg_puzzles creator update" on cg_puzzles;
create policy "cg_puzzles creator update" on cg_puzzles
  for update to authenticated using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);
drop policy if exists "cg_puzzles creator delete" on cg_puzzles;
create policy "cg_puzzles creator delete" on cg_puzzles
  for delete to authenticated using (auth.uid() = creator_id);

create table if not exists cg_puzzle_likes (
  puzzle_id uuid not null references cg_puzzles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (puzzle_id, user_id)
);
alter table cg_puzzle_likes enable row level security;
drop policy if exists "cg_puzzle_likes public read" on cg_puzzle_likes;
create policy "cg_puzzle_likes public read" on cg_puzzle_likes
  for select to anon, authenticated using (true);
drop policy if exists "cg_puzzle_likes self write" on cg_puzzle_likes;
create policy "cg_puzzle_likes self write" on cg_puzzle_likes
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "cg_puzzle_likes self delete" on cg_puzzle_likes;
create policy "cg_puzzle_likes self delete" on cg_puzzle_likes
  for delete to authenticated using (auth.uid() = user_id);

-- Puzzle cards with server-resolved creator names (profiles is never
-- exposed to anon directly; names follow full_name → username →
-- email-prefix → 'Player'). plpgsql — but likes subqueries reference
-- tables created above, which is fine.
create or replace function public.cg_puzzle_cards(
  p_sort text, p_limit int, p_offset int, p_mine boolean
)
returns table (
  id uuid, creator_id uuid, creator_name text, title text,
  pos text, turn text, solution jsonb, solves int,
  likes bigint, created_at timestamptz, liked_by_me boolean
)
language plpgsql security definer stable set search_path = public as $$
begin
  return query
  select pz.id, pz.creator_id,
    coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
             split_part(u.email, '@', 1), 'Player') as creator_name,
    pz.title, pz.pos, pz.turn, pz.solution, pz.solves,
    (select count(*) from cg_puzzle_likes l where l.puzzle_id = pz.id) as likes,
    pz.created_at,
    exists (select 1 from cg_puzzle_likes l
            where l.puzzle_id = pz.id and l.user_id = auth.uid()) as liked_by_me
  from cg_puzzles pz
  join profiles p on p.id = pz.creator_id
  left join auth.users u on u.id = p.id
  where (not p_mine) or pz.creator_id = auth.uid()
  order by
    case when p_sort = 'popular' then (select count(*) from cg_puzzle_likes l where l.puzzle_id = pz.id) end desc,
    pz.created_at desc
  limit least(coalesce(p_limit, 10), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.cg_puzzle_cards(text, int, int, boolean) from public;
revoke all on function public.cg_puzzle_cards(text, int, int, boolean) from anon;
grant execute on function public.cg_puzzle_cards(text, int, int, boolean) to anon, authenticated;

-- Toggle like (idempotent).
create or replace function public.cg_toggle_puzzle_like(p_puzzle_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from cg_puzzle_likes
             where puzzle_id = p_puzzle_id and user_id = v_uid) then
    delete from cg_puzzle_likes
      where puzzle_id = p_puzzle_id and user_id = v_uid;
    return false;
  end if;
  insert into cg_puzzle_likes (puzzle_id, user_id)
  values (p_puzzle_id, v_uid);
  return true;
end $$;
revoke all on function public.cg_toggle_puzzle_like(uuid) from public;
revoke all on function public.cg_toggle_puzzle_like(uuid) from anon;
grant execute on function public.cg_toggle_puzzle_like(uuid) to authenticated;

-- Record a solve (increments the counter).
create or replace function public.cg_record_puzzle_solve(p_puzzle_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update cg_puzzles set solves = solves + 1 where id = p_puzzle_id;
end $$;
revoke all on function public.cg_record_puzzle_solve(uuid) from public;
revoke all on function public.cg_record_puzzle_solve(uuid) from anon;
grant execute on function public.cg_record_puzzle_solve(uuid) to authenticated;
