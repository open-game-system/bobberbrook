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

/** A little fishing hat in a seat colour (the kid's join button). No face. */
export function HatIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="66" rx="44" ry="14" fill={color} stroke="rgba(0,0,0,.25)" strokeWidth="3" />
      <path d="M24 64 Q26 26 50 24 Q74 26 76 64 Z" fill={color} stroke="rgba(0,0,0,.25)" strokeWidth="3" />
      <path d="M26 56 Q50 64 74 56" stroke="rgba(255,255,255,.75)" strokeWidth="6" fill="none" />
      <path d="M70 36 q14 -10 18 -24" stroke="#f4e2b0" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="88" cy="12" r="5" fill="#e8463a" />
    </svg>
  );
}

/** For grown-ups: type a name instead of picking a hat. */
export function PencilIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M22 78 L30 56 L66 20 L80 34 L44 70 Z" fill="#f4e2b0" stroke="rgba(0,0,0,.35)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 78 L30 56 L44 70 Z" fill="#7a4a22" />
      <path d="M66 20 L80 34" stroke="#e8463a" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

/** A little sailboat (no face). */
export function BoatIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M14 62 h72 l-12 18 h-48 z" fill="#b07a42" stroke="#5a3a22" strokeWidth="4" strokeLinejoin="round" />
      <path d="M50 14 v48" stroke="#5a3a22" strokeWidth="5" />
      <path d="M53 18 l26 36 h-26 z" fill="#f4e2b0" stroke="#c9b08a" strokeWidth="3" />
      <path d="M8 86 q10 -6 20 0 t20 0 t20 0 t20 0" stroke="#7fd8ff" strokeWidth="5" fill="none" />
    </svg>
  );
}

/** A friendly zeppelin (no face). */
export function ZeppelinIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="38" rx="38" ry="20" fill="#e8c06a" stroke="#7a4a22" strokeWidth="4" />
      <path d="M14 38 h72" stroke="#c9902a" strokeWidth="3" />
      <path d="M86 38 l10 -10 v20 z" fill="#c9902a" />
      <path d="M38 58 h24 l-4 14 h-16 z" fill="#b07a42" stroke="#5a3a22" strokeWidth="4" />
      <path d="M40 56 l-4 -2 M60 56 l4 -2" stroke="#5a3a22" strokeWidth="3" />
    </svg>
  );
}

/** The family journal: a leaf-bound book. */
export function BookIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M14 22 Q32 14 50 24 Q68 14 86 22 V80 Q68 72 50 82 Q32 72 14 80z" fill="#3d2a74" stroke="#f0c96a" strokeWidth="5" strokeLinejoin="round" />
      <path d="M50 24 V82" stroke="#f0c96a" strokeWidth="4" />
      <path d="M24 38 Q34 34 42 38 M24 52 Q34 48 42 52 M58 38 Q66 34 76 38" stroke="#b8a6f0" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** The valley map: a folded map with a dotted trail. */
export function MapIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M12 24 L36 16 L64 26 L88 18 V76 L64 84 L36 74 L12 82z" fill="#2c5e5a" stroke="#f0c96a" strokeWidth="5" strokeLinejoin="round" />
      <path d="M36 16 V74 M64 26 V84" stroke="#1d403e" strokeWidth="3" />
      <path d="M22 66 Q34 50 48 56 T76 34" stroke="#ffe07a" strokeWidth="4" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      <circle cx="76" cy="34" r="6" fill="#7ff0e4" />
    </svg>
  );
}

/** The fishers: two hats side by side (no faces). */
export function FishersIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="34" cy="62" rx="24" ry="8" fill="#4f9a4a" />
      <path d="M20 62 Q22 38 34 36 Q46 38 48 62z" fill="#6cc463" />
      <ellipse cx="66" cy="70" rx="24" ry="8" fill="#3a7ad0" />
      <path d="M52 70 Q54 46 66 44 Q78 46 80 70z" fill="#5aa0ff" />
      <path d="M52 62 H80" stroke="#f0c96a" strokeWidth="4" />
    </svg>
  );
}
