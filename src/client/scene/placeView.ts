/**
 * Round 20: which side of a place the group camera looks from.
 *
 * Moonwell reads best because the family fishes its near (south) shore: the camera stands behind them and
 * looks over their shoulders across the water. Every other place kept a fixed side (home places all looked
 * from the south), so where the family fished the far shore (Mistmarsh, which the trail reaches from the
 * north-east) the camera looked at them across the whole pond, through the boardwalk, their lines running
 * toward the lens. Now the camera keeps the place's own side while the family stands on that side of the
 * water, and swings round when they fish further round the pond, until it stands no more than SIDE_SLACK
 * off straight behind them (Moonwell's own widest three-quarter, Dad at its west shore).
 */

// Round 26: the math moved to the rules (src/game/spots.ts), which pick fishing spots apart across this view.
export { SIDE_SLACK, behindYaw, placeSideYaw, placeYaw, wrapAngle } from "../../game/spots";
