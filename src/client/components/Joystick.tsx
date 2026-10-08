import { capturePointer } from "../capture";
import { useEffect, useRef, useState } from "react";
import { quantizeStick, sameStick, type Stick } from "../stick";

/**
 * The left-thumb stick. Touch anywhere in its pad: the knob follows the finger, and the room hears a
 * quantized stick only when it changes (and a stop when the finger lifts).
 */
export function Joystick({ onStick, color }: { onStick: (s: Stick) => void; color: string }) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, on: false });
  const last = useRef<Stick>({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

  useEffect(() => () => onStick({ x: 0, y: 0 }), [onStick]);

  const update = (clientX: number, clientY: number) => {
    const el = pad.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = clientX - (r.left + radius);
    let dy = clientY - (r.top + radius);
    const len = Math.hypot(dx, dy);
    const max = radius * 0.62;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy, on: true });
    const s = quantizeStick(dx, dy, max);
    if (!sameStick(s, last.current)) {
      last.current = s;
      onStick(s);
    }
  };
  const release = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0, on: false });
    if (!sameStick(last.current, { x: 0, y: 0 })) {
      last.current = { x: 0, y: 0 };
      onStick(last.current);
    }
  };

  return (
    <div
      ref={pad}
      className={`stick ${knob.on ? "on" : ""}`}
      style={{ "--seat": color }}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        capturePointer(e.currentTarget, e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      aria-label="Walk"
    >
      <div className="stick-ring" />
      <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}>
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 6 l5 7 h-10z M20 34 l5 -7 h-10z M6 20 l7 5 v-10z M34 20 l-7 5 v-10z" fill="rgba(255,255,255,.75)" />
        </svg>
      </div>
    </div>
  );
}
