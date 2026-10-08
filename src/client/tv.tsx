import { isOGSCastAvailable } from "@open-game-system/cast-kit-core";
import { onOgsPause } from "@open-game-system/profile-kit";
import { setPaused, captureStream } from "./audio/engine";
import { mount } from "./boot";
import { isFramed } from "./framed";
import { TvScreen } from "./screens/TvScreen";
import { hostPath } from "../ogsRoom";

// The OGS launcher keeps this TV page loaded when it goes Home or to another game: silent while parked.
onOgsPause(setPaused);

const params = new URLSearchParams(location.search);
const streamed = params.has("stream");

if (isOGSCastAvailable() && !streamed) {
  // Inside the OGS app this device is a fisher, not the TV: host here and cast the TV.
  location.replace(hostPath(location.href));
} else if (matchMedia("(pointer: coarse)").matches && !params.has("as") && !streamed) {
  // A phone or tablet that opened the TV link hosts a game instead (?as=tv forces the TV).
  location.replace("/host");
} else {
  // The streamed TV and the launcher's frame may autoplay; a laptop browser needs one click.
  mount((boot) => <TvScreen joinUrl={`${location.origin}/join/${boot.roomCode}`} autoSound={streamed || isFramed(window) || params.has("record")} />);
}

// The recorder opens the TV with ?record to capture its sound.
if (params.has("record")) Reflect.set(window, "__bbTap", captureStream);
