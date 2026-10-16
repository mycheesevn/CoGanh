-- 004: full-row realtime payloads for cg_challenges.
-- The challenger's client subscribes to UPDATEs of its outgoing challenges
-- (filter challenger_id=eq.<uid>) to auto-enter the room on accept and to
-- toast on decline. With the default replica identity, an UPDATE's WAL
-- record carries only the primary key + changed columns (status), so the
-- challenger_id filter can never match and payload.new lacks room_id —
-- the subscription silently never fires. FULL identity ships the whole
-- row, which is what the client (and realtime's filter evaluation) needs.
alter table public.cg_challenges replica identity full;
