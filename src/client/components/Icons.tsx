/** Hand-drawn-ish icons for the wordless controller. No faces on objects. */
export function RodIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M18 86 Q40 40 82 14" stroke="#7a4a22" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M82 14 Q86 50 70 66" stroke="#fff" strokeWidth="2" fill="none" />
      <circle cx="26" cy="72" r="8" fill="#c9a24a" stroke="#6a4a1a" strokeWidth="3" />
      <circle cx="70" cy="70" r="7" fill="#e8463a" />
      <path d="M63 70 a7 7 0 0 0 14 0z" fill="#fff" />
    </svg>
  );
}

export function BobberIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="70" rx="34" ry="8" fill="rgba(255,255,255,.35)" />
      <path d="M50 18 v14" stroke="#333" strokeWidth="3" />
      <circle cx="50" cy="50" r="20" fill="#e8463a" />
      <path d="M30 50 a20 20 0 0 0 40 0z" fill="#fff" />
    </svg>
  );
}

/** "Go to the water": an arrow walking into waves (no footprints: two dots and a curve read as a face). */
export function FeetIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M12 70 q10 -10 20 0 t20 0 t20 0 t20 0" stroke="#7fd8ff" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M12 86 q10 -10 20 0 t20 0 t20 0 t20 0" stroke="#4fb8e8" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M50 12 v34" stroke="rgba(255,255,255,.9)" strokeWidth="10" strokeLinecap="round" />
      <path d="M32 34 L50 54 L68 34" stroke="rgba(255,255,255,.9)" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReelIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={spinning ? "spin" : ""}>
      <circle cx="50" cy="50" r="30" fill="#c9a24a" stroke="#6a4a1a" strokeWidth="5" />
      <circle cx="50" cy="50" r="8" fill="#6a4a1a" />
      <path d="M50 50 L78 26" stroke="#6a4a1a" strokeWidth="7" strokeLinecap="round" />
      <circle cx="80" cy="24" r="8" fill="#f4e2b0" stroke="#6a4a1a" strokeWidth="3" />
    </svg>
  );
}

export function CampfireIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M22 84 L78 70 M22 70 L78 84" stroke="#6a3a1a" strokeWidth="9" strokeLinecap="round" />
      <path d="M50 16 C64 34 72 46 64 62 C60 70 40 70 36 62 C30 50 40 40 50 16z" fill="#ff8a2a" />
      <path d="M50 40 C56 50 58 56 54 63 C52 67 48 67 46 63 C43 56 46 50 50 40z" fill="#ffe07a" />
    </svg>
  );
}

export function ShellIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 88 L14 46 Q50 0 86 46z" fill="#ffd9c0" stroke="#d9906a" strokeWidth="4" />
      <path d="M50 88 L30 40 M50 88 L50 30 M50 88 L70 40" stroke="#d9906a" strokeWidth="4" />
    </svg>
  );
}
