import { gitEffectFailure } from "../invocation-guard.js"

/** Gitea finds a user by name without regard to case and follows a rename, so
 * the answered account is the one the name identifies. It is usable when it is
 * activated and allowed to sign in. */
export function isUsableAccount(data: unknown, username: string): boolean {
  const user = (data ?? {}) as { active?: unknown; prohibit_login?: unknown }
  if (
    typeof user.active !== "boolean" ||
    typeof user.prohibit_login !== "boolean"
  ) {
    throw gitEffectFailure(
      "completed",
      `Gitea answered user '${username}' without its account state.`,
    )
  }
  return user.active && !user.prohibit_login
}
