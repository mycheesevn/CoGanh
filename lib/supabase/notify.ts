/**
 * Push-notification event wiring for Phase 2C.
 * Callers fire events (challenge received, your-turn, corr move, challenge
 * declined); the server verifies the real DB state before sending anything.
 * Best-effort: failures here never break the game flow.
 */
import { notifyPushTrigger } from "@/lib/push/client";

export async function fireEvent(
  kind: "challenge" | "turn" | "corr" | "corr_end" | "challenge_declined" | "challenge_accepted",
  payload: Record<string, string>
): Promise<void> {
  try {
    if (kind === "challenge" && payload.challenge) {
      await notifyPushTrigger({ kind: "challenge", challengeId: payload.challenge });
    } else if (kind === "challenge_declined" && payload.challenge) {
      await notifyPushTrigger({
        kind: "challenge_declined",
        challengeId: payload.challenge,
      });
    } else if (kind === "challenge_accepted" && payload.challenge) {
      await notifyPushTrigger({
        kind: "challenge_accepted",
        challengeId: payload.challenge,
      });
    } else if (kind === "turn" && payload.match) {
      await notifyPushTrigger({ kind: "turn", matchId: payload.match });
    } else if (kind === "corr" && payload.game) {
      await notifyPushTrigger({ kind: "corr", gameId: payload.game });
    } else if (kind === "corr_end" && payload.game) {
      await notifyPushTrigger({ kind: "corr_end", gameId: payload.game });
    }
  } catch {
    /* push is best-effort; never break the game flow */
  }
}
