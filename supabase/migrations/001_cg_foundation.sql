-- 001_cg_foundation.sql
--
-- Cờ Gánh (CG) foundation on the SHARED Supabase project (shared with
-- the xiangqi/PacClone, chess and CCT apps). All CG objects use the
-- `cg_` prefix to avoid collisions. The `profiles` table is shared and
-- is NEVER created here (and has NO email column — email lives only in
-- auth.users; display-name fallback joins auth.users).
--
-- Contents:
--   1. cg_stats               — per-player XP / record / Elo rating
--   2. cg_games               — game history (vs-computer + CvC rows)
--   3. cg_rating_history      — rating sparkline points (record RPC writes)
--   4. cg_ai_rating           — AI pseudo-rating by level (internal)
--   5. cg_record_game_result  — vs-computer record RPC + XP + Elo
--   6. cg_record_cvc_game     — CvC record RPC (history only, no XP/Elo)
--   7. cg_game_events + record_cg_game_event — site stats events
--   8. cg_site_stats          — aggregate stats RPC (member surface)
--   9. cg_daily_checkins + cg_claim_checkin + cg_checkin_history
--  10. cg_leaderboard         — public leaderboard RPC (rating-first)
--  11. cg_rating_progress     — caller's recent ratings (sparkline)
--  12. cg_setups              — saved board setups (setup editor)
--
-- All statements are idempotent. Run in the Dashboard SQL editor.

-- ================= 1. CG STATS =================
create table if not exists cg_stats (
  user_id uuid primary key references profiles(id) on delete cascade,
  xp int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  games_played int not null default 0,
  rating int not null default 800,
  peak_rating int not null default 800,
  updated_at timestamptz not null default now()
);
alter table cg_stats enable row level security;
drop policy if exists "cg_stats self" on cg_stats;
create policy "cg_stats self" on cg_stats
  for all using (auth.uid() = user_id);
drop policy if exists "cg_stats leaderboard" on cg_stats;
create policy "cg_stats leaderboard" on cg_stats
  for select using (true);

-- ================= 2. GAME HISTORY =================
-- player_color: 'blue' = the human's vs-computer game (human is always
-- Blue); 'cvc' = a computer-vs-computer game — result is stored from
-- BLUE's point of view (Blue moves first). Stats queries exclude cvc.
create table if not exists cg_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  player_color text not null default 'blue',
  result text not null check (result in ('win','loss','draw')),
  reason text,
  level int,
  plies int not null default 0,
  start_pos text not null,
  moves jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cg_games_user_created_idx on cg_games (user_id, created_at desc);
alter table cg_games enable row level security;
drop policy if exists "cg_games self" on cg_games;
create policy "cg_games self" on cg_games
  for all using (auth.uid() = user_id);

-- ================= 3. RATING HISTORY =================
create table if not exists cg_rating_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  rating int not null,
  created_at timestamptz not null default now()
);
create index if not exists cg_rating_history_user_idx on cg_rating_history (user_id, created_at desc);
alter table cg_rating_history enable row level security;
drop policy if exists "cg_rating_history self" on cg_rating_history;
create policy "cg_rating_history self" on cg_rating_history
  for select using (auth.uid() = user_id);

-- ================= 4. AI PSEUDO-RATING =================
-- PacClone AI_RATINGS ladder (rating.ts).
create or replace function public.cg_ai_rating(p_level int)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_level
    when 1 then 300
    when 2 then 500
    when 3 then 700
    when 4 then 900
    when 5 then 1100
    when 6 then 1300
    when 7 then 1500
    when 8 then 1700
    when 9 then 1900
    when 10 then 2100
    when 11 then 2250
    else 2400
  end;
$$;
revoke all on function public.cg_ai_rating(int) from public;
revoke all on function public.cg_ai_rating(int) from anon;
revoke all on function public.cg_ai_rating(int) from authenticated;

-- ================= 5. RECORD VS-COMPUTER RESULT + XP + ELO =================
-- XP rule (family): win = 10 + 2 * level, draw = 5, loss = 3.
-- Elo (PacClone model, computed server-side like CCT 006): start 800,
-- expected 1/(1+10^((opp-me)/400)), K = 40 under 20 games else 24,
-- floor 100, peak tracked. Delta rounding floor(x + 0.5) = JS Math.round.
create or replace function public.cg_record_game_result(
  p_result text,
  p_reason text,
  p_level int,
  p_plies int,
  p_start_pos text,
  p_moves jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $function$
declare
  xp int;
  v_uid uuid := auth.uid();
  v_rating int;
  v_games int;
  v_score numeric;
  v_expected numeric;
  v_k int;
  v_new int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  xp := case p_result
    when 'win' then 10 + 2 * p_level
    when 'draw' then 5
    else 3 end;

  select rating, games_played into v_rating, v_games
    from cg_stats where user_id = v_uid;
  v_rating := coalesce(v_rating, 800);
  v_games := coalesce(v_games, 0);
  v_score := case p_result when 'win' then 1 when 'draw' then 0.5 else 0 end;
  v_expected := 1.0 / (1.0 + power(10.0, (public.cg_ai_rating(p_level) - v_rating) / 400.0));
  v_k := case when v_games < 20 then 40 else 24 end;
  v_new := greatest(100, v_rating + floor(v_k * (v_score - v_expected) + 0.5)::int);

  insert into cg_games (user_id, player_color, result, reason, level, plies, start_pos, moves)
  values (v_uid, 'blue', p_result, p_reason, p_level, p_plies, p_start_pos, coalesce(p_moves, '[]'::jsonb));
  insert into cg_stats (user_id, xp, games_played, wins, losses, draws, rating, peak_rating)
  values (
    v_uid,
    xp,
    1,
    case when p_result = 'win' then 1 else 0 end,
    case when p_result = 'loss' then 1 else 0 end,
    case when p_result = 'draw' then 1 else 0 end,
    v_new,
    greatest(800, v_new)
  )
  on conflict (user_id) do update set
    xp = cg_stats.xp + excluded.xp,
    games_played = cg_stats.games_played + 1,
    wins = cg_stats.wins + excluded.wins,
    losses = cg_stats.losses + excluded.losses,
    draws = cg_stats.draws + excluded.draws,
    rating = v_new,
    peak_rating = greatest(cg_stats.peak_rating, v_new),
    updated_at = now();
  insert into cg_rating_history (user_id, rating) values (v_uid, v_new);
  return xp;
end;
$function$;
revoke all on function public.cg_record_game_result(text, text, int, int, text, jsonb) from public;
revoke all on function public.cg_record_game_result(text, text, int, int, text, jsonb) from anon;
grant execute on function public.cg_record_game_result(text, text, int, int, text, jsonb) to authenticated;

-- ================= 6. RECORD CvC GAME (history only) =================
-- p_result is from BLUE's point of view. No XP, no rating, no stats
-- counters — the game still appears in the owner's History, labelled
-- as computer-vs-computer (the family convention).
create or replace function public.cg_record_cvc_game(
  p_result text,
  p_reason text,
  p_level int,
  p_plies int,
  p_start_pos text,
  p_moves jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into cg_games (user_id, player_color, result, reason, level, plies, start_pos, moves)
  values (auth.uid(), 'cvc', p_result, p_reason, p_level, p_plies, p_start_pos, coalesce(p_moves, '[]'::jsonb));
end;
$function$;
revoke all on function public.cg_record_cvc_game(text, text, int, int, text, jsonb) from public;
revoke all on function public.cg_record_cvc_game(text, text, int, int, text, jsonb) from anon;
grant execute on function public.cg_record_cvc_game(text, text, int, int, text, jsonb) to authenticated;

-- ================= 7. GAME EVENTS (append-only site stats) =================
create table if not exists cg_game_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  event text not null check (event in ('start','finish','abandon')),
  result text check (result in ('win','loss','draw')),
  level int,
  created_at timestamptz not null default now()
);
create index if not exists cg_game_events_created_idx on cg_game_events (created_at desc);
create index if not exists cg_game_events_event_idx on cg_game_events (event);
alter table cg_game_events enable row level security;
drop policy if exists "Anyone can record cg game events" on cg_game_events;
create policy "Anyone can record cg game events" on cg_game_events
  for insert to anon, authenticated with check (true);

-- Write path: SECURITY DEFINER, server stamps auth.uid() (guests NULL).
create or replace function public.record_cg_game_event(
  p_event text,
  p_result text default null,
  p_level int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_event not in ('start', 'finish', 'abandon') then
    raise exception 'invalid event';
  end if;
  insert into cg_game_events (user_id, event, result, level)
  values (auth.uid(), p_event, p_result, p_level);
end;
$function$;
revoke all on function public.record_cg_game_event(text, text, int) from public;
revoke all on function public.record_cg_game_event(text, text, int) from anon;
grant execute on function public.record_cg_game_event(text, text, int) to anon, authenticated;

-- ================= 8. SITE STATS RPC =================
create or replace function public.cg_site_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  r jsonb;
begin
  select jsonb_build_object(
    'plays_total',   (select count(*) from cg_game_events where event = 'start'),
    'plays_member',  (select count(*) from cg_game_events where event = 'start' and user_id is not null),
    'plays_guest',   (select count(*) from cg_game_events where event = 'start' and user_id is null),
    'finished',      (select count(*) from cg_game_events where event = 'finish'),
    'abandoned',     (select count(*) from cg_game_events where event = 'abandon'),
    'members_total', (select count(*) from profiles),
    'members_today', (select count(*) from profiles where created_at >= date_trunc('day', now())),
    'members_week',  (select count(*) from profiles where created_at >= date_trunc('week', now())),
    'members_month', (select count(*) from profiles where created_at >= date_trunc('month', now())),
    'plays_daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('day', created_at)::date as d, count(*) as c
            from cg_game_events where event = 'start' and created_at >= date_trunc('day', now()) - interval '29 days'
            group by 1) t),
    'plays_weekly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('week', created_at)::date as d, count(*) as c
            from cg_game_events where event = 'start' and created_at >= date_trunc('week', now()) - interval '11 weeks'
            group by 1) t),
    'plays_monthly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('month', created_at)::date as d, count(*) as c
            from cg_game_events where event = 'start' and created_at >= date_trunc('month', now()) - interval '11 months'
            group by 1) t),
    'plays_yearly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('year', created_at)::date as d, count(*) as c
            from cg_game_events where event = 'start'
            group by 1) t),
    'members_daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('day', created_at)::date as d, count(*) as c
            from profiles where created_at >= date_trunc('day', now()) - interval '29 days'
            group by 1) t),
    'members_weekly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('week', created_at)::date as d, count(*) as c
            from profiles where created_at >= date_trunc('week', now()) - interval '11 weeks'
            group by 1) t),
    'members_monthly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('month', created_at)::date as d, count(*) as c
            from profiles where created_at >= date_trunc('month', now()) - interval '11 months'
            group by 1) t),
    'members_yearly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('year', created_at)::date as d, count(*) as c
            from profiles
            group by 1) t)
  ) into r;
  return r;
end;
$function$;
revoke all on function public.cg_site_stats() from public;
revoke all on function public.cg_site_stats() from anon;
grant execute on function public.cg_site_stats() to authenticated;

-- ================= 9. DAILY CHECK-IN =================
create table if not exists cg_daily_checkins (
  user_id uuid not null references profiles(id) on delete cascade,
  checkin_date date not null,
  streak int not null default 1,
  created_at timestamptz not null default now(),
  primary key (user_id, checkin_date)
);
alter table cg_daily_checkins enable row level security;
drop policy if exists "Users can view own cg checkins" on cg_daily_checkins;
create policy "Users can view own cg checkins"
  on cg_daily_checkins for select to authenticated
  using (user_id = auth.uid());

-- Claim semantics (PacClone exactly): day boundary Asia/Ho_Chi_Minh;
-- streak = yesterday's streak + 1 else 1; XP = least(10 + 5*(streak-1), 40);
-- idempotent on the same day; XP lands in cg_stats.
create or replace function public.cg_claim_checkin()
returns table (streak int, xp_awarded int, already_claimed boolean)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_yesterday date := v_today - 1;
  v_prev_streak int;
  v_streak int;
  v_xp int;
  v_existed boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select exists(
    select 1 from cg_daily_checkins
    where user_id = v_uid and checkin_date = v_today
  ) into v_existed;

  if v_existed then
    select c.streak into v_streak from cg_daily_checkins c
     where c.user_id = v_uid and c.checkin_date = v_today;
    return query select v_streak, 0, true;
    return;
  end if;

  select c.streak into v_prev_streak from cg_daily_checkins c
   where c.user_id = v_uid and c.checkin_date = v_yesterday;
  v_streak := coalesce(v_prev_streak, 0) + 1;

  v_xp := least(10 + 5 * (v_streak - 1), 40);

  insert into cg_daily_checkins (user_id, checkin_date, streak)
  values (v_uid, v_today, v_streak);

  insert into cg_stats (user_id, xp) values (v_uid, v_xp)
    on conflict (user_id) do update set xp = cg_stats.xp + excluded.xp, updated_at = now();

  return query select v_streak, v_xp, false;
end;
$function$;
revoke all on function public.cg_claim_checkin() from public;
revoke all on function public.cg_claim_checkin() from anon;
grant execute on function public.cg_claim_checkin() to authenticated;

create or replace function public.cg_checkin_history()
returns table (checkin_date date, streak int)
language sql
security definer
stable
set search_path = public
as $function$
  select c.checkin_date, c.streak
  from cg_daily_checkins c
  where c.user_id = auth.uid()
  order by c.checkin_date desc
  limit 7;
$function$;
revoke all on function public.cg_checkin_history() from public;
revoke all on function public.cg_checkin_history() from anon;
grant execute on function public.cg_checkin_history() to authenticated;

-- ================= 10. LEADERBOARD =================
create or replace function public.cg_leaderboard(p_limit int)
returns table (rank bigint, user_id uuid, display_name text, xp int, wins int, games_played int, rating int, peak_rating int)
language sql
security definer
stable
set search_path = public
as $function$
  select
    row_number() over (order by s.rating desc, s.xp desc) as rank,
    s.user_id,
    coalesce(nullif(p.full_name, ''), nullif(p.username, ''), split_part(coalesce(u.email, ''), '@', 1)) as display_name,
    s.xp,
    s.wins,
    s.games_played,
    s.rating,
    s.peak_rating
  from cg_stats s
  join profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  order by s.rating desc, s.xp desc
  limit least(coalesce(p_limit, 100), 200);
$function$;
revoke all on function public.cg_leaderboard(int) from public;
revoke all on function public.cg_leaderboard(int) from anon;
grant execute on function public.cg_leaderboard(int) to anon, authenticated;

-- ================= 11. RATING PROGRESS (sparkline) =================
create or replace function public.cg_rating_progress(p_limit int)
returns table (rating int, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $function$
  select h.rating, h.created_at
  from cg_rating_history h
  where h.user_id = auth.uid()
  order by h.created_at asc
  limit least(coalesce(p_limit, 60), 200);
$function$;
revoke all on function public.cg_rating_progress(int) from public;
revoke all on function public.cg_rating_progress(int) from anon;
grant execute on function public.cg_rating_progress(int) to authenticated;

-- ================= 12. SAVED SETUPS =================
create table if not exists cg_setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  position text not null,
  side_to_move text not null default 'blue' check (side_to_move in ('blue','red')),
  created_at timestamptz not null default now()
);
create index if not exists cg_setups_user_idx on cg_setups (user_id, created_at desc);
alter table cg_setups enable row level security;
drop policy if exists "cg_setups self" on cg_setups;
create policy "cg_setups self" on cg_setups
  for all using (auth.uid() = user_id);
