import "react";

declare module "react" {
  interface CSSProperties {
    /** The seat's colour (controller tint, name tags). */
    "--seat"?: string;
    /** Reel progress 0..1. */
    "--progress"?: number;
    "--i"?: number;
  }
}
