# Subject2 Development Guardrails

## Canonical coordinate and direction convention

All driving, exam, camera, and route code must use the same vehicle-local frame:

- `heading = 0`: vehicle faces world `-Z`
- vehicle forward: `(sin(heading), -cos(heading))`
- vehicle right: `(cos(heading), sin(heading))`
- vehicle left: negative of vehicle right
- positive steering = road wheels point **right**; negative steering = road wheels point **left**
- while moving forward, positive steering produces positive heading delta (**right turn**) and negative steering produces negative heading delta (**left turn**)
- while reversing, heading delta changes sign: positive steering moves the rear axle **right** while the vehicle nose yaws left; negative steering moves the rear axle **left** while the nose yaws right
- positive route lateral offset = **right**
- negative route lateral offset = **left**
- Three.js visual body rotation remains `rotation.y = -heading`; do not infer driving turn sign from renderer rotation
- first-person look yaw uses camera rotation semantics; use named left/right actions rather than guessing from a raw angle

Use `src/sim/vehicleFrame.ts` helpers instead of duplicating trigonometric frame formulas in exam logic. Every named left/right route event needs a regression test proving the actual geometry turns the same way.

## Single source of truth for training-car geometry

`src/sim/vehicleDimensions.ts` owns car length, width, wheelbase, track width, axle offsets, and wheel radius. Exam collision and wheel-line checks must not introduce independent copies.

## Single source of truth for Subject 2 start poses

`src/subject2/courseStartPoses.ts` owns the canonical spawn position and heading for every Subject 2 project. Do not duplicate start X/Z/heading values in `App.tsx`, replay code, tests, or future continuous-course routing.

## User-facing replay coordinate convention

Driving replay must never expose raw world X/Z as if screen-left/screen-right were vehicle-left/vehicle-right. Replay maps must transform every trajectory, infraction, and field reference into the vehicle's initial local frame:

- screen top = initial vehicle forward
- screen right = initial vehicle right
- screen left = initial vehicle left
- screen bottom = initial vehicle rear

Use `src/replay/replayGeometry.ts` for the transform. Keep start/end/error legend markers visually identical to the markers used on the SVG map.

## Mirror system: locked known-good baseline

The three-mirror reflection system has a verified known-good baseline at commit:

- `80094e7a`

Treat the following mirror-rendering behavior as regression-sensitive and do not change it casually:

- RenderTarget horizontal flip configuration
- center/left/right mirror camera FOV, aspect ratio, near/far planes
- center/left/right camera anchor positions and rotations
- mirror render-loop behavior and camera world quaternion copying
- reflective plane UV behavior

### Mandatory workflow for mirror changes

1. Identify and compare against the last known-good baseline before editing.
2. Separate **reflection logic** from **mirror housing / visual styling**.
3. Visual-only changes must not modify camera anchors, camera parameters, RenderTarget texture transforms, or render-loop behavior.
4. If a regression appears, revert the reflection layer to the known-good baseline first; do not stack speculative fixes on top.
5. When validating a restoration, compare the relevant code blocks directly against the known-good commit rather than relying on memory or visual assumptions.

### Historical lesson

A previous regression was prolonged because `0c206fff` was incorrectly treated as the good baseline. In fact, the good mirror behavior predates it and is represented by `80094e7a`. The later commit changed mirror camera FOV/aspect and left/right anchor directions. Do not repeat that mistake.

## General regression rule

For any subsystem the user reports as "previously correct":

- find the exact last known-good commit first;
- diff good -> bad;
- identify the first breaking commit;
- restore the minimum affected subsystem;
- only then continue enhancements.
