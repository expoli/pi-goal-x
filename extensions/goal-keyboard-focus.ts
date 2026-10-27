import type { TUI } from "@earendil-works/pi-tui";

/**
 * Pi delivers raw terminal input to every extension `onTerminalInput` listener
 * before the focused component sees it, and the first listener that returns
 * `{ consume: true }` ends the chain. A focused dialog or overlay therefore
 * cannot protect its own Escape: while the subagent fleet inspector (or any
 * other extension dialog) is open, pressing Escape to close it also paused the
 * goal, because the goal only guards its own modals (`goalModalDepth`).
 *
 * The goal's pause / interrupt / collapse keys belong to the main window. Treat
 * them as unhandled unless the main editor owns the keyboard: the focused
 * component is the editor and no overlay is visible.
 *
 * Returns true when the check cannot be made (no TUI handle yet, RPC mode, or a
 * TUI implementation without the tested members): the goal keeps its documented
 * behavior instead of silently losing the pause key.
 */
export function mainEditorOwnsKeyboard(tui: TUI | undefined): boolean {
	if (!tui) return true;
	const candidate = tui as unknown as {
		hasOverlay?: () => boolean;
		getFocusedComponent?: () => unknown;
		focusedComponent?: unknown;
	};
	try {
		if (typeof candidate.hasOverlay === "function" && candidate.hasOverlay()) return false;
		const focused = typeof candidate.getFocusedComponent === "function"
			? candidate.getFocusedComponent()
			: candidate.focusedComponent;
		if (focused === undefined || focused === null) return true;
		return isEditorLike(focused);
	} catch {
		return true;
	}
}

/**
 * The editor exposes text accessors; Pi's own dialogs (selector, input, editor)
 * and extension overlays do not. `instanceof` is unreliable across the module
 * boundaries extensions load through, so inspect the component structurally —
 * the same test pi-subagents uses to detect the editor's focus.
 */
function isEditorLike(component: unknown): boolean {
	if (!component || typeof component !== "object") return false;
	const methods = component as Record<string, unknown>;
	return typeof methods.render === "function"
		&& typeof methods.handleInput === "function"
		&& typeof methods.getText === "function"
		&& typeof methods.setText === "function";
}
