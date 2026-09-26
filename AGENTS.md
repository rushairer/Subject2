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

Slope physics must treat `grade` as a magnitude along an explicit world-space uphill heading. Gravity must be projected onto the vehicle forward axis; never assume uphill is always world `-Z`. Rotated course placements must pass their placement heading into `stepVehiclePhysics`.

Every Subject 2 project state machine must also have deterministic regression coverage for its canonical successful flow and its major fatal/penalty transitions. A course is not considered direction-safe merely because its rendered geometry looks correct.

PR validation must run `npm test` and `npm run build` before merging course-state changes into `main`.

## Single source of truth for Subject 2 rules

`src/rules/subject2Rules.ts` owns the Subject 2 pass line, scoring metadata, fatal/non-fatal classification, and judgment thresholds such as time limits, stop durations, positioning tolerances and rollback bands.

- Course state machines may own geometry and phase transitions, but must not hard-code penalty points or fatal flags.
- New or changed Subject 2 infractions must be added to `SUBJECT2_INFRACTION_RULES` and referenced through `subject2Infraction(...)`.
- New or changed scoring/tolerance values must be added to `SUBJECT2_RULE_LIMITS`; do not duplicate them in course files or UI code.
- Every rule-matrix entry must have deterministic state-machine regression coverage.
- Refactors of the rule layer must preserve current behavior unless a rule change is explicitly intended and documented.
- `src/rules/subject2RuleProfile.ts` is the only supported way to construct local/venue rule variants. Every override must carry a non-empty `sourceNote`; do not invent local thresholds.
- The national profile remains the default for all judges and result assessment. A course/venue pack may inject a profile explicitly, but must never mutate `SUBJECT2_RULE_LIMITS` or fork the state machines.

## Single source of truth for training-car geometry

`src/sim/vehicleDimensions.ts` owns car length, width, wheelbase, track width, axle offsets, wheel radius, tire width, and the simulator tire contact-patch length. Exam collision and wheel-line checks must not introduce independent copies.

`src/sim/wheelContact.ts` owns four-wheel contact geometry and Ackermann front-wheel angles.

- Wheel-line judging must use finite tire contact footprints, not zero-area wheel-center points.
- Front tire headings must follow Ackermann left/right steering angles; rear tires follow the body heading.
- Shared wheel geometry used by rendering and judging must come from the same helper rather than duplicated formulas.
- Body-out rules and wheel-line rules are different concepts. Do not substitute body corners for wheel contact unless the rule explicitly evaluates the body.
- `src/sim/vehicleFootprint.ts` owns the full rectangular body footprint. For concave/L-shaped legal regions, body containment must use exact polygon coverage through `src/sim/planarGeometry.ts`; checking only the four body corners can miss an edge crossing a forbidden notch.
- `src/sim/planarGeometry.ts` owns reusable polygon/axis-aligned-rectangle intersection and rectangle-union coverage. Do not duplicate clipping math in individual courses.
- Rectangle-union containment must tolerate floating-point error on internal subdivision seams. A polygon wholly inside one legal rectangle must never be rejected because overlapping rectangles introduced extra clipping cells.
- Numerical area tolerance must remain far below any physically meaningful tire/body overlap; do not solve seam noise by weakening real boundary geometry.
- Add regression coverage at the exact safe/contact boundary whenever a line-contact algorithm changes.
- `src/subject2/courseMarkings.ts` owns the painted Subject 2 boundary-line width. Visual markings and line-contact judging must use the same value.
- For a painted boundary, contact starts at the physical paint region, not at an abstract road-edge centerline. L-shaped courses must model only lines that are actually painted; do not shrink rectangle unions and create artificial internal seams.

## Single source of truth for Subject 2 start poses

`src/subject2/courseStartPoses.ts` owns the canonical spawn position and heading for every Subject 2 project. Do not duplicate start X/Z/heading values in `App.tsx`, replay code, tests, or future continuous-course routing.

## Continuous Subject 2 exam world

Standalone course geometry and judging remain defined in each course's **local frame**. The continuous exam world must place courses through `src/subject2/subject2ExamLayout.ts` and convert the global vehicle pose back through `src/subject2/courseTransform.ts` before calling a course state machine.

- Do not duplicate translated/rotated copies of course geometry.
- Do not rewrite course judges in global coordinates.
- Connection-road driving must not activate the next project's penalties before the vehicle reaches that project's entry envelope.
- Continuous-exam trajectory/infraction samples should be stored in the active project's local frame so existing replay geometry remains meaningful.

## Continuous session lifecycle and input

- `src/session/examProgress.ts` owns atomic project identity, entry and completion transitions. Never split these into independently reset effects: stale completion can skip the next course.
- Completion and entry callbacks must identify their project and ignore stale callbacks from an earlier project.
- Do not key-remount `DrivingWorld` or the cockpit when the active project changes. Preserve held controls, vehicle state, camera selection and session-wide counters (including unique engine-stall IDs).
- Reset only the project judges and their completion latch, before judging the first frame of a new course. Keep project judging disabled during connection-road navigation; generic driving rules still apply there.
- Use `src/input/drivingKeyboard.ts` for normalized physical keys and first-press detection. Toggle controls must not repeat while held.
- Keyboard listeners must not depend on the selected camera mode. On window blur, hidden document or unmount, release held keyboard controls, observation flags and the horn.

## Results require actual completion

`src/session/sessionResult.ts` is the shared outcome assessor for the result page and persisted history.

- A high score alone never establishes a pass: the standalone project or final project of the continuous exam must be completed.
- Preserve the measured score when ending early, but label the outcome incomplete rather than fabricating a penalty or awarding a pass.
- Fatal infractions and scores below the threshold remain failures, even when a completion event arrives on the same frame.
- Manual and automatic termination must share one exactly-once guard, preventing duplicate history records.
- Old history records lack completion evidence. Keep optional fields compatible; do not invent completion for legacy records.

## Single source of truth for Subject 3 scoring

`src/rules/subject3Rules.ts` owns the Subject 3 pass score and penalty severity metadata.

- `Subject3Course.tsx` may decide *when* a rule is violated and generate contextual titles/IDs, but must not hard-code penalty points or fatal flags.
- Use `subject3Infraction(...)` for both event-level and global Subject 3 infractions, including road boundary, safety belt, lighting, simulated night-light-test failure and traffic collisions.
- UI callbacks may detect a Subject 3 failure when the event originates outside the route state machine, but they must still source severity from `subject3Rules.ts`; never inline Subject 3 points/fatal flags in `App.tsx`.
- `DRIVING_RULES.subject3` continues to own physical/behavioral thresholds such as signal lead time, lane targets, gear timing and stopping tolerances; do not duplicate those values in the scoring matrix.
- Changes to scoring severity require an explicit rule-matrix edit and regression update.
- `tests/subject3-rule-matrix.test.ts` guards the matrix and rejects inline severity literals in the state machine.

## Subject 3 global driving rules

- Subject 3 global penalties belong in `updateSubject3` and `subject3Rules.ts`, not in generic `App.tsx` driving checks.
- Route-speed judging keeps the shared 50km/h limit and 1.2s continuous-overlimit grace in `DRIVING_RULES.subject3`; emit it once per Subject 3 session through the scoring matrix.
- The parking-brake moving penalty remains exam-only. Pass the current session mode into the Subject 3 state machine rather than hard-coding exam behavior in the renderer loop.
- Safety-belt failure is owned solely by the Subject 3 state machine for Subject 3 sessions; the generic Subject 2 safety check must exclude Subject 3 to avoid duplicate IDs/penalties.
- Session-wide Subject 3 facts such as route overspeed, parking-brake violation and seatbelt violation must not be reset by per-event `resetEventStats`.

## Subject 3 full-route completion

- Subject 3 completion must come from successfully completing the final pull-over maneuver. Reaching a route-distance threshold alone must never set `runtime.completed`.
- A jump to the physical route end must not skip unfinished events, award completion, or produce a passing session result.
- The deterministic golden-route E2E must traverse every `SUBJECT3_EVENTS` entry in order for both C1 and C2, including manual gear sequencing for C1, live crosswalk yielding, actual target passing during overtake, the u-turn, and a secured final pull-over.
- Physics-integrated full-route coverage must exist for both C1 and C2. C1 coverage must exercise clutch use, sequential positive upshifts, the required high-gear duration, zero engine stalls, clutch disengagement during the final stop, and neutral + parking brake completion.
- Per-event reset must clear maneuver-local state without clearing session-wide facts such as seatbelt/parking-brake/route-speed records.
- If the final pull-over window is passed without a secured stop, keep the route incomplete; a fatal failure may end an exam, but it does not fabricate successful project completion.

## Subject 3 road and maneuver completion

- Subject 3 road-boundary judging must use the full training-car body footprint, not the vehicle center alone.
- `src/subject3/subject3Route.ts` owns the rendered road footprint used by judging. Keep segment road rectangles and 20m corner pads consistent with the meshes in `Subject3Course.tsx`.
- Lane-change success requires ending in the requested target lane; briefly crossing the lane divider and returning does not complete the maneuver.
- Overtake success requires both entering the overtaking lane and completing the return to the original lane before the event ends.
- Subject 3 maneuver thresholds belong in `DRIVING_RULES.subject3`; do not duplicate lateral cutoffs in state-machine code.
- Add regression tests for center-safe/body-out boundary cases and for incomplete maneuver end states.

## Subject 3 traffic collision judging

- Visible traffic must not be non-collidable scenery.
- Vehicle-vs-vehicle collision must use oriented body footprints and convex-polygon intersection, not a center-distance circle proxy.
- `src/sim/vehicleFootprint.ts` owns reusable oriented rectangular footprints; `src/sim/planarGeometry.ts` owns convex SAT intersection.
- `SUBJECT3_TRAFFIC_CAR` owns the rendered/judged traffic-car length and width. Static and moving traffic vehicles must share those dimensions and the same heading used by rendering.
- Static Subject 3 vehicles used for meeting/overtaking scenarios must report fatal collision infractions through the same `onInfraction` path as moving traffic.
- Pedestrians/scooters may continue to use small radial collision proxies where their rendered footprint is approximately compact; do not reuse that proxy for cars.
- Decorative pedestrians must remain outside the carriageway unless they are explicitly connected to collision/yield state.
- Cover longitudinal overlap, adjacent-lane separation, angled contact, and exact contact boundaries in unit tests.
- Visual traffic placement and collision placement must use the same route-distance/lateral coordinates.

## Subject 3 occupant-safety judging

- Subject 3 must treat driving without the safety belt fastened as a fatal failure.
- Do not penalize a stationary candidate merely for not having fastened the belt yet; the failure condition begins once the vehicle is actually moving.
- Keep the belt rule deterministic in the Subject 3 state machine rather than relying on dashboard warnings or cockpit visuals.

## Subject 3 overtake target completion

- The visual vehicle being overtaken and the state-machine target progress must share `SUBJECT3_OVERTAKE_TARGET_PROGRESS`; do not duplicate the target distance in rendering and judging.
- Returning to the original lane is not a valid overtake return until the candidate has been in the overtaking lane and has passed the target vehicle by the configured clearance.
- The overtake clearance belongs in `DRIVING_RULES.subject3.overtake` and is currently derived from the training-car length.
- Reaching the event end after an early left-right weave must fail even if both turn signals and observations were used correctly.
- Keep "entered overtaking lane", "passed target vehicle", and "returned to original lane" as separate state-machine facts with separate regressions.

## Subject 3 dynamic traffic state

- Dynamic actors that materially affect exam rules must publish deterministic shared traffic state; rendering alone is not sufficient evidence for a rule judgment.
- `src/subject3/subject3Traffic.ts` owns the dynamic crosswalk pedestrian path, rendered crosswalk progress, and whether that pedestrian is currently occupying the candidate's carriageway.
- The crosswalk event requires a yield stop only if a live pedestrian conflict was actually observed during that event. Do not require unconditional stopping at every crosswalk.
- A live pedestrian conflict is satisfied only by a real stopped-speed observation while the conflict is active; slowing down elsewhere in the event does not count.
- Keep actor collision failure and rule-level yielding separate: a collision is always fatal, while successful yielding prevents the rule-level failure before contact occurs.

## Subject 3 straight-driving and gear judging

- Straight-driving events must record at least one rear-traffic observation through the available look controls; direction stability and observation are separate judgments.
- The training car is a 5-speed manual. Subject 3's required next-highest gear must be derived from the shared highest-forward-gear value, not duplicated as an unrelated literal.
- Manual Subject 3 gear events must reject skipped upshifts, require reaching the next-highest gear, and accumulate the configured minimum time in that gear or above.
- Neutral between sequential positive gears must not erase the previous positive gear used for skip detection.
- C2 automatic mode is exempt from manual-gear sequence judgments.

## Subject 3 slow-zone judging

- Straight-through intersections, pedestrian crossings, school zones, and bus-stop events must record both left- and right-side observation during the event.
- For those slow-zone events, exceeding the configured event allowance represents failure to decelerate and is fatal; do not downgrade it to a 10-point warning.
- Left/right intersection turns use the same fatal deceleration semantics.
- Do not add an unconditional pedestrian-yield stop requirement unless the state machine is connected to the actual pedestrian conflict state. A rendered pedestrian existing somewhere in the scene is not enough to prove a live conflict.

## Subject 3 named maneuver geometry

- Named turn events must agree with the actual route geometry. Left-turn events must exit on the route's left-turn heading, right-turn events on the right-turn heading, and the u-turn event must reverse travel direction rather than approximate it with unrelated corners.
- Subject 3 turn completion requires the vehicle to finish aligned with the route heading within the shared `DRIVING_RULES.subject3.maneuverHeadingToleranceRadians`; do not hard-code per-event heading tolerances.
- Intersection turns must capture both left- and right-side observation before the maneuver begins.
- During the meeting event, the full vehicle body must remain on its own side of the road center line. Judge body geometry, not only the vehicle center.
- Any change to the route tail must preserve event mileage unless the event table and all dependent tests are intentionally migrated together.

## Subject 3 parking and night-light completion

- Pull-over is not complete merely because the vehicle stopped once inside the event window. Completion requires the configured stable-stop duration, neutral gear, and parking brake.
- Passing the pull-over event end without a secured stable stop must remain a fatal incomplete maneuver, even if an earlier brief stop was observed.
- Night-light "flash" prompts must validate a real high-beam state followed by a return to low beam. Counting key presses is not sufficient.
- Each night-light prompt starts with a fresh attempt state so a previous prompt cannot satisfy the next one.
- Keep night-light answer evaluation in `src/subject3/nightLightExam.ts` so it stays deterministic and unit-testable outside React timers.

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
