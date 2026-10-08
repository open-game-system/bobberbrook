import { isOGSCastAvailable } from "@open-game-system/cast-kit-core";
import { CastProvider, useCastViewUrl } from "@open-game-system/cast-kit-react";
import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { RoomContext } from "../../room.context";
import { phoneJoinUi } from "../joinMode";

export type Hosting = { tvUrl: string; joinUrl: string };

function qrDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 2);
}

/** Inside the OGS app: declare the streamed TV page (the app hands it to the TV launcher). */
function OgsTvPage({ tvUrl }: { tvUrl: string }) {
  useCastViewUrl(`${tvUrl}&stream=1`);
  return null;
}

/**
 * The host phone's join extras. In a plain browser: a link to the TV page and the room's QR. Inside OGS
 * the app casts and the others come from the couch (no code, no QR): who's fishing and who isn't yet.
 */
export function HostPanel({ hosting }: { hosting: Hosting }) {
  const code = RoomContext.useSelector((s) => s.public.roomCode);
  const couch = RoomContext.useSelector((s) => s.public.couch);
  const fishers = RoomContext.useSelector((s) => s.public.lake.fishers);
  const inOgs = useMemo(() => isOGSCastAvailable(), []);
  const [open, setOpen] = useState(!inOgs);
  const ui = phoneJoinUi({ inOgs, couch, fishingIds: fishers.map((f) => f.ogsId) });
  const qr = useMemo(() => qrDataUrl(hosting.joinUrl), [hosting.joinUrl]);
  return (
    <>
      {inOgs && (
        <CastProvider>
          <OgsTvPage tvUrl={hosting.tvUrl} />
        </CastProvider>
      )}
      {ui.kind === "scan" && (
        <div className={`host-join ${open ? "open" : ""}`}>
          <button type="button" className="host-join-toggle" onClick={() => setOpen(!open)}>
            {open ? "Hide" : `Invite · ${code}`}
          </button>
          {open && (
            <div className="host-join-body">
              <img className="host-qr" src={qr} alt={`QR code to join room ${code}`} />
              <div>
                <p className="kicker">Scan to fish</p>
                <p className="host-code">{code}</p>
                <p className="host-link">
                  TV: open <a href={hosting.tvUrl}>the TV screen</a> on a laptop or TV browser.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {ui.kind === "couch" && ui.couch.some((p) => !p.fishing) && (
        <div className="host-couch">
          Not fishing yet: {ui.couch.filter((p) => !p.fishing).map((p) => p.name).join(", ")}. They open Bobberbrook in the OGS app.
        </div>
      )}
    </>
  );
}
