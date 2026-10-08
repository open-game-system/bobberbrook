import type { ButtonState } from "../fisherUi";

/**
 * A close-up of your own bobber, in the middle of the controller: the kid sees the nibble and the
 * splash right in their hands, a moment before the TV.
 */
export function BobberWindow({ state }: { state: ButtonState }) {
  const show = state.kind === "waiting" || state.kind === "bite" || state.kind === "reel";
  if (!show) return null;
  const thrash = state.kind === "reel" && state.thrashing;
  return (
    <div className={`bobber-window ${state.kind} ${thrash ? "thrash" : ""} ${state.kind === "waiting" && state.nibble ? "nibble" : ""}`} aria-hidden="true">
      <div className="bw-water" />
      <div className="bw-ripple" />
      <div className="bw-ripple r2" />
      {state.kind === "reel" ? (
        <div className="bw-fish" style={{ "--progress": state.progress }} />
      ) : (
        <div className="bw-bobber">
          <span className="bw-top" />
          <span className="bw-bottom" />
        </div>
      )}
      {(state.kind === "bite" || thrash) && <div className="bw-splash" />}
    </div>
  );
}
