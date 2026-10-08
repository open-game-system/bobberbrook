import { useEffect, useRef, useState } from "react";
import { useOgsProfile } from "@open-game-system/profile-kit/react";
import { nameGateMode } from "../nameGateMode";
import { SEAT_COLORS, type SeatColor } from "../../game/lake";
import { SEAT_HEX } from "../components/MiniMap";
import { HatIcon, PencilIcon } from "../components/Icons";

const KEY = "bobberbrook:name";

function remembered(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

type OnJoin = (name: string, ogsToken?: string, color?: SeatColor) => void;

/**
 * Before a phone or iPad joins: whose device is this? In the OGS app the device already knows (its
 * player profile): it joins at once with the player's token, and the room names the seat. In a plain
 * browser a name is required (the grown-up types it for the kids), remembered on this device for
 * next time, and shown on every screen.
 */
export function NameGate({ onJoin, full, taken }: { onJoin: OnJoin; full: boolean; taken: SeatColor[] }) {
  const mode = nameGateMode(useOgsProfile());
  // Join once per seat: a refreshed token (the app renews it) must not join again.
  const sent = useRef(false);
  useEffect(() => {
    if (mode.kind !== "join" || sent.current) return;
    sent.current = true;
    onJoin(mode.name, mode.ogsToken);
  }, [mode, onJoin]);
  if (mode.kind === "form") return <HatPicker onJoin={onJoin} full={full} taken={taken} />;
  return (
    <div className="phone center name-gate loading-card" aria-label="Joining">
      <img src="/art/fish/golden-koi.webp" alt="" className="loading-fish" />
    </div>
  );
}

/**
 * In a plain browser: no words for a kid. Four big hats; tap yours and you're fishing. A grown-up can
 * type a name instead (the small button), or the host names the kids later from Fishers.
 */
function HatPicker({ onJoin, full, taken }: { onJoin: OnJoin; full: boolean; taken: SeatColor[] }) {
  const [typing, setTyping] = useState(false);
  if (typing) return <NameForm onJoin={onJoin} full={full} />;
  return (
    <div className="phone center hat-picker">
      <div className="hats" role="group" aria-label="Pick your hat">
        {SEAT_COLORS.map((c) => (
          <button key={c} type="button" className="hat-btn" style={{ "--seat": SEAT_HEX[c] }} disabled={taken.includes(c)} aria-label={`${c} hat`} onClick={() => onJoin("", undefined, c)}>
            <HatIcon color={SEAT_HEX[c]} />
          </button>
        ))}
      </div>
      <button type="button" className="type-name" aria-label="Type your name" onClick={() => setTyping(true)}>
        <PencilIcon />
      </button>
    </div>
  );
}

function NameForm({ onJoin, full }: { onJoin: OnJoin; full: boolean }) {
  const [name, setName] = useState(remembered);
  const ok = name.trim().length > 0;
  const join = () => {
    if (!ok) return;
    try {
      localStorage.setItem(KEY, name.trim());
    } catch {
      /* private mode: just not remembered */
    }
    onJoin(name.trim());
  };
  return (
    <div className="phone center name-gate">
      <form
        className="name-card"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <h2 className="name-title">Who's fishing here?</h2>
        <input
          className="name-input"
          aria-label="name"
          value={name}
          maxLength={14}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="go"
          placeholder="Name"
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn primary start-btn" type="submit" disabled={!ok}>
          Join
        </button>
        {full && <p className="name-note">Four fishers are already on the lake.</p>}
      </form>
    </div>
  );
}
