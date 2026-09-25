# Subject2 Development Guardrails

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
