import type { GoalContinuation } from "./goal-scheduler-state.ts";

/** `update_goal` arguments as Pi hands them over after schema validation. */
export interface UpdateGoalInput {
	status?: "complete" | "blocked" | "paused";
	continuation?: GoalContinuation | unknown;
	reason?: string;
	attempted_actions?: string[];
	suggested_action?: string;
	completion_summary?: string;
}

/** What `update_goal` should do for one validated argument object. */
export type UpdateGoalAction =
	| { kind: "reject"; message: string }
	| { kind: "continuation"; continuation: unknown }
	| { kind: "blocked"; reason?: string; attemptedActions: string[] }
	| { kind: "paused"; reason?: string; suggestedAction?: string }
	| { kind: "complete"; completionSummary?: string };

const REJECT_MESSAGE = "Provide exactly one lifecycle status or continuation, without mixing their fields. Send only the fields that belong to the chosen action (complete, blocked, paused, or a {\"kind\":\"wait\",...} continuation) and leave the others out instead of sending empty strings or arrays.";

/**
 * Normalize filler and classify one `update_goal` call.
 *
 * Some models fill every declared parameter and send `""`, `[]` and a no-op
 * `{"kind":"ready"}` continuation for the fields they do not use (observed with
 * a Codex/GPT model: six identical calls with `status:"complete"` plus a filler
 * continuation were all rejected, so the agent could neither complete nor pause
 * the goal). Those values state nothing, so they must not turn a plain
 * completion, block, pause, wait or ready call into a "mixing fields" conflict.
 */
export function planUpdateGoal(params: UpdateGoalInput): UpdateGoalAction {
	const status = params.status;
	const continuation = usedContinuation(status, params.continuation);
	const reason = blank(params.reason) ? undefined : params.reason;
	const suggestedAction = blank(params.suggested_action) ? undefined : params.suggested_action;
	const completionSummary = blank(params.completion_summary) ? undefined : params.completion_summary;
	const attemptedActions = (Array.isArray(params.attempted_actions) ? params.attempted_actions : [])
		.filter((action): action is string => typeof action === "string" && action.trim() !== "");

	const mixesStatusFields = continuation !== undefined
		&& (reason !== undefined || suggestedAction !== undefined || completionSummary !== undefined || attemptedActions.length > 0);
	if (Boolean(continuation) === Boolean(status) || mixesStatusFields) return { kind: "reject", message: REJECT_MESSAGE };
	if (continuation) return { kind: "continuation", continuation };
	if (status === "blocked") return { kind: "blocked", reason, attemptedActions };
	if (status === "paused") return { kind: "paused", reason, suggestedAction };
	return { kind: "complete", completionSummary };
}

/** A blank string is filler; a missing one is absent. */
function blank(value: string | undefined): boolean {
	return value === undefined || value.trim() === "";
}

/**
 * `{"kind":"ready"}` states nothing beyond "continue", so it is filler next to a
 * lifecycle status. Any other continuation (a wait carries a reason and deadline)
 * stays a real instruction and still conflicts with a status.
 */
function usedContinuation(status: UpdateGoalInput["status"], continuation: unknown): unknown {
	if (status === undefined) return continuation;
	const value = continuation as { kind?: unknown } | null | undefined;
	return value && typeof value === "object" && value.kind === "ready" ? undefined : continuation;
}
