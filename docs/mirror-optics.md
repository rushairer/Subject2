# Training-car mirrors

The position/shape and reflection update was requested alongside the Santana body
rebuild. It intentionally replaces the fixed rear-camera approximation with
finite-aperture planar reflection. This is not a claim that the earlier locked
baseline was physically exact.

Before editing, the implementation was compared with `80094e7a`:

- The target's single horizontal flip, FOVs and capture loop still matched.
- `4c5e18d` subsequently moved the installation points to match the driver eye.
- `5ea9464` slimmed the housings and changed the glass offsets.
- The current center glass was 0.61 / 0.15 wide, but its camera aspect was
  512 / 190; directly mapping that view stretched the reflected scene.
- The abandoned `b4a1ed2` approach hid the entire cockpit and did not project
  through the mirror aperture. Do not repeat those shortcuts.

## Implementation boundaries

- `mirrorLayout.ts`: shared driver eye, physical mirror dimensions, mounting
  positions and separate left/right calibration. A small rear-flank reference
  stays at each inner edge. These are simulator placements, not surveyed OEM data.
- `mirrorGeometry.ts`: rounded outline with normalized, clamped [0,1] UVs.
- `mirrorProjection.ts`: reflect the observer across the glass, use a right-handed
  camera basis (-mirror-right, mirror-up, -mirror-normal), and build an off-axis
  frustum through the aperture. Its near plane clips geometry behind the glass.
- `VehicleMirrors.tsx`: appearance, targets and render ownership. It runs after
  ordinary frame updates and draws the main view exactly once. It does not change
  physics or traffic callback order. Only reflective surfaces are hidden during
  capture; the car and its ordinary occluders remain visible.

The camera basis requires exactly one horizontal texture flip (`repeat.x = -1`,
`offset.x = 1`), as in the known-good target configuration. A second UV flip is
incorrect. Do not replace the off-axis projection with a fixed FOV, aim reflection
cameras at guessed rearward angles, or hide the car to obtain a clearer picture.
Head rotation alone must not pan the content of a stationary physical mirror.

All three mirrors currently use flat glass. Convex side-mirror magnification,
multiple reflections between mirrors, and an occupant/avatar are not modeled.
A convex model would need actual curvature and per-ray verification; widening a
camera FOV would not be a physically equivalent substitute.

## Verification

Run `npm test` and `npm run build`. `tests/mirror-projection.test.ts` covers the
reflection law, aperture corners/UVs, clipping, depth scale, lateral order,
parallax, vehicle yaw/pitch/translation and the rear-flank/horizon calibration.

Browser validation: enter practice, inspect the forward view, hold Z/X to inspect
each side mirror, then use M to inspect the exterior. In a disposable browser
scene, place colored markers along analytically reflected rays and check their
actual rendered UV locations; add a nearer occluder and verify it covers the
farther marker. Do not ship those diagnostic scene objects.
