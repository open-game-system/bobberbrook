import { mount } from "./boot";
import { setSfxTrim } from "./audio/sfx";
import { PhoneScreen } from "./screens/PhoneScreen";

// A controller's own effects play close to the ear, alone (the TV carries the world's mix).
setSfxTrim(0.85);
mount(() => <PhoneScreen />);
