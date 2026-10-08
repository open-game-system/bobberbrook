import { useEffect, useRef } from "react";
import type { ButtonState } from "../fisherUi";
import { BobberIcon, CampfireIcon, FeetIcon, ReelIcon, RodIcon } from "./Icons";

/**
 * The one big right-thumb button. It shows what it will do (cast, wait, hook, reel, again) with
 * pictures only. Reeling is a hold: down holds the line, up lets it go.
 */
export function ActionButton({ state, onPress, onHold }: { state: ButtonState; onPress: () => void; onHold: (holding: boolean) => void }) {
  const held = useRef(false);
  // A fish landing mid-hold: let go of the line when the reel ends.
  useEffect(() => {
    if (state.kind !== "reel" && held.current) held.current = false;
  }, [state.kind]);
  const down = () => {
    if (state.kind === "reel") {
      held.current = true;
      onHold(true);
    } else onPress();
  };
  const up = () => {
    if (held.current) {
      held.current = false;
      onHold(false);
    }
  };
  const progress = state.kind === "reel" ? state.progress : 0;
  return (
    <button
      type="button"
      className={`action ${state.kind} ${state.kind === "reel" && state.thrashing ? "thrash" : ""} ${state.kind === "waiting" && state.nibble ? "nibble" : ""} ${state.kind === "caught" && state.canRecast ? "ready" : ""}`}
      style={{ "--progress": progress }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        down();
      }}
      onPointerUp={up}
      onPointerCancel={up}
      aria-label={state.kind}
    >
      {state.kind === "reel" && (
        <svg className="reel-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="7" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" pathLength={1} strokeDasharray={`${progress} 1`} transform="rotate(-90 50 50)" />
        </svg>
      )}
      <span className="action-icon">
        {state.kind === "cast" && <RodIcon />}
        {state.kind === "walk-to-water" && <FeetIcon />}
        {state.kind === "waiting" && <BobberIcon />}
        {state.kind === "bite" && <img src="/art/fish/brook-trout.webp" alt="" draggable={false} />}
        {state.kind === "reel" && <ReelIcon spinning={state.holding} />}
        {state.kind === "caught" && (state.canRecast ? <RodIcon /> : <img src={`/art/fish/${state.fishId}.webp`} alt="" draggable={false} />)}
        {state.kind === "campfire" && <CampfireIcon />}
      </span>
    </button>
  );
}
