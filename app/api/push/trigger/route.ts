import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { needAuth } from "../_auth";
import { sendPushToUser } from "@/lib/push/server";

/**
 * Event-verified push triggers. The caller's client invokes these right after
 * performing the action; the server re-checks the real DB state before sending
 * anything, so a client cannot spam arbitrary users.
 *
 * kinds:
 *  - { kind: "challenge", challengeId } — notify the challenged player.
 *  - { kind: "challenge_declined", challengeId } — notify the challenger of a decline.
 *  - { kind: "turn", matchId } — notify whoever's turn it now is.
 *  - { kind: "corr", gameId } — notify the opponent in a correspondence game.
 *  - { kind: "corr_end", gameId } — notify the opponent when a corr game finishes.
 */

// Simple in-memory throttle: key -> last sent timestamp (ms).
const lastSent = new Map<string, number>();
function throttled(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const prev = lastSent.get(key) || 0;
  if (now - prev < minIntervalMs) return true;
  lastSent.set(key, now);
  return false;
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("push_not_configured");
  return createClient(url, serviceKey);
}

function displayName(p: { full_name?: string | null; username?: string | null } | null): string {
  if (!p) return "Người chơi";
  return p.full_name || p.username || "Người chơi";
}

/**
 * Persist the event to the in-app notification inbox so the user can review
 * it later even if the push was missed/dismissed. Fire-and-forget: a failure
 * here must never break the push itself.
 */
async function recordNotification(
  sb: ReturnType<typeof service>,
  n: {
    user_id: string;
    kind: string;
    title: string;
    body: string;
    url: string;
    ref_id?: string;
  }
): Promise<void> {
  try {
    // De-dupe: don't stack identical unread rows for the same event.
    let q = sb
      .from("cg_notifications")
      .select("id")
      .eq("user_id", n.user_id)
      .eq("kind", n.kind)
      .is("read_at", null)
      .limit(1);
    q = n.ref_id ? q.eq("ref_id", n.ref_id) : q.is("ref_id", null);
    const { data: existing } = await q;
    if (existing && existing.length > 0) return;
    await sb.from("cg_notifications").insert({
      user_id: n.user_id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      url: n.url,
      ref_id: n.ref_id ?? null,
    });
  } catch {
    /* inbox is best-effort */
  }
}

export async function POST(req: Request) {
  const auth = await needAuth(req);
  if ("error" in auth) return auth.error;
  const { uid } = auth;

  let body: { kind?: string; challengeId?: string; matchId?: string; gameId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    if (body.kind === "challenge" && body.challengeId) {
      return await onChallenge(uid, body.challengeId);
    }
    if (body.kind === "challenge_declined" && body.challengeId) {
      return await onChallengeDeclined(uid, body.challengeId);
    }
    if (body.kind === "challenge_accepted" && body.challengeId) {
      return await onChallengeAccepted(uid, body.challengeId);
    }
    if (body.kind === "turn" && body.matchId) {
      return await onTurn(uid, body.matchId);
    }
    if (body.kind === "corr" && body.gameId) {
      return await onCorr(uid, body.gameId);
    }
    if (body.kind === "corr_end" && body.gameId) {
      return await onCorrEnd(uid, body.gameId);
    }
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    const status = msg === "push_not_configured" ? 500 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

async function onChallenge(challengerId: string, challengeId: string) {
  const sb = service();
  const { data: ch, error } = await sb
    .from("cg_challenges")
    .select("id, challenger_id, challenged_id, status, room_id, created_at")
    .eq("id", challengeId)
    .single();
  if (error || !ch) throw new Error("not_found");
  // Only the real challenger can trigger, only for fresh pending challenges.
  if (ch.challenger_id !== challengerId) throw new Error("forbidden");
  if (ch.status !== "pending") throw new Error("not_pending");
  if (throttled(`challenge:${challengeId}`, 5 * 60 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  if (Date.now() - new Date(ch.created_at).getTime() > 10 * 60 * 1000) {
    throw new Error("stale");
  }
  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", challengerId)
    .single();
  const name = displayName(me);
  // Deep-link to the challenge itself (the app opens the Friends view).
  const url = `/?challenge=${ch.id}`;
  const { sent } = await sendPushToUser(ch.challenged_id, {
    title: "⚔️ Lời thách đấu!",
    body: `${name} vừa thách đấu bạn một ván cờ.`,
    url,
    tag: `challenge-${ch.id}`,
  });
  await recordNotification(sb, {
    user_id: ch.challenged_id,
    kind: "challenge",
    title: "⚔️ Lời thách đấu!",
    body: `${name} vừa thách đấu bạn một ván cờ.`,
    url,
    ref_id: ch.id,
  });
  return NextResponse.json({ ok: true, sent });
}

async function onChallengeDeclined(declinerId: string, challengeId: string) {
  const sb = service();
  const { data: ch, error } = await sb
    .from("cg_challenges")
    .select("id, challenger_id, challenged_id, status")
    .eq("id", challengeId)
    .single();
  if (error || !ch) throw new Error("not_found");
  // Only the challenged player can report a decline, and only once.
  if (ch.challenged_id !== declinerId) throw new Error("forbidden");
  if (throttled(`challenge_declined:${challengeId}`, 5 * 60 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  if (ch.status !== "declined") throw new Error("not_declined");
  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", declinerId)
    .single();
  const name = displayName(me);
  const body = `${name} đã từ chối lời thách đấu của bạn.`;
  // No deep link: the challenge is over, just open the app.
  const { sent } = await sendPushToUser(ch.challenger_id, {
    title: "😞 Thách đấu bị từ chối",
    body,
    url: "/",
    tag: `challenge-declined-${ch.id}`,
  });
  await recordNotification(sb, {
    user_id: ch.challenger_id,
    kind: "challenge_declined",
    title: "😞 Thách đấu bị từ chối",
    body,
    url: "/",
    ref_id: ch.id,
  });
  return NextResponse.json({ ok: true, sent });
}

async function onChallengeAccepted(accepterId: string, challengeId: string) {
  const sb = service();
  const { data: ch, error } = await sb
    .from("cg_challenges")
    .select("id, challenger_id, challenged_id, status, room_code")
    .eq("id", challengeId)
    .single();
  if (error || !ch) throw new Error("not_found");
  // Only the challenged player can report an acceptance, and only once.
  if (ch.challenged_id !== accepterId) throw new Error("forbidden");
  if (throttled(`challenge_accepted:${challengeId}`, 5 * 60 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  if (ch.status !== "accepted") throw new Error("not_accepted");
  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", accepterId)
    .single();
  const name = displayName(me);
  const body = `${name} đã chấp nhận lời thách đấu của bạn — vào phòng thi đấu ngay!`;
  // Deep link into the room: cg_join_room is idempotent for members, and
  // the challenger created the room, so the invite flow opens it directly.
  const url = ch.room_code ? `/?room=${ch.room_code}` : "/";
  const { sent } = await sendPushToUser(ch.challenger_id, {
    title: "⚔️ Thách đấu được chấp nhận!",
    body,
    url,
    tag: `challenge-accepted-${ch.id}`,
  });
  await recordNotification(sb, {
    user_id: ch.challenger_id,
    kind: "challenge_accepted",
    title: "⚔️ Thách đấu được chấp nhận!",
    body,
    url,
    ref_id: ch.id,
  });
  return NextResponse.json({ ok: true, sent });
}

async function onTurn(moverId: string, matchId: string) {
  const sb = service();
  const { data: m, error } = await sb
    .from("cg_room_matches")
    .select("id, room_id, blue_id, red_id, status, moves")
    .eq("id", matchId)
    .single();
  if (error || !m) throw new Error("not_found");
  if (m.status !== "active") throw new Error("not_active");
  const plies = Array.isArray(m.moves) ? m.moves.length : 0;
  // Blue moves first in Cờ Gánh: even plies = blue to move.
  const turnColor = plies % 2 === 0 ? "blue" : "red";
  const toMoveId = turnColor === "blue" ? m.blue_id : m.red_id;
  // The mover just played; only notify the *other* player whose turn it is.
  if (!toMoveId || toMoveId === moverId) throw new Error("not_their_turn");
  if (moverId !== m.blue_id && moverId !== m.red_id) throw new Error("forbidden");
  if (throttled(`turn:${matchId}:${moverId}`, 30 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }

  const { data: room } = await sb.from("cg_rooms").select("code, name").eq("id", m.room_id).single();
  const url = room?.code ? `/?room=${room.code}` : "/";
  const body = room?.name ? `Đến lượt bạn đi trong phòng ${room.name}.` : "Đến lượt bạn đi.";
  const { sent } = await sendPushToUser(toMoveId, {
    title: "🏁 Đến lượt bạn!",
    body,
    url,
    tag: `turn-${m.id}-${plies}`,
  });
  await recordNotification(sb, {
    user_id: toMoveId,
    kind: "room_turn",
    title: "🏁 Đến lượt bạn!",
    body,
    url,
    ref_id: m.id,
  });
  return NextResponse.json({ ok: true, sent });
}

async function onCorr(moverId: string, gameId: string) {
  const sb = service();
  const { data: g, error } = await sb
    .from("cg_corr_games")
    .select("id, blue_id, red_id, status, moves")
    .eq("id", gameId)
    .single();
  if (error || !g) throw new Error("not_found");
  if (g.status !== "active") throw new Error("not_active");
  if (moverId !== g.blue_id && moverId !== g.red_id) throw new Error("forbidden");
  if (throttled(`corr:${gameId}:${moverId}`, 30 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  const plies = Array.isArray(g.moves) ? g.moves.length : 0;
  const turnColor = plies % 2 === 0 ? "blue" : "red";
  const toMoveId = turnColor === "blue" ? g.blue_id : g.red_id;
  if (!toMoveId || toMoveId === moverId) throw new Error("not_their_turn");

  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", moverId)
    .single();
  const name = displayName(me);
  const body = `${name} vừa đi một nước. Mở app để đáp lại.`;
  const url = `/?corr=${g.id}`;
  const { sent } = await sendPushToUser(toMoveId, {
    title: "✉️ Cờ thư — đến lượt bạn!",
    body,
    url,
    tag: `corr-${g.id}-${plies}`,
  });
  await recordNotification(sb, {
    user_id: toMoveId,
    kind: "corr_turn",
    title: "✉️ Cờ thư — đến lượt bạn!",
    body,
    url,
    ref_id: g.id,
  });
  return NextResponse.json({ ok: true, sent });
}

async function onCorrEnd(finisherId: string, gameId: string) {
  const sb = service();
  const { data: g, error } = await sb
    .from("cg_corr_games")
    .select("id, blue_id, red_id, status, result, reason, winner_id")
    .eq("id", gameId)
    .single();
  if (error || !g) throw new Error("not_found");
  if (g.status !== "finished") throw new Error("not_finished");
  if (finisherId !== g.blue_id && finisherId !== g.red_id)
    throw new Error("forbidden");
  if (throttled(`corr_end:${gameId}`, 5 * 60 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  // Notify the OTHER player (who may be offline).
  const otherId = finisherId === g.blue_id ? g.red_id : g.blue_id;
  if (!otherId) throw new Error("no_opponent");
  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", finisherId)
    .single();
  const name = displayName(me);
  const url = `/?corr=${g.id}`;
  let title: string;
  let body: string;
  if (g.reason === "resign") {
    // The finisher resigned, so the other player won.
    title = "🏳️ Đối thủ đã đầu hàng!";
    body = `${name} đã đầu hàng. Bạn thắng ván cờ thư!`;
  } else if (g.winner_id === otherId) {
    title = "🏆 Bạn thắng ván cờ thư!";
    body = `${name} vừa kết thúc ván đấu. Mở app để xem lại.`;
  } else if (g.winner_id === finisherId) {
    title = "🏁 Ván cờ thư kết thúc";
    body = `Bạn đã thua ${name}. Mở app để xem lại ván đấu.`;
  } else {
    title = "🤝 Ván cờ thư kết thúc";
    body = `Ván đấu với ${name} đã kết thúc với tỷ số hòa.`;
  }
  const { sent } = await sendPushToUser(otherId, {
    title,
    body,
    url,
    tag: `corr-end-${g.id}`,
  });
  await recordNotification(sb, {
    user_id: otherId,
    kind: "corr_end",
    title,
    body,
    url,
    ref_id: g.id,
  });
  return NextResponse.json({ ok: true, sent });
}
