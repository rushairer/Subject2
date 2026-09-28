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

PR validation must run `npm test`, `npm run build`, and `npm run test:e2e` before merging rendered driving or course-state changes into `main`.

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
- Clicking the 3D driving canvas must actively focus the canvas (not merely blur a previously focused button), so Space/WASD and other controls have a deterministic keyboard target after help/camera UI interactions.

## Steering-column turn-signal behavior

- `src/input/turnSignalAutoCancel.ts` owns the mechanical turn-signal cancellation state; keep it independent from React rendering and exam scoring.
- A left/right signal may arm for automatic cancellation only after the steering wheel reaches the matching turn direction beyond `DRIVING_RULES.turnSignal.autoCancelArmWheelAngleRadians`, then cancel only after returning within the shared near-center threshold.
- Keep the arm threshold high enough that ordinary lane-change steering does not silently cancel the signal. Lane-change signal cancellation remains an explicit driver task unless the wheel was turned far enough to engage the simulated column cam.
- Hazard lights are not steering-cancelled and must clear any previously armed left/right cancellation state.
- Reset the auto-cancel state when the active project changes so a previous maneuver cannot cancel a signal in the next course.
- Changes to these thresholds or state transitions require deterministic coverage in `tests/turn-signal-auto-cancel.test.ts`.

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



## Subject 3 event-level practice slices

`src/subject3/subject3Practice.ts` is the single source of truth for targeted Subject 3 route slices.

- A practice slice reuses the existing Subject 3 route, renderer, dynamic traffic, `updateSubject3` state machine and scoring matrix. Never fork or copy a separate “practice judge”.
- Every slice starts before its first target event with a real approach distance (currently at least 60 m) so observation, signal lead time, deceleration and lane preparation can occur naturally.
- Initialize slice runtime with the configured event index and route progress. Earlier Subject 3 events must not be replayed, auto-evaluated or synthesized as completed.
- Slice completion means “this practice attempt reached the configured terminal event boundary”. It may complete with emitted infractions. It is not equivalent to passing a full Subject 3 exam.
- Full-road Subject 3 completion semantics remain unchanged: without a practice slice, only the secured final pull-over may set full-route completion.
- Passing an intermediate event end must never complete a normal full-road Subject 3 session.
- Daytime event-level slices skip the separate simulated night-light-test preflight because it is unrelated to the targeted maneuver. Full daytime Subject 3 keeps the light-test requirement.
- Starting a slice must place the vehicle on the canonical route using `poseAtRouteDistance`; do not hand-copy X/Z/heading coordinates into React.
- The current slice catalog is: intersection turns, lane change and pull-over. Add new slices only through `SUBJECT3_PRACTICE_SLICES` with deterministic route/start/completion tests.
- Replay coaching may map only known Subject 3 infraction families to exact slices. Unknown maneuvers must fall back to full Subject 3 rather than guessing a loosely related drill.
- Persist optional slice identity with generic exam history so recent records remain distinguishable. Old records without this field remain valid.

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

## Subject 3 gear-speed coaching

`src/coaching/gearSpeedCoaching.ts` owns non-scoring manual-transmission gear-speed coaching derived from recorded trajectory evidence.

- Gear-speed coaching is a training aid, not a second exam judge. It must never emit `Infraction`, subtract points, change pass/fail status, terminate an exam, or feed the scoring matrix.
- Do not hard-code a nationwide per-gear km/h table. Public exam guidance requires reasonable gear/speed matching, but small-car per-gear speed bands vary by vehicle and local training practice.
- Analyze only C1/manual Subject 3 samples with the engine running, a positive forward gear, the clutch substantially engaged, and enough vehicle speed to be outside launch/stop transients.
- Use the simulated vehicle's RPM evidence and the explicit `DRIVING_RULES.manualTransmission.gearSpeedCoaching` heuristics. User-facing copy must call these simulator training heuristics, not statutory thresholds.
- Require a sustained mismatch window before surfacing evidence so ordinary shifts, clutch transitions and brief RPM excursions do not become false coaching events.
- Trajectory samples must retain optional `engineOn`, `engineRpm` and `clutch` fields for this analysis while remaining compatible with older samples that lack them.
- Replay may show duration, gear, speed and RPM evidence and jump to the representative trajectory time. It must not add the coaching item to the error timeline or training-priority penalty aggregation.
- A manual C1 Subject 3 replay with recorded trajectory but fewer than two applicable gear-speed samples must render an explicit “有效样本不足” state instead of hiding the module or treating missing evidence as a clean result.
- Browser coverage may validate the gear-speed replay integration through that insufficient-evidence state. Exact speed/RPM thresholds, filtering and mismatch classification belong to deterministic `tests/gear-speed-coaching.test.ts`, not wall-clock WebGL driving speed.
- Changes to classification, sustained-window logic or filtering require deterministic coverage in `tests/gear-speed-coaching.test.ts`.

## Subject 3 traffic telemetry and following-distance coaching

`src/subject3/subject3Traffic.ts` owns the shared deterministic registry for rendered Subject 3 vehicles, and `src/subject3/subject3LeadVehicle.ts` owns nearest same-lane lead-vehicle plus forward oncoming-vehicle observation.

- Traffic that can influence coaching must publish route progress, lateral position, speed and travel direction into the shared traffic state. Never inspect Three.js mesh transforms from replay/scoring code.
- Lead-vehicle selection must use route progress plus lateral lane geometry, not raw Euclidean center distance. Ignore opposing traffic, adjacent-lane traffic, vehicles behind the candidate and actors outside the observation horizon.
- Following distance is bumper-to-bumper clearance: subtract both vehicle half-lengths from center-to-center route distance before calculating the time gap.
- Keep actor publication allocation-light in the frame loop and remove registry entries when an actor unmounts.
- `src/coaching/followingDistanceCoaching.ts` is a training aid, not a second exam judge. It must never emit `Infraction`, subtract points, terminate an exam, change completion/pass-fail, or feed the error timeline/training-priority penalty aggregation.
- The configured 3-second reference is a coaching baseline from public traffic-safety guidance, not a nationwide Subject 3 scoring threshold. User-facing copy must preserve that distinction.
- Low-speed queueing and brief cut-in/lane-change transients must not become coaching problems. Apply the configured minimum speed and sustained-duration window before surfacing a short-gap segment.
- Trajectory samples keep lead-vehicle telemetry optional so old replay/history data remains compatible.
- Replay may show net distance, time gap, closing speed/TTC context and jump to the representative trajectory moment, but the evidence remains advisory.
- Changes to traffic publication/selection require deterministic coverage in `tests/subject3-traffic-state.test.ts` and `tests/subject3-lead-vehicle.test.ts`; changes to coaching segmentation require `tests/following-distance-coaching.test.ts`.

## Subject 3 cut-in response coaching

`src/subject3/subject3Traffic.ts` publishes scripted hazard actors and `src/subject3/subject3HazardObservation.ts` owns route-relative cut-in observation. `src/coaching/cutInResponseCoaching.ts` owns advisory replay analysis.

- Hazard actors that affect replay coaching must publish deterministic route progress, lateral position, longitudinal/lateral velocity, active state and conflict state into `Subject3TrafficState.hazards`; replay code must never inspect Three.js transforms.
- Keep hazard kinds explicit. A cut-in scooter and a crosswalk pedestrian are different scenarios even when both occupy the candidate carriageway.
- Cut-in conflict combines the actor's modeled lane occupancy with the candidate's actual lateral position. Do not label an actor in another same-direction lane as a direct cut-in conflict.
- Cut-in response coaching is advisory only. It must never emit `Infraction`, change score/pass-fail, terminate an exam, or feed training-priority penalty aggregation.
- Detect the response trigger from a continuous false→true cut-in conflict transition. Large trajectory gaps must not manufacture an event.
- `DRIVING_RULES.subject3.cutInCoaching` values are simulator evidence heuristics, not statutory reaction-time, clearance or exam-scoring thresholds.
- Report only observed response evidence: throttle release, brake input, steering-wheel change and route-relative separation. Missing one operation must not automatically be called an error because defensive action can use different combinations.
- Keep all cut-in trajectory fields optional so older replay/history records remain readable.
- Replay evidence jumps must reuse the existing project/time focus path and expose the recorded cut-in distance state in the project readout.
- Hazard publication changes require deterministic coverage in `tests/subject3-traffic-state.test.ts`; observer changes require `tests/subject3-hazard-observation.test.ts`; response timing changes require `tests/cut-in-response-coaching.test.ts`.

## Subject 3 pedestrian response coaching

`src/coaching/pedestrianResponseCoaching.ts` explains the candidate's response after the scripted crosswalk pedestrian enters the same-direction carriageway.

- Existing `Subject3Runtime.crosswalkConflictSeen/crosswalkYieldStopSeen` and the centralized crosswalk yield rule remain the only scoring authority. The replay module must never add a duplicate penalty, change pass/fail, terminate an exam, or feed penalty-priority aggregation.
- Pedestrian telemetry comes from `Subject3TrafficState.hazards` and must follow the rendered/collision-resolved world actor through route projection. Replay code must never inspect Three.js meshes.
- Keep pedestrian hazard observation available while the candidate stops. Do not apply a minimum player-speed filter in the observer, because that would erase the exact stopped-state evidence the coaching module needs.
- Trigger coaching only on a continuous false→true pedestrian-conflict transition with a relevant route-relative distance. Large trajectory gaps must not fabricate a response event.
- `DRIVING_RULES.subject3.pedestrianResponseCoaching` values gate replay evidence only. They are not statutory reaction-time or distance thresholds.
- Report observed throttle release, brake response, stopped-state timing, minimum speed and separation. The existing scoring rule may still judge whether a required stop occurred; the coaching layer only explains how the response unfolded.
- Keep all pedestrian trajectory fields optional so older replay/history records remain readable.
- Replay evidence jumps must reuse the existing project/time focus path and show pedestrian conflict/distance context in the project readout.
- Observer changes require `tests/subject3-hazard-observation.test.ts`; response timing changes require `tests/pedestrian-response-coaching.test.ts`.

## Subject 3 sudden-brake response coaching

`src/coaching/suddenBrakeCoaching.ts` owns advisory replay analysis for the scripted same-lane sudden-brake vehicle.

- This module is coaching only. It must never emit `Infraction`, change score/pass-fail, terminate an exam, or feed training-priority penalty aggregation.
- Only actors explicitly published with `Subject3TrafficVehicleState.scenario === 'sudden-brake'` may trigger this analysis. Never infer a scripted emergency merely from an arbitrary lead vehicle slowing down.
- Scenario tagging belongs in the deterministic Subject 3 traffic registry. Keep ordinary flow vehicles untagged so scenario semantics cannot leak between actors.
- Detect the trigger from measured lead-speed deceleration plus the configured relevance filters in `DRIVING_RULES.subject3.suddenBrakeCoaching`. Those values are simulator coaching heuristics, not statutory reaction-time or exam-scoring thresholds.
- Record optional `throttle`, `brake`, `leadScenario`, and `leadSpeedMps` in trajectory samples. Older replay/history samples without those fields must remain readable.
- Reaction evidence reports only what the simulator observed: throttle release latency, brake latency/maximum brake, minimum gap/time-gap/TTC. Missing brake input must not be labeled automatically as a driving error because another evasive action may have occurred.
- The replay evidence jump must reuse the existing project/time focus path, and the project readout must expose recorded throttle/brake values so the response card is auditable.
- Changes to traffic scenario publication require coverage in `tests/subject3-traffic-state.test.ts` and `tests/subject3-lead-vehicle.test.ts`; trigger/response timing changes require deterministic coverage in `tests/sudden-brake-coaching.test.ts`.

## Subject 3 night-road lighting coaching

`src/coaching/nightLightingCoaching.ts` owns advisory replay analysis for high-beam use in concrete traffic contexts.

- This layer is coaching only. It must never emit `Infraction`, subtract points, terminate an exam, change completion/pass-fail, or feed training-priority penalty aggregation.
- The 150 m meeting threshold comes from the road-traffic implementation regulation and applies here as a replay context boundary; do not relabel it as a simulator-invented value.
- “Near following” has no single statutory distance in this implementation. Reuse `DRIVING_RULES.subject3.followingCoaching.referenceTimeGapSeconds` only as a training filter, and user-facing copy must keep that distinction explicit.
- Never flag free-road high-beam use merely because high beam is active. Require a matching oncoming-within-boundary or close-following traffic context plus the sustained-duration window.
- Oncoming observation must come from the deterministic Subject 3 traffic registry and route progress, not raw Three.js transforms or screen-space distance.
- Subject 3 is an open route, not a closed loop. Oncoming lookahead must use forward route-progress difference without modulo/wraparound; a vehicle near route start is never implicitly ahead of a player near route end.
- Trajectory samples keep `night`, `lowBeam`, `highBeam`, oncoming vehicle ID/distance and related fields optional so older replay/history data remains compatible.
- Replay evidence jumps must show the recorded headlamp state in the existing project readout so the coaching card remains auditable.
- Changes to oncoming observation require deterministic coverage in `tests/subject3-lead-vehicle.test.ts`; changes to lighting segmentation/filtering require `tests/night-lighting-coaching.test.ts`.
- Browser coverage must exercise a real night Subject 3 scene through result/replay and verify both the night-lighting panel and headlamp readout.

## Multi-event hazard replay

- The driving-dynamics hazard browser is a presentation/coaching layer over the existing sudden-brake, cut-in and pedestrian analyzers. It must reuse their emitted events and stable `drivingDynamicsEventId(...)`; do not create a second hazard detector for navigation.
- Hazard events are ordered chronologically across event kinds. Previous/next navigation updates the shared selected-event identity, the dynamics cursor, the matching coaching evidence highlight and the project replay cursor together.
- Continuous previous/next browsing must not force-scroll the page away from the hazard browser. Explicit evidence actions such as “查看当前轨迹” may scroll to the corresponding project replay.
- The browser may summarize existing evidence such as gap, closest distance and reaction time, but it must not add penalty points, mutate infractions or claim an unobserved reaction.
- A stale or missing selected-event ID falls back safely to the first current event. Empty sessions render no browser.
- Keyboard left/right navigation is allowed only within the hazard browser and must preserve normal button accessibility.

## Replay driving dynamics timeline

`src/replay/drivingDynamicsTimeline.ts` owns the session-wide speed/gear timeline model and `DrivingDynamicsTimelinePanel.tsx` owns its replay UI.

- The dynamics timeline is replay evidence only. It must never emit infractions, modify score/pass-fail, or create hidden coaching penalties.
- Build the chart from existing trajectory samples; do not introduce a second high-frequency recording stream.
- Keep full-resolution samples available for the scrubber and evidence jump, but downsample only the SVG path when sessions are long.
- Downsampling must preserve the first/last sample and both sides of every gear transition so shift timing is not visually erased.
- Speed uses absolute vehicle speed for display while the original signed sample remains available to replay logic.
- Timeline selection must route through the existing project/time focus mechanism rather than creating an independent replay cursor source of truth.
- Changes to sorting, max-speed calculation, gear-transition detection or downsampling require deterministic coverage in `tests/driving-dynamics-timeline.test.ts`.
- Defensive-driving event markers must be derived from the existing sudden-brake, cut-in and pedestrian coaching reports; do not duplicate those trigger heuristics in the timeline UI.
- Marker time must use each coaching event's existing `representativeTime`, and clicking a marker/chip must update the timeline cursor and route through the existing project/time focus callback.
- Marker generation belongs in `src/replay/drivingDynamicsEvents.ts`; deterministic marker kind/order/evidence-time coverage stays in `tests/driving-dynamics-timeline.test.ts`.
- Shared event identity belongs in `src/replay/drivingDynamicsEventIdentity.ts`; coaching panels must import that lightweight module instead of importing the aggregate marker builder just to construct IDs.
- `ExamReplay` owns the selected defensive-event ID. Timeline markers/chips and their matching coaching card must reflect the same selection; any unrelated replay-focus action must clear that selection so stale highlighting cannot survive a context change.
- Event markers must remain keyboard operable and expose pressed/selected state through accessible button semantics.
- Browser coverage must prove the dynamics timeline can drive the existing project replay focus instead of only verifying that the chart renders, and must verify the unified hazard-aware chart surface is present.

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

## Shared world collisions and effective-area containment

- Subject 2 and Subject 3 must use `src/sim/collisionResponse.ts` and `useCollisionBody.ts` for physical response, material animation and sound. Course adapters may attach scoring callbacks but must not implement independent speed resets or impulses.
- Collision response must preserve relative-speed scaling. Do not reintroduce low fixed travel/speed caps that make a 40–50 km/h impact look like a parking-speed bump. Light actors may receive several metres of bounded displacement at severe speeds; scoring remains independent of that presentation.
- Pedestrian/scooter severe-impact visuals may use bounded ballistic lift, loss of balance and glancing yaw, but must stay non-graphic. Their compound proxies must follow the same visible local XYZ rotation so collision geometry does not lag behind the rendered actor.
- Collision shapes, actor velocity and motion offsets use world coordinates; placed-course props convert to local coordinates only for rendering. Cars retain oriented body polygons; compact people, scooters and cones may use shared compound circle proxies that follow visible tilt.
- Course-gate posts use `courseGateGeometry.ts`; the open center and elevated crossbar must not become invisible walls.
- Integrate vehicle physics at frame priority -2, resolve contacts at -1, then update camera/judges/replay. These negative priorities must not take over rendering.
- Native project boundary checks must not wait for a reverse/start/entry maneuver before detecting a departure. Continuous navigation still disables the next project's judge.
- `subject2ProjectJudgingEnabled(...)` in `subject2ExamLayout.ts` is the pure source of truth for that continuous-navigation gate. State-machine tests must not bypass this gate and then expect transition-road silence from native boundary guards.
- `subject2EffectiveArea.ts` supplies the separate full-session outer-area guard using actual ground surfaces and connecting roads. Preserve rotated placements, open internal seams and legal canonical starts; do not reintroduce a global world-X cutoff.
- `courseGroundGeometry.ts` is shared by ground rendering and outer-area judging. The outer-area failure severity belongs in `subject2Rules.ts`, while Subject 3 road containment remains in its state machine and scoring matrix.


## Browser and WebGL release gate

Rendered driving behavior is release-critical and cannot be proven by Node-only state-machine tests.

- Pull requests and `main` releases must pass `npm test`, `npm run build`, and `npm run test:e2e`.
- `e2e/driving-smoke.spec.ts` owns the minimum real-browser smoke path: profile/menu, a Subject 2 3D scene, Subject 3 3D scene, four camera modes, basic keyboard vehicle controls, clean runtime console/page errors, and result/replay entry.
- GitHub Pages deployment must remain downstream of the Chromium/WebGL smoke job. Never upload/deploy the Pages artifact before browser smoke succeeds.
- Preserve Playwright failure artifacts (HTML report, trace, screenshot/video) in CI so WebGL, mirror, camera and interaction regressions are diagnosable.
- A green TypeScript build is not sufficient evidence for changes to Three.js rendering, RenderTarget mirrors, camera placement, shadows, visible road geometry, dynamic actors or keyboard interaction.
- Browser tests should interact through user-visible/accessibility semantics where practical. Do not add brittle test-only business branches or bypass the real control path.
- Progressive pedal ramp timing belongs to deterministic input/physics tests. Software-WebGL browser smoke may verify pedal response, brake priority, focus-loss cleanup and next-frame release, but must not require a particular analogue opening or road speed after a fixed wall-clock delay.
- C1 browser launch flows must respect the current half-linkage model: Shift latches the bite point; releasing Shift does not cancel that latch. Use C to cancel the latch before expecting fully engaged-clutch road-speed acceleration.
- Keep the mirror reflection baseline rule above in force: browser smoke supplements, but does not replace, direct comparison with known-good commit `80094e7a` for reflection-layer changes.
- `src/ui/DrivingRendererLifecycle.tsx` owns synchronous WebGL renderer release when a driving Canvas unmounts. Result → targeted-practice transitions must not briefly retain two heavyweight renderer contexts.
- Do not remove renderer disposal/context-loss cleanup merely because React Three Fiber also performs delayed root cleanup; the explicit cleanup protects fast remounts and software-WebGL environments.
- Browser tests should end any still-active driving session after each case so the next case begins without a stale WebGL surface.


## Replay diagnosis and coaching

Replay coaching must remain deterministic and evidence-linked until an explicit AI coaching layer is introduced.

- `src/replay/replayDiagnosis.ts` owns the current before/after operation slice and rule-based coaching text.
- Never fabricate post-event vehicle state. If the session ended before a requested +1.5s/+3s checkpoint, omit that checkpoint instead of clamping it to the last sample.
- Operation slices must stay inside the infraction's exact project ID, including continuous-exam transition IDs; never borrow a nearby sample from a different project.
- Known rule families should have specific coaching. Unknown/future rule IDs must fall back to conservative replay guidance rather than inventing thresholds or legal requirements.
- Replay advice supplements the scoring matrices; it must not become a second source of truth for points, fatality, timing thresholds, geometry tolerances or pass lines.
- Any new diagnosis family or slice behavior needs deterministic unit coverage in `tests/replay-diagnosis.test.ts`.
- `src/replay/replayTrainingFocus.ts` owns session-level habit aggregation. Each infraction maps to exactly one primary habit so a single error cannot inflate multiple priorities.
- Training priorities sort by existing evidence only: fatal-event count first, then emitted penalty points, recurrence count and earliest event time. Do not invent a separate coaching score or change scoring-matrix semantics.
- Show at most three priority habits. Every priority card must retain representative rule evidence and, when timestamp/project data exists, navigate back to the corresponding replay position.
- Aggregation must remain a presentation/coaching layer: it may summarize emitted infractions but must never create, suppress or mutate infractions.
- Targeted replay training must start a fresh `practice` session. It must never rewrite the completed result, mutate persisted history, or convert the prior session into practice retroactively.
- A targeted-training destination should come from the representative infraction's evidence project. For continuous-exam `transition:from:to` samples, resolve to the upcoming `to` project; never expose an internal transition ID or `subject2-exam` as a standalone training destination.
- Keep “查看轨迹证据” and “专项训练” as separate actions. Evidence navigation stays inside the result replay; targeted training intentionally leaves the result and starts a new driving session.
- Browser coverage must exercise the full result → priority habit → evidence → targeted-practice path so coaching navigation cannot silently rot.

## Cross-project training packs

`src/training/trainingPacks.ts` is the single source of truth for replay-driven cross-project coaching sequences.

- Training packs are coaching playlists, not a new scoring system. Every stage must use the existing project's real state machine, scoring matrix, geometry, completion event and replay evidence.
- A pack always runs in `practice` mode. Starting or continuing a pack must never rewrite the source result, convert a prior exam into practice, or fabricate a synthetic pass/fail score across stages.
- `space-position` currently sequences reverse parking → side parking → curve driving → right-angle turn. `observation-signal` currently sequences right-angle turn → Subject 3 intersection-turn slice → lane-change slice → pull-over slice. Change these only in `trainingPacks.ts`.
- Only habits explicitly mapped in `trainingPacks.ts` may show a cross-project pack action. Unmapped habits must retain the evidence-project targeted-practice fallback instead of inventing a sequence.
- When both actions exist, keep them distinct: the pack action trains the broader habit across projects; the project action returns to the representative evidence project.
- Pack stage advancement must use `TrainingPackSessionState`, `trainingPackStage(...)` and `trainingPackStageLabel(...)`; never infer the next course/slice from UI text or duplicate stage arrays inside React components.
- Preserve the selected day/night environment and candidate license type when moving between pack stages.
- A completed Subject 2 pack stage may auto-open its stage result only after the underlying project reports real completion. Manual “结束并查看结果” remains allowed and may continue the pack from an incomplete stage result.
- Subject 3 pack stages may use an explicit `subject3Practice` slice from `src/subject3/subject3Practice.ts`. Never replace that metadata with a generic full-road `subject3` stage when an exact slice exists.
- Browser coverage must verify the real observation/signal pack across its four WebGL stages, including exact slice labels, no unrelated light-test preflight, stage progress, final persistence and clean renderer lifecycle.


## Training-pack aggregate review

`src/training/trainingPackReport.ts` owns deterministic aggregation across stages of one active training-pack run; `src/training/TrainingPackReportPanel.tsx` owns its final presentation.

- Never create a synthetic cross-project exam score. Pack review may show the existing per-stage scores, completion state and emitted infractions only.
- Cross-stage trend compares target-habit infraction evidence conservatively. Because projects have different rule opportunities and difficulty, user-facing copy must state that this is an in-pack coaching trend, not a formal exam-performance equivalence.
- Stage aggregation must retain the real pack/project/index identity. Re-running the same stage replaces that stage's in-memory result rather than duplicating it.
- Starting a fresh training pack resets prior pack-stage aggregation. Starting a normal single project, returning to the training center, or switching candidate must not leak a previous pack's aggregate state into the next session.
- Retry recommendations rank existing evidence lexicographically (fatal evidence, target-habit event count, total emitted events, then existing stage score); do not invent a hidden coaching score.
- Final-pack browser coverage must traverse at least two real WebGL stages and verify the aggregate report renders from the recorded stage results.

## Replay-priority responsive layout

The “本次优先改进” block must remain readable inside the result-card content width, not merely at full viewport width.

- Do not force three fixed columns when priority cards contain long Chinese evidence/action text. Use intrinsic/auto-fit card sizing so the grid drops to fewer columns based on available container width.
- Header description belongs in normal document flow under the title; it must never overlap the first row of cards.
- Priority-card action buttons must allow wrapping and stay within the card's inline bounds. Prefer concise project action labels such as “科目三 / 倒库 / 侧方” over repeating long course titles inside narrow buttons.
- When a cross-project training-pack action exists, keep it visually distinct from evidence navigation and single-project retry.


## Cross-round training-pack history

`src/training/trainingPackHistory.ts` owns local persistence and deterministic comparison of completed training-pack rounds.

- Persist one round only after the candidate reaches the pack's final configured stage and every pack stage has a recorded result. Leaving a pack early must not create a fake complete round.
- History identity is scoped by candidate name + license type + training-pack ID. Never compare C1 and C2 evidence, different candidates, or different packs as one trend.
- Ignore persisted rounds whose `totalStages` no longer matches the current pack definition. A pack-layout migration (for example observation/signal changing from two stages to four) must not contaminate new cross-round trends.
- Keep history local-only unless an explicit sync/account feature is added. Storage failure must never block the active result screen.
- Cross-round comparison must remain evidence-based and lexicographic; do not synthesize a hidden aggregate score. Current priority is fatal evidence, then incomplete-stage count, then target-habit infraction count.
- At least two rounds are required for a directional comparison. “Continuous/stable improvement” requires at least three rounds, no adjacent regression in the comparison evidence, and at least one actual improvement.
- Compare at most the recent bounded window used by `compareTrainingPackRounds`; preserve older stored rounds only up to the storage limit.
- User-facing copy must distinguish an observed coaching trend from proof of driving skill. One better round is “improved versus earlier evidence”, not “habit mastered”.
- The final-pack browser smoke must verify that a real round is persisted and that a seeded prior round is filtered/matched into the visible cross-round trend.


## Personalized long-term training plan

`src/training/trainingPlan.ts` owns deterministic training-center recommendations derived from persisted training-pack history. `src/training/TrainingPlanPanel.tsx` owns presentation only.

- Scope evidence by candidate name + license type before comparing or ranking packs. Never let another candidate or C1/C2 history affect the current plan.
- Do not create a hidden coaching score. Recommendation ordering is categorical and evidence-driven: urgent evidence first, then reinforcement, then missing-baseline work, then maintenance.
- “Priority” is reserved for current severe evidence such as fatal records, incomplete stages, or a worsening cross-round trend.
- A pack with remaining target-habit errors must stay in reinforcement even when its trend is improving. Stable improvement does not erase unresolved evidence.
- “Lower priority / maintain” is allowed only when the latest round has no target-habit errors, no fatal evidence, and no incomplete stages, with enough history to support the wording.
- No-history and single-clean-round states must ask for baseline/confirmation rather than claiming stability.
- User-facing advice must explain the concrete evidence behind the recommendation and state that reduced training priority is not proof of real-road driving competence.
- Menu recommendations must launch the configured pack through the same `onStartTrainingPack` path as the normal pack card. Do not invent a recommendation-only session type or bypass pack state.
- The browser smoke must seed evidence, verify the expected training-center recommendation, and enter a real WebGL pack from the recommendation CTA.


## Daily balanced training plan

`src/training/dailyTrainingPlan.ts` owns the deterministic “今日训练计划” sequence. `src/training/TodayTrainingPlanPanel.tsx` owns presentation only.

- The daily plan is derived from the current long-term training-plan ordering plus today's persisted training-pack history; do not introduce a second independent priority engine.
- Limit the default daily workload to at most two distinct training packs. Repeating the same pack multiple times on one local calendar day never substitutes for the other planned pack.
- A pack counts as completed for today only when a persisted full training-pack round exists for the current candidate + license type + pack ID on the same local calendar day.
- History from another candidate, another license type, or a previous local calendar day may influence long-term priority but must never mark today's task complete.
- If the highest-priority pack is already complete today, advance to the next distinct pending pack instead of recommending another repetition.
- When one pack has already been repeated multiple times today while another planned pack is still pending, surface an explicit anti-bias notice rather than silently rewarding repetition.
- “Today complete” means the configured daily sequence has been covered once; it is not a statement that driving skill is mastered.
- The browser smoke must seed prior evidence, enter the first daily recommendation, finish that real WebGL training pack, return to the training center, and verify the second distinct pack becomes the next task.


## Portable production asset base

`vite.config.ts` must keep the production `base` relative (`'./'`) so one build works both under the GitHub Pages repository subpath and at a custom-domain root such as `https://kemu2.aben.io/`.

- Do not hard-code `/Subject2/`, `/`, or another absolute asset base into the production Vite config.
- Built CSS/JS/font/image references emitted by Vite must remain relative to the deployed `index.html`.
- Playwright production preview must exercise the build from the server root; it must not depend on the historical `/Subject2/` preview path.
- Keep `tests/vite-base.test.ts` as the regression lock for this portability requirement.
- If client-side routes are introduced later, re-evaluate deep-link handling separately; do not solve routing by reverting static asset URLs to a repository-specific absolute prefix.


## Coach mode / Golden Driver

`src/coach/coachController.ts` owns the deterministic low-level coach control loop. Coach driving is a control source, not a second physics engine or a privileged scoring mode.

- Coach mode must drive through `stepVehiclePhysics`, the normal collision pipeline and the existing Subject 2/3 judges. Never teleport the car, bypass collision response, suppress infractions or synthesize completion.
- Coach mode may set ordinary driver controls and safety state (steering, pedals, gear, parking brake, indicators, belt, lights) exactly as a human could. Course state machines remain authoritative for success/failure.
- A user takeover must stop coach commands immediately and restore the normal keyboard/wheel input path without remounting the driving world or resetting the vehicle pose.
- `src/coach/subject2Coach.ts` owns Subject 2 demonstration plans. Plans should reuse canonical course geometry rather than hand-copying unrelated coordinates.
- New supported projects require deterministic physics-integrated regression coverage that runs the real coach controller, real vehicle physics and real project judge and proves completion without infractions.
- Keep coach/golden-driver behavior deterministic so it can later serve as CI regression coverage for physics, geometry and judging changes.
- Continuous Subject 2 coach routing must use `subject2ExamLayout.ts` transforms when added; do not reuse standalone-local waypoints directly in world space.
