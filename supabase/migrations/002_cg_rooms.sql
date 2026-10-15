-- 002: Rooms + tournaments + challenges + correspondence for Cờ Gánh.
--
-- Mirrors the audited CCT implementation (002/005/007) with `cg_`
-- prefixes and BLUE/RED sides — BLUE moves first in Cờ Gánh, so the
-- first player in turn order takes blue_id in every match.
--
-- Baked-in hard lessons from the sibling games:
--  * RLS helpers is_cg_room_member/is_cg_room_leader are GRANTED to
--    authenticated+anon (CCT 007: revoking them broke ALL room reads).
--  * Room creation goes through cg_create_room() (CCT 005/Chess 015:
--    a client INSERT + read-back is invisible to its own creator).
--
-- Tables: cg_rooms, cg_room_members, cg_room_matches, cg_room_comments,
-- cg_match_reactions, cg_tournaments, cg_room_xp_ledger, cg_challenges,
-- cg_corr_games. Move storage: `moves` jsonb of move labels exactly as
-- engine.moveLabel produces them ("C3→C4 · gánh ×2"); board state is
-- derived client-side by replaying labels from `start_pos`.
-- Friends REUSE the shared `friendships` table. XP flows through
-- cg_room_xp_ledger into cg_stats.xp (match XP only when plies >= 10:
-- win +15 / draw +8 / loss +5; host +5 cap 10/day; daily +10;
-- comment +2 cap 10/day via trigger).
-- Idempotent throughout. Run in the Dashboard SQL editor.

-- ================= 1. Tables =================
create table if not exists cg_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  leader_id uuid references profiles(id),
  max_players int not null default 8 check (max_players between 2 and 20),
  is_public boolean not null default false,
  status text not null default 'open' check (status in ('open','playing','closed')),
  turn_order uuid[] not null default '{}',
  rules text,
  created_at timestamptz not null default now()
);
alter table cg_rooms enable row level security;

create table if not exists cg_room_members (
  room_id uuid not null references cg_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('player','spectator')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table cg_room_members enable row level security;

create table if not exists cg_room_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cg_rooms(id) on delete cascade,
  blue_id uuid references profiles(id),
  red_id uuid references profiles(id),
  status text not null default 'active' check (status in ('active','finished','cancelled')),
  moves jsonb not null default '[]'::jsonb,
  start_pos text not null default '',
  result text check (result in ('blue','red','draw')),
  reason text,
  winner_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table cg_room_matches enable row level security;

create table if not exists cg_room_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cg_rooms(id) on delete cascade,
  match_id uuid references cg_room_matches(id) on delete cascade,
  move_number int not null default 0,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
alter table cg_room_comments enable row level security;

create table if not exists cg_match_reactions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cg_rooms(id) on delete cascade,
  match_id uuid not null references cg_room_matches(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now()
);
alter table cg_match_reactions enable row level security;

create table if not exists cg_tournaments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cg_rooms(id) on delete cascade,
  name text not null,
  status text not null default 'open' check (status in ('open','finished')),
  pairings jsonb not null default '[]',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table cg_tournaments enable row level security;

-- Added after cg_tournaments exists (matches reference tournaments).
alter table cg_room_matches
  add column if not exists tournament_id uuid
  references cg_tournaments(id) on delete set null;

create table if not exists cg_room_xp_ledger (
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('play','host','comment','daily')),
  ref_id uuid not null,
  day date not null default current_date,
  xp int not null,
  primary key (user_id, kind, ref_id, day)
);
alter table cg_room_xp_ledger enable row level security;

-- Challenges: per-game table. room_code is denormalized onto the row at
-- creation — the challenged player is not a room member yet and rooms RLS
-- hides the room from them, so resolving the code through a rooms join
-- would silently fail (the hard-won xiangqi lesson).
create table if not exists cg_challenges (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cg_rooms(id) on delete cascade,
  room_code text not null,
  challenger_id uuid not null references profiles(id) on delete cascade,
  challenged_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now()
);
alter table cg_challenges enable row level security;

-- Correspondence (async) games. cg_* state format (25-char pos) — the
-- xiangqi correspondence_games table is NOT reused (game-specific).
create table if not exists cg_corr_games (
  id uuid primary key default gen_random_uuid(),
  blue_id uuid not null references profiles(id) on delete cascade,
  red_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','finished')),
  moves jsonb not null default '[]'::jsonb,
  start_pos text not null default '',
  result text check (result in ('blue','red','draw')),
  reason text,
  winner_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table cg_corr_games enable row level security;

-- ================= RLS helpers (AFTER the tables: SQL-language
-- functions resolve their relations at creation time) =================
create or replace function public.is_cg_room_member(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from cg_room_members where room_id = rid and user_id = auth.uid());
$$;
revoke all on function public.is_cg_room_member(uuid) from public;
-- 007 LESSON (CCT): RLS policies evaluate helpers with the CALLER's
-- privileges — the helpers MUST stay executable by authenticated+anon
-- or every room read fails 42501.
grant execute on function public.is_cg_room_member(uuid) to authenticated, anon;

create or replace function public.is_cg_room_leader(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from cg_rooms where id = rid and leader_id = auth.uid());
$$;
revoke all on function public.is_cg_room_leader(uuid) from public;
grant execute on function public.is_cg_room_leader(uuid) to authenticated, anon;

-- ================= 2. RLS policies =================
-- Rooms: members (or anyone for public rooms) can read; leader updates;
-- creation is client-side with leader_id = auth.uid().
drop policy if exists "cg_rooms member read" on cg_rooms;
create policy "cg_rooms member read" on cg_rooms
  for select using (is_cg_room_member(id) or is_public);
drop policy if exists "cg_rooms leader insert" on cg_rooms;
create policy "cg_rooms leader insert" on cg_rooms
  for insert to authenticated with check (auth.uid() = leader_id);
drop policy if exists "cg_rooms leader update" on cg_rooms;
create policy "cg_rooms leader update" on cg_rooms
  for update using (is_cg_room_leader(id));

drop policy if exists "cg_members read" on cg_room_members;
create policy "cg_members read" on cg_room_members
  for select using (is_cg_room_member(room_id));
drop policy if exists "cg_members self join" on cg_room_members;
create policy "cg_members self join" on cg_room_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "cg_matches member read" on cg_room_matches;
create policy "cg_matches member read" on cg_room_matches
  for select using (is_cg_room_member(room_id));
drop policy if exists "cg_matches player update" on cg_room_matches;
create policy "cg_matches player update" on cg_room_matches
  for update using (
    status = 'active' and (auth.uid() = blue_id or auth.uid() = red_id));

drop policy if exists "cg_comments member read" on cg_room_comments;
create policy "cg_comments member read" on cg_room_comments
  for select using (is_cg_room_member(room_id));
drop policy if exists "cg_comments member write" on cg_room_comments;
create policy "cg_comments member write" on cg_room_comments
  for insert with check (is_cg_room_member(room_id) and auth.uid() = user_id);

drop policy if exists "cg_reactions member" on cg_match_reactions;
create policy "cg_reactions member" on cg_match_reactions
  for all using (is_cg_room_member(room_id));

drop policy if exists "cg_tournaments member read" on cg_tournaments;
create policy "cg_tournaments member read" on cg_tournaments
  for select using (is_cg_room_member(room_id));

drop policy if exists "cg_xp self read" on cg_room_xp_ledger;
create policy "cg_xp self read" on cg_room_xp_ledger
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "cg_challenges party" on cg_challenges;
create policy "cg_challenges party" on cg_challenges
  for select using (auth.uid() = challenger_id or auth.uid() = challenged_id);
drop policy if exists "cg_challenges challenger insert" on cg_challenges;
create policy "cg_challenges challenger insert" on cg_challenges
  for insert with check (auth.uid() = challenger_id);
drop policy if exists "cg_challenges party update" on cg_challenges;
create policy "cg_challenges party update" on cg_challenges
  for update using (auth.uid() = challenger_id or auth.uid() = challenged_id);

drop policy if exists "cg_corr player read" on cg_corr_games;
create policy "cg_corr player read" on cg_corr_games
  for select using (auth.uid() = blue_id or auth.uid() = red_id);
drop policy if exists "cg_corr player insert" on cg_corr_games;
create policy "cg_corr player insert" on cg_corr_games
  for insert with check (auth.uid() = blue_id or auth.uid() = red_id);
drop policy if exists "cg_corr player update" on cg_corr_games;
create policy "cg_corr player update" on cg_corr_games
  for update using (
    status = 'active' and (auth.uid() = blue_id or auth.uid() = red_id));

-- ================= 3. Realtime =================
do $$ begin
  alter publication supabase_realtime add table public.cg_rooms;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cg_room_members;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cg_room_matches;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cg_room_comments;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cg_match_reactions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cg_tournaments;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cg_challenges;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cg_corr_games;
exception when duplicate_object then null;
end $$;

-- ================= 4. Room XP award (internal) =================
-- Inserts into the ledger (idempotent); only when the insert lands does
-- XP move into cg_stats. Never granted to clients — only DEFINER
-- functions and the comment trigger call it.
create or replace function public.cg_award_room_xp(
  p_user_id uuid, p_kind text, p_ref_id uuid, p_xp int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_inserted boolean := false;
begin
  insert into cg_room_xp_ledger (user_id, kind, ref_id, day, xp)
  values (p_user_id, p_kind, p_ref_id, current_date, p_xp)
  on conflict do nothing
  returning true into v_inserted;
  if coalesce(v_inserted, false) then
    insert into cg_stats (user_id, xp)
    values (p_user_id, p_xp)
    on conflict (user_id) do update set xp = cg_stats.xp + excluded.xp,
                                      updated_at = now();
    return true;
  end if;
  return false;
end $$;
revoke all on function public.cg_award_room_xp(uuid, text, uuid, int) from public;
revoke all on function public.cg_award_room_xp(uuid, text, uuid, int) from anon;
revoke all on function public.cg_award_room_xp(uuid, text, uuid, int) from authenticated;

-- ================= 5. Membership RPCs =================
create or replace function public.cg_join_room(p_code text)
returns cg_rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room cg_rooms;
  v_count int;
begin
  select * into v_room from cg_rooms where code = upper(trim(p_code));
  if not found then raise exception 'room_not_found'; end if;
  if exists (select 1 from cg_room_members
             where room_id = v_room.id and user_id = auth.uid()) then
    return v_room; -- idempotent for existing members
  end if;
  if v_room.status = 'closed' then raise exception 'room_closed'; end if;
  select count(*) into v_count from cg_room_members where room_id = v_room.id;
  if v_count >= v_room.max_players then raise exception 'room_full'; end if;
  insert into cg_room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'player');
  if not (auth.uid() = any (v_room.turn_order)) then
    update cg_rooms
      set turn_order = turn_order || auth.uid()
      where id = v_room.id
      returning * into v_room;
  end if;
  return v_room;
end $$;
revoke all on function public.cg_join_room(text) from public;
revoke all on function public.cg_join_room(text) from anon;
grant execute on function public.cg_join_room(text) to authenticated;

create or replace function public.cg_leave_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if is_cg_room_leader(p_room_id) then
    raise exception 'leader_cannot_leave';
  end if;
  delete from cg_room_members
    where room_id = p_room_id and user_id = auth.uid();
  update cg_rooms
    set turn_order = array_remove(turn_order, auth.uid())
    where id = p_room_id;
end $$;
revoke all on function public.cg_leave_room(uuid) from public;
revoke all on function public.cg_leave_room(uuid) from anon;
grant execute on function public.cg_leave_room(uuid) to authenticated;

create or replace function public.cg_kick_member(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cg_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_kick_self'; end if;
  delete from cg_room_members
    where room_id = p_room_id and user_id = p_user_id;
  update cg_rooms
    set turn_order = array_remove(turn_order, p_user_id)
    where id = p_room_id;
end $$;
revoke all on function public.cg_kick_member(uuid, uuid) from public;
revoke all on function public.cg_kick_member(uuid, uuid) from anon;
grant execute on function public.cg_kick_member(uuid, uuid) to authenticated;

create or replace function public.cg_set_member_role(
  p_room_id uuid, p_user_id uuid, p_role text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_room cg_rooms;
begin
  if not is_cg_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  if p_role not in ('player','spectator') then raise exception 'invalid_role'; end if;
  select * into v_room from cg_rooms where id = p_room_id;
  if p_user_id = v_room.leader_id and p_role = 'spectator' then
    raise exception 'leader_must_play';
  end if;
  update cg_room_members set role = p_role
    where room_id = p_room_id and user_id = p_user_id;
  if p_role = 'spectator' then
    update cg_rooms
      set turn_order = array_remove(turn_order, p_user_id)
      where id = p_room_id;
  elsif not (p_user_id = any (v_room.turn_order)) then
    update cg_rooms
      set turn_order = turn_order || p_user_id
      where id = p_room_id;
  end if;
end $$;
revoke all on function public.cg_set_member_role(uuid, uuid, text) from public;
revoke all on function public.cg_set_member_role(uuid, uuid, text) from anon;
grant execute on function public.cg_set_member_role(uuid, uuid, text) to authenticated;

create or replace function public.cg_set_turn_order(p_room_id uuid, p_order uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare v_clean uuid[];
begin
  if not is_cg_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  select coalesce(array_agg(m.user_id order by array_position(p_order, m.user_id)), '{}')
    into v_clean
    from cg_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and m.user_id = any (p_order);
  select v_clean || coalesce(array_agg(m.user_id order by m.joined_at), '{}')
    into v_clean
    from cg_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and not (m.user_id = any (v_clean));
  update cg_rooms set turn_order = v_clean where id = p_room_id;
end $$;
revoke all on function public.cg_set_turn_order(uuid, uuid[]) from public;
revoke all on function public.cg_set_turn_order(uuid, uuid[]) from anon;
grant execute on function public.cg_set_turn_order(uuid, uuid[]) to authenticated;

create or replace function public.cg_close_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cg_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  update cg_rooms set status = 'closed' where id = p_room_id;
end $$;
revoke all on function public.cg_close_room(uuid) from public;
revoke all on function public.cg_close_room(uuid) from anon;
grant execute on function public.cg_close_room(uuid) to authenticated;

create or replace function public.cg_update_room_rules(p_room_id uuid, p_rules text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cg_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  update cg_rooms
    set rules = nullif(left(trim(coalesce(p_rules, '')), 500), '')
    where id = p_room_id;
end $$;
revoke all on function public.cg_update_room_rules(uuid, text) from public;
revoke all on function public.cg_update_room_rules(uuid, text) from anon;
grant execute on function public.cg_update_room_rules(uuid, text) to authenticated;

create or replace function public.cg_set_room_public(p_room_id uuid, p_public boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cg_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  update cg_rooms set is_public = p_public where id = p_room_id;
end $$;
revoke all on function public.cg_set_room_public(uuid, boolean) from public;
revoke all on function public.cg_set_room_public(uuid, boolean) from anon;
grant execute on function public.cg_set_room_public(uuid, boolean) to authenticated;

-- ================= 6. Match RPCs =================
-- Room matches always start from the standard position (the setup editor
-- is a vs-computer surface). START_POS is the engine's initialPos().
create or replace function public.cg_start_next_match(p_room_id uuid)
returns cg_room_matches
language plpgsql security definer set search_path = public as $$
declare
  v_room cg_rooms;
  v_order uuid[];
  v_match cg_room_matches;
  v_start_pos text := 'RRRRRR.R.R.....B.B.BBBBBB';
begin
  if not is_cg_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  select * into v_room from cg_rooms where id = p_room_id;
  if v_room.status = 'closed' then raise exception 'room_closed'; end if;
  if exists (select 1 from cg_room_matches
             where room_id = p_room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  select coalesce(array_agg(m.user_id order by array_position(v_room.turn_order, m.user_id)), '{}')
    into v_order
    from cg_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and m.user_id = any (v_room.turn_order);
  select v_order || coalesce(array_agg(m.user_id order by m.joined_at), '{}')
    into v_order
    from cg_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and not (m.user_id = any (v_order));
  if coalesce(array_length(v_order, 1), 0) < 2 then
    raise exception 'room_need_two_players';
  end if;
  insert into cg_room_matches (room_id, blue_id, red_id, start_pos)
  values (p_room_id, v_order[1], v_order[2], v_start_pos)
  returning * into v_match;
  -- Rotate: the first player goes to the end so everyone cycles.
  update cg_rooms
    set turn_order = v_order[2:] || v_order[1], status = 'playing'
    where id = p_room_id;
  return v_match;
end $$;
revoke all on function public.cg_start_next_match(uuid) from public;
revoke all on function public.cg_start_next_match(uuid) from anon;
grant execute on function public.cg_start_next_match(uuid) to authenticated;

-- Idempotent finish: awards room XP into cg_stats and writes tournament
-- results back. Returns the CALLER's own earned XP for the toast.
create or replace function public.cg_finish_room_match(
  p_match_id uuid, p_result text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match cg_room_matches;
  v_room cg_rooms;
  v_winner uuid;
  v_plies int;
  v_play int := 0;
  v_host int := 0;
  v_daily int := 0;
  v_nil uuid := '00000000-0000-0000-0000-000000000000';
  v_host_today int;
  v_pairings jsonb;
  v_new_pairings jsonb;
  v_elem jsonb;
  v_remaining int;
  v_ok boolean;
begin
  select * into v_match from cg_room_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if p_result not in ('blue','red','draw') then raise exception 'invalid_result'; end if;
  select * into v_room from cg_rooms where id = v_match.room_id;
  if auth.uid() <> v_match.blue_id and auth.uid() <> v_match.red_id
     and auth.uid() <> v_room.leader_id then
    raise exception 'not_allowed';
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('play_xp', 0, 'host_xp', 0, 'daily_xp', 0);
  end if;
  v_winner := case p_result
    when 'blue' then v_match.blue_id
    when 'red' then v_match.red_id
    else null end;
  update cg_room_matches
    set status = 'finished', result = p_result, reason = p_reason,
        winner_id = v_winner, finished_at = now()
    where id = p_match_id;
  update cg_rooms set status = 'open'
    where id = v_match.room_id and status = 'playing';

  v_plies := coalesce(jsonb_array_length(v_match.moves), 0);

  -- Match XP (anti-farm: only games with >= 10 plies pay out).
  -- Award calls run into v_ok FIRST: side-effecting functions must
  -- never sit inside an AND condition (Postgres may reorder it).
  if v_plies >= 10 then
    if p_result = 'draw' then
      v_ok := cg_award_room_xp(v_match.blue_id, 'play', p_match_id, 8);
      if v_ok and auth.uid() = v_match.blue_id then v_play := 8; end if;
      v_ok := cg_award_room_xp(v_match.red_id, 'play', p_match_id, 8);
      if v_ok and auth.uid() = v_match.red_id then v_play := 8; end if;
    else
      v_ok := cg_award_room_xp(v_winner, 'play', p_match_id, 15);
      if v_ok and auth.uid() = v_winner then v_play := 15; end if;
      v_ok := cg_award_room_xp(
        case when v_winner = v_match.blue_id
             then v_match.red_id else v_match.blue_id end,
        'play', p_match_id, 5);
      if v_ok and auth.uid() <> v_winner
         and (auth.uid() = v_match.blue_id or auth.uid() = v_match.red_id)
      then v_play := 5; end if;
    end if;
    -- Host bonus +5/match, capped at 10 XP/day.
    select coalesce(sum(xp), 0) into v_host_today from cg_room_xp_ledger
      where user_id = v_room.leader_id and kind = 'host' and day = current_date;
    if v_host_today < 10 then
      v_ok := cg_award_room_xp(v_room.leader_id, 'host', p_match_id, 5);
      if v_ok and auth.uid() = v_room.leader_id then v_host := 5; end if;
    end if;
    -- Daily participation +10 once/day for both players.
    v_ok := cg_award_room_xp(v_match.blue_id, 'daily', v_nil, 10);
    if v_ok and auth.uid() = v_match.blue_id then v_daily := 10; end if;
    v_ok := cg_award_room_xp(v_match.red_id, 'daily', v_nil, 10);
    if v_ok and auth.uid() = v_match.red_id then v_daily := 10; end if;
  end if;

  -- Tournament write-back: stamp this pairing's result; auto-finish
  -- the tournament when every pairing has a result.
  if v_match.tournament_id is not null then
    select pairings into v_pairings from cg_tournaments
      where id = v_match.tournament_id;
    if v_pairings is not null then
      v_new_pairings := '[]'::jsonb;
      for v_elem in select * from jsonb_array_elements(v_pairings) loop
        if v_elem ->> 'match_id' = p_match_id::text then
          v_elem := v_elem || jsonb_build_object('result', p_result);
        end if;
        v_new_pairings := v_new_pairings || v_elem;
      end loop;
      select count(*) into v_remaining from jsonb_array_elements(v_new_pairings) e
        where e ->> 'result' is null;
      update cg_tournaments
        set pairings = v_new_pairings,
            status = case when v_remaining = 0 then 'finished' else status end,
            finished_at = case when v_remaining = 0 then now() else finished_at end
        where id = v_match.tournament_id;
    end if;
  end if;

  return jsonb_build_object('play_xp', v_play, 'host_xp', v_host, 'daily_xp', v_daily);
end $$;
revoke all on function public.cg_finish_room_match(uuid, text, text) from public;
revoke all on function public.cg_finish_room_match(uuid, text, text) from anon;
grant execute on function public.cg_finish_room_match(uuid, text, text) to authenticated;

create or replace function public.cg_cancel_room_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match cg_room_matches;
begin
  select * into v_match from cg_room_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if not is_cg_room_leader(v_match.room_id) then
    raise exception 'not_leader';
  end if;
  update cg_room_matches
    set status = 'cancelled', reason = 'cancelled', finished_at = now()
    where id = p_match_id and status = 'active';
  update cg_rooms set status = 'open'
    where id = v_match.room_id and status = 'playing';
end $$;
revoke all on function public.cg_cancel_room_match(uuid) from public;
revoke all on function public.cg_cancel_room_match(uuid) from anon;
grant execute on function public.cg_cancel_room_match(uuid) to authenticated;

create or replace function public.cg_rematch(p_room_id uuid)
returns cg_room_matches
language plpgsql security definer set search_path = public as $$
declare
  v_prev cg_room_matches;
  v_match cg_room_matches;
begin
  select * into v_prev from cg_room_matches
    where room_id = p_room_id and status = 'finished'
    order by finished_at desc nulls last, created_at desc
    limit 1;
  if not found then raise exception 'match_not_found'; end if;
  if auth.uid() <> v_prev.blue_id and auth.uid() <> v_prev.red_id then
    raise exception 'not_allowed';
  end if;
  if exists (select 1 from cg_room_matches
             where room_id = p_room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  -- Same two players, swapped colors.
  insert into cg_room_matches (room_id, blue_id, red_id, start_pos)
  values (p_room_id, v_prev.red_id, v_prev.blue_id, v_prev.start_pos)
  returning * into v_match;
  update cg_rooms set status = 'playing' where id = p_room_id;
  return v_match;
end $$;
revoke all on function public.cg_rematch(uuid) from public;
revoke all on function public.cg_rematch(uuid) from anon;
grant execute on function public.cg_rematch(uuid) to authenticated;

-- ================= 7. Tournament RPCs =================
create or replace function public.cg_create_tournament(p_room_id uuid, p_name text)
returns cg_tournaments language plpgsql security definer set search_path = public as $$
declare
  v_players uuid[];
  v_pairings jsonb := '[]'::jsonb;
  v_t cg_tournaments;
  i int; j int; n int;
begin
  if not is_cg_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  if exists (select 1 from cg_tournaments where room_id = p_room_id and status = 'open') then
    raise exception 'tournament_in_progress';
  end if;
  if exists (select 1 from cg_room_matches
             where room_id = p_room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  select array_agg(m.user_id) into v_players
    from cg_room_members m where m.room_id = p_room_id and m.role = 'player';
  n := coalesce(array_length(v_players, 1), 0);
  if n < 3 then raise exception 'not_enough_players'; end if;
  for i in 1..n loop
    for j in i + 1..n loop
      v_pairings := v_pairings || jsonb_build_object(
        'blue', case when (i + j) % 2 = 0 then v_players[i] else v_players[j] end,
        'red', case when (i + j) % 2 = 0 then v_players[j] else v_players[i] end,
        'result', null);
    end loop;
  end loop;
  insert into cg_tournaments (room_id, name, pairings)
    values (p_room_id, left(nullif(trim(p_name), ''), 60), v_pairings)
    returning * into v_t;
  return v_t;
end $$;
revoke all on function public.cg_create_tournament(uuid, text) from public;
revoke all on function public.cg_create_tournament(uuid, text) from anon;
grant execute on function public.cg_create_tournament(uuid, text) to authenticated;

create or replace function public.cg_tournament_next_match(p_tournament_id uuid)
returns cg_room_matches
language plpgsql security definer set search_path = public as $$
declare
  v_t cg_tournaments;
  v_pairings jsonb;
  v_new_pairings jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_red uuid;
  v_green uuid;
  v_match cg_room_matches;
  v_stamped boolean := false;
begin
  select * into v_t from cg_tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
  if not is_cg_room_leader(v_t.room_id) then raise exception 'not_leader'; end if;
  if v_t.status <> 'open' then raise exception 'tournament_finished'; end if;
  if exists (select 1 from cg_room_matches
             where room_id = v_t.room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  for v_elem in select * from jsonb_array_elements(v_t.pairings) loop
    if not v_stamped and v_elem ->> 'result' is null then
      v_red := (v_elem ->> 'blue')::uuid;
      v_green := (v_elem ->> 'red')::uuid;
      insert into cg_room_matches (room_id, blue_id, red_id, tournament_id, start_pos)
      values (v_t.room_id, v_red, v_green, p_tournament_id,
              'RRRRRR.R.R.....B.B.BBBBBB')
      returning * into v_match;
      v_elem := v_elem || jsonb_build_object('match_id', v_match.id);
      v_stamped := true;
    end if;
    v_new_pairings := v_new_pairings || v_elem;
  end loop;
  if not v_stamped then raise exception 'tournament_finished'; end if;
  update cg_tournaments set pairings = v_new_pairings where id = p_tournament_id;
  update cg_rooms set status = 'playing' where id = v_t.room_id;
  return v_match;
end $$;
revoke all on function public.cg_tournament_next_match(uuid) from public;
revoke all on function public.cg_tournament_next_match(uuid) from anon;
grant execute on function public.cg_tournament_next_match(uuid) to authenticated;

create or replace function public.cg_cancel_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_t cg_tournaments;
begin
  select * into v_t from cg_tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
  if not is_cg_room_leader(v_t.room_id) then raise exception 'not_leader'; end if;
  update cg_tournaments
    set status = 'finished', finished_at = now()
    where id = p_tournament_id and status = 'open';
end $$;
revoke all on function public.cg_cancel_tournament(uuid) from public;
revoke all on function public.cg_cancel_tournament(uuid) from anon;
grant execute on function public.cg_cancel_tournament(uuid) to authenticated;

-- ================= 8. Comment XP trigger =================
-- +2 per comment with body >= 4 chars, capped at 10 XP/day; also attempts
-- the daily +10 participation award.
create or replace function public.cg_award_comment_xp()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_today int;
begin
  if length(trim(new.body)) >= 4 then
    select coalesce(sum(xp), 0) into v_today from cg_room_xp_ledger
      where user_id = new.user_id and kind = 'comment' and day = current_date;
    if v_today < 10 then
      perform cg_award_room_xp(new.user_id, 'comment', new.id, 2);
    end if;
  end if;
  perform cg_award_room_xp(
    new.user_id, 'daily', '00000000-0000-0000-0000-000000000000', 10);
  return new;
end $$;
revoke all on function public.cg_award_comment_xp() from public;
revoke all on function public.cg_award_comment_xp() from anon;
revoke all on function public.cg_award_comment_xp() from authenticated;
drop trigger if exists cg_comments_xp on cg_room_comments;
create trigger cg_comments_xp
  after insert on cg_room_comments
  for each row execute function public.cg_award_comment_xp();

-- ================= 9. Correspondence =================
-- Touch updated_at on every move.
create or replace function public.cg_corr_touch_updated_at()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;
revoke all on function public.cg_corr_touch_updated_at() from public;
revoke all on function public.cg_corr_touch_updated_at() from anon;
revoke all on function public.cg_corr_touch_updated_at() from authenticated;
drop trigger if exists cg_corr_touch on cg_corr_games;
create trigger cg_corr_touch
  before update on cg_corr_games
  for each row execute function public.cg_corr_touch_updated_at();

-- Idempotent finish for a correspondence game: the mover's client detects
-- the terminal position (or the player resigns) and finalizes. Awards the
-- same >=10-plies play XP as room matches, through the ledger.
create or replace function public.cg_finish_corr_game(
  p_game_id uuid, p_result text, p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_game cg_corr_games;
  v_winner uuid;
  v_plies int;
  v_ok boolean;
begin
  select * into v_game from cg_corr_games where id = p_game_id;
  if not found then raise exception 'game_not_found'; end if;
  if p_result not in ('blue','red','draw') then raise exception 'invalid_result'; end if;
  if auth.uid() <> v_game.blue_id and auth.uid() <> v_game.red_id then
    raise exception 'not_allowed';
  end if;
  if v_game.status <> 'active' then return; end if;
  v_winner := case p_result
    when 'blue' then v_game.blue_id
    when 'red' then v_game.red_id
    else null end;
  update cg_corr_games
    set status = 'finished', result = p_result, reason = p_reason,
        winner_id = v_winner
    where id = p_game_id;
  v_plies := coalesce(jsonb_array_length(v_game.moves), 0);
  if v_plies >= 10 then
    if p_result = 'draw' then
      v_ok := cg_award_room_xp(v_game.blue_id, 'play', p_game_id, 8);
      v_ok := cg_award_room_xp(v_game.red_id, 'play', p_game_id, 8);
    else
      v_ok := cg_award_room_xp(v_winner, 'play', p_game_id, 15);
      v_ok := cg_award_room_xp(
        case when v_winner = v_game.blue_id
             then v_game.red_id else v_game.blue_id end,
        'play', p_game_id, 5);
    end if;
  end if;
end $$;
revoke all on function public.cg_finish_corr_game(uuid, text, text) from public;
revoke all on function public.cg_finish_corr_game(uuid, text, text) from anon;
grant execute on function public.cg_finish_corr_game(uuid, text, text) to authenticated;

-- ================= 10. Discovery & guest RPCs (anon-safe) =================
create or replace function public.cg_preview_room(p_code text)
returns table (name text, member_count bigint, is_public boolean, status text, rules text)
language sql security definer stable set search_path = public as $$
  select r.name,
         (select count(*) from cg_room_members m where m.room_id = r.id),
         r.is_public, r.status, r.rules
  from cg_rooms r
  where r.code = upper(trim(p_code));
$$;
revoke all on function public.cg_preview_room(text) from public;
grant execute on function public.cg_preview_room(text) to anon, authenticated;

create or replace function public.cg_list_public_rooms()
returns table (id uuid, code text, name text, member_count bigint,
               max_players int, has_active_match boolean)
language sql security definer stable set search_path = public as $$
  select r.id, r.code, r.name,
         (select count(*) from cg_room_members m where m.room_id = r.id),
         r.max_players,
         exists (select 1 from cg_room_matches mt
                 where mt.room_id = r.id and mt.status = 'active')
  from cg_rooms r
  where r.is_public and r.status <> 'closed'
  order by 6 desc, 4 desc
  limit 30;
$$;
revoke all on function public.cg_list_public_rooms() from public;
grant execute on function public.cg_list_public_rooms() to anon, authenticated;

create or replace function public.cg_room_leaderboard()
returns table (room_id uuid, name text, code text,
               matches_7d bigint, member_count bigint)
language sql security definer stable set search_path = public as $$
  select r.id, r.name, r.code,
         (select count(*) from cg_room_matches m
          where m.room_id = r.id and m.status = 'finished'
            and m.created_at > now() - interval '7 days'),
         (select count(*) from cg_room_members mb where mb.room_id = r.id)
  from cg_rooms r
  where r.is_public and r.status <> 'closed'
  order by 4 desc, 5 desc
  limit 20;
$$;
revoke all on function public.cg_room_leaderboard() from public;
grant execute on function public.cg_room_leaderboard() to anon, authenticated;

-- Guest room detail: profile names are resolved server-side so the
-- profiles table is never exposed to anon. Public rooms only.
create or replace function public.cg_guest_room_detail(p_room_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_room cg_rooms;
  v_match cg_room_matches;
  v_result jsonb;
begin
  select * into v_room from cg_rooms where id = p_room_id;
  if not found or not v_room.is_public or v_room.status = 'closed' then
    return null;
  end if;
  select * into v_match from cg_room_matches
    where room_id = p_room_id and status = 'active'
    order by created_at desc limit 1;
  select jsonb_build_object(
    'id', v_room.id,
    'code', v_room.code,
    'name', v_room.name,
    'max_players', v_room.max_players,
    'status', v_room.status,
    'rules', v_room.rules,
    'member_count', (select count(*) from cg_room_members where room_id = p_room_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                         split_part(u.email, '@', 1), 'Player'),
        'role', m.role) order by m.joined_at)
      from cg_room_members m
      join profiles p on p.id = m.user_id
      left join auth.users u on u.id = p.id
      where m.room_id = p_room_id), '[]'::jsonb),
    'active_match', case when v_match.id is null then null else jsonb_build_object(
      'id', v_match.id,
      'blue_id', v_match.blue_id,
      'red_id', v_match.red_id,
      'blue_name', (select coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                             split_part(u.email, '@', 1), 'Player')
                     from profiles p left join auth.users u on u.id = p.id
                     where p.id = v_match.blue_id),
      'red_name', (select coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                             split_part(u.email, '@', 1), 'Player')
                     from profiles p left join auth.users u on u.id = p.id
                     where p.id = v_match.red_id),
      'moves', v_match.moves,
      'start_pos', v_match.start_pos,
      'status', v_match.status) end,
    'comments', coalesce((
      select jsonb_agg(c order by created_at desc) from (
        select jsonb_build_object(
          'user_name', coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                                split_part(u.email, '@', 1), 'Player'),
          'body', cm.body,
          'created_at', cm.created_at) as c,
          cm.created_at
        from cg_room_comments cm
        join profiles p on p.id = cm.user_id
        left join auth.users u on u.id = p.id
        where cm.room_id = p_room_id
        order by cm.created_at desc limit 20) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.cg_guest_room_detail(uuid) from public;
grant execute on function public.cg_guest_room_detail(uuid) to anon, authenticated;

-- ================= 11. Anon read policies for public rooms =================
-- Lets guests load the board/comments of a public room and receive
-- realtime updates. Write access stays member-only.
drop policy if exists "cg_matches public read" on cg_room_matches;
create policy "cg_matches public read" on cg_room_matches
  for select to anon, authenticated using (
    exists (select 1 from cg_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));
drop policy if exists "cg_comments public read" on cg_room_comments;
create policy "cg_comments public read" on cg_room_comments
  for select to anon, authenticated using (
    exists (select 1 from cg_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));
drop policy if exists "cg_reactions public read" on cg_match_reactions;
create policy "cg_reactions public read" on cg_match_reactions
  for select to anon, authenticated using (
    exists (select 1 from cg_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));

-- ================= 12. Create-room RPC (CCT 005 pattern) =================

-- ================= 12. Create-room RPC =================
create or replace function public.cg_gen_room_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.cg_rooms r where r.code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke all on function public.cg_gen_room_code() from public;
revoke all on function public.cg_gen_room_code() from anon;
revoke all on function public.cg_gen_room_code() from authenticated;

create or replace function public.cg_create_room(
  p_name text,
  p_is_public boolean,
  p_max_players int default 8
)
returns public.cg_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.cg_rooms;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  insert into public.cg_rooms (code, name, leader_id, is_public, max_players, turn_order)
  values (
    public.cg_gen_room_code(),
    left(coalesce(nullif(trim(p_name), ''), 'Phòng chơi'), 60),
    uid,
    coalesce(p_is_public, false),
    least(20, greatest(2, coalesce(p_max_players, 8))),
    array[uid]
  )
  returning * into r;
  insert into public.cg_room_members (room_id, user_id, role)
  values (r.id, uid, 'player');
  return r;
end;
$$;
revoke all on function public.cg_create_room(text, boolean, int) from public;
revoke all on function public.cg_create_room(text, boolean, int) from anon;
grant execute on function public.cg_create_room(text, boolean, int) to authenticated;

-- (b) leaders can always read their own rooms.
drop policy if exists "cg_rooms member read" on cg_rooms;
create policy "cg_rooms member read" on cg_rooms
  for select using (
    is_cg_room_member(id) or is_public or leader_id = auth.uid()
  );
