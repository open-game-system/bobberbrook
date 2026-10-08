import { useEffect, useRef, useState } from "react";
import { useOgsProfile } from "@open-game-system/profile-kit/react";
import { nameGateMode } from "../nameGateMode";

const KEY = "bobberbrook:name";

function remembered(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

type OnJoin = (name: string, ogsToken?: string) => void;

/**
 * Before a phone or iPad joins: whose device is this? In the OGS app the device already knows (its
 * player profile): it joins at once with the player's token, and the room names the seat. In a plain
 * browser a name is required (the grown-up types it for the kids), remembered on this device for
 * next time, and shown on every screen.
 */
export function NameGate({ onJoin, full }: { onJoin: OnJoin; full: boolean }) {
  const mode = nameGateMode(useOgsProfile());
  // Join once per seat: a refreshed token (the app renews it) must not join again.
  const sent = useRef(false);
  useEffect(() => {
    if (mode.kind !== "join" || sent.current) return;
    sent.current = true;
    onJoin(mode.name, mode.ogsToken);
  }, [mode, onJoin]);
  if (mode.kind === "form") return <NameForm onJoin={onJoin} full={full} />;
  return (
    <div className="phone center name-gate">
      <p className="name-joining">{mode.kind === "join" ? `Joining as ${mode.name}…` : "Joining the lake…"}</p>
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
