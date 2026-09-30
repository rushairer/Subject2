import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCoachRuntime,
  stepCoachController,
} from '../src/coach/coachController'
import { subject2CoachPlan } from '../src/coach/subject2Coach'
import {
  CURVE_CENTERLINE,
  createCurveRuntime,
  updateCurveDriving,
} from '../src/subject2/CurveDrivingCourse'
import {
  createRightAngleRuntime,
  updateRightAngle,
} from '../src/subject2/RightAngleCourse'
import {
  createReverseParkingRuntime,
  updateReverseParking,
} from '../src/subject2/ReverseParkingCourse'
import {
  createSideParkingRuntime,
  updateSideParking,
} from '../src/subject2/SideParkingCourse'
import {
  createSlopeRuntime,
  getSlopePose,
  updateSlopeStart,
} from '../src/subject2/SlopeStartCourse'
import { subject2StartPose } from '../src/subject2/courseStartPoses'
import { stepVehiclePhysics } from '../src/sim/vehiclePhysics'
import { wheelContactFootprints } from '../src/sim/wheelContact'

function curveHeading(index: number) {
  const current = CURVE_CENTERLINE[index]
  const next = CURVE_CENTERLINE[Math.min(index + 1, CURVE_CENTERLINE.length - 1)]
  return Math.atan2(next.x - current.x, -(next.z - current.z))
}

test('coach curve plan drives the real physics through the real judge without penalties', () => {
  const plan = subject2CoachPlan('curve-driving')
  assert.ok(plan)

  const start = CURVE_CENTERLINE[0]
  const vehicle = {
    x: start.x,
    z: start.z,
    heading: curveHeading(0),
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 1,
    engineOn: true,
    engineRpm: 820,
    stallTimer: 0,
    handbrake: false,
  }

  let coach = createCoachRuntime()
  let course = createCurveRuntime()
  const infractions: string[] = []
  const dt = 0.02

  for (let frame = 0; frame < 5000 && !course.completed; frame++) {
    const next = stepCoachController(plan, vehicle, coach, dt, true)
    coach = next.runtime
    vehicle.gear = next.command.gear
    vehicle.engineOn = next.command.engineOn
    vehicle.handbrake = next.command.handbrake

    stepVehiclePhysics(vehicle, {
      throttle: next.command.throttle,
      brake: next.command.brake,
      clutch: next.command.clutch,
      steer: 0,
      steeringWheelTarget: next.command.steeringWheelTarget,
    }, dt, {
      automatic: true,
      grade: 0,
    })

    const judged = updateCurveDriving(vehicle, course, dt)
    course = judged.runtime
    infractions.push(...judged.infractions.map(item => item.id))
  }

  assert.equal(course.completed, true)
  assert.deepEqual(infractions, [])
})



test('coach right-angle plan drives the real physics through the real judge without penalties', () => {
  const plan = subject2CoachPlan('right-angle')
  assert.ok(plan)

  const start = subject2StartPose('right-angle')
  assert.ok(start)
  const vehicle = {
    x: start.x,
    z: start.z,
    heading: start.heading,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 1,
    engineOn: true,
    engineRpm: 820,
    stallTimer: 0,
    handbrake: false,
    leftIndicator: false,
    rightIndicator: false,
  }

  let coach = createCoachRuntime()
  let course = createRightAngleRuntime()
  const infractions: string[] = []
  let firstInfraction: {
    frame: number
    x: number
    z: number
    heading: number
    steering: number
    phase: string
    ids: string[]
    wheels: ReturnType<typeof wheelContactFootprints>
  } | null = null
  const dt = 0.02

  for (let frame = 0; frame < 5000 && !course.completed; frame++) {
    const next = stepCoachController(plan, vehicle, coach, dt, true)
    coach = next.runtime
    vehicle.gear = next.command.gear
    vehicle.engineOn = next.command.engineOn
    vehicle.handbrake = next.command.handbrake
    vehicle.leftIndicator = next.command.leftIndicator
    vehicle.rightIndicator = next.command.rightIndicator

    stepVehiclePhysics(vehicle, {
      throttle: next.command.throttle,
      brake: next.command.brake,
      clutch: next.command.clutch,
      steer: 0,
      steeringWheelTarget: next.command.steeringWheelTarget,
    }, dt, {
      automatic: true,
      grade: 0,
    })

    const judged = updateRightAngle(vehicle, course, dt)
    course = judged.runtime
    if (!firstInfraction && judged.infractions.length > 0) {
      firstInfraction = {
        frame,
        x: vehicle.x,
        z: vehicle.z,
        heading: vehicle.heading,
        steering: vehicle.steering,
        phase: course.phase,
        ids: judged.infractions.map(item => item.id),
        wheels: wheelContactFootprints(vehicle),
      }
    }
    infractions.push(...judged.infractions.map(item => item.id))
  }

  assert.equal(
    course.completed,
    true,
    JSON.stringify({
      vehicle: { x: vehicle.x, z: vehicle.z, heading: vehicle.heading, speed: vehicle.speed },
      coach,
      course,
      infractions: [...new Set(infractions)],
    }),
  )
  assert.equal(infractions.length, 0, JSON.stringify(firstInfraction))
})



test('coach reverse-parking plan completes both parking passes through real physics without penalties', () => {
  const plan = subject2CoachPlan('reverse-parking')
  assert.ok(plan)

  const start = subject2StartPose('reverse-parking')
  assert.ok(start)
  const vehicle = {
    x: start.x,
    z: start.z,
    heading: start.heading,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 1,
    engineOn: true,
    engineRpm: 820,
    stallTimer: 0,
    handbrake: false,
  }

  let coach = createCoachRuntime()
  let course = createReverseParkingRuntime()
  const infractions: string[] = []
  const parkedPoses: Array<{
    phase: 'first-parked' | 'second-parked'
    x: number
    z: number
    heading: number
  }> = []
  const checkpoints: Array<{
    waypoint: number
    x: number
    z: number
    heading: number
    steering: number
    speed: number
  }> = []
  let lastWaypoint = -1
  let firstInfraction: {
    frame: number
    x: number
    z: number
    heading: number
    steering: number
    gear: number
    waypoint: number
    phase: string
    ids: string[]
  } | null = null
  const dt = 0.02

  for (let frame = 0; frame < 16000 && !course.completed; frame++) {
    const next = stepCoachController(plan, vehicle, coach, dt, true)
    coach = next.runtime
    if (
      coach.waypointIndex !== lastWaypoint &&
      (
        (coach.waypointIndex >= 7 && coach.waypointIndex <= 16) ||
        (coach.waypointIndex >= 110 && coach.waypointIndex <= 124) ||
        (coach.waypointIndex >= 160 && coach.waypointIndex <= 180)
      )
    ) {
      checkpoints.push({
        waypoint: coach.waypointIndex,
        x: vehicle.x,
        z: vehicle.z,
        heading: vehicle.heading,
        steering: vehicle.steering,
        speed: vehicle.speed,
      })
    }
    lastWaypoint = coach.waypointIndex
    vehicle.gear = next.command.gear
    vehicle.engineOn = next.command.engineOn
    vehicle.handbrake = next.command.handbrake

    stepVehiclePhysics(vehicle, {
      throttle: next.command.throttle,
      brake: next.command.brake,
      clutch: next.command.clutch,
      steer: 0,
      steeringWheelTarget: next.command.steeringWheelTarget,
    }, dt, {
      automatic: true,
      grade: 0,
    })

    const previousPhase = course.phase
    const judged = updateReverseParking(vehicle, course, dt)
    course = judged.runtime
    if (
      course.phase !== previousPhase &&
      (course.phase === 'first-parked' || course.phase === 'second-parked')
    ) {
      parkedPoses.push({
        phase: course.phase,
        x: vehicle.x,
        z: vehicle.z,
        heading: vehicle.heading,
      })
    }
    if (!firstInfraction && judged.infractions.length > 0) {
      firstInfraction = {
        frame,
        x: vehicle.x,
        z: vehicle.z,
        heading: vehicle.heading,
        steering: vehicle.steering,
        gear: vehicle.gear,
        waypoint: coach.waypointIndex,
        phase: course.phase,
        ids: judged.infractions.map(item => item.id),
      }
    }
    infractions.push(...judged.infractions.map(item => item.id))
  }

  assert.equal(
    course.completed,
    true,
    JSON.stringify({
      vehicle: {
        x: vehicle.x,
        z: vehicle.z,
        heading: vehicle.heading,
        speed: vehicle.speed,
        gear: vehicle.gear,
      },
      coach,
      currentTarget: plan.waypoints[coach.waypointIndex],
      planLength: plan.waypoints.length,
      course,
      firstInfraction,
      checkpoints,
      infractions: [...new Set(infractions)],
    }),
  )
  assert.equal(infractions.length, 0, JSON.stringify(firstInfraction))
  assert.equal(parkedPoses.length, 2, JSON.stringify(parkedPoses))
  for (const parked of parkedPoses) {
    // Bay width is 2.30 m vs a 1.80 m body. Keep the coach comfortably away
    // from the 2 cm legality edge instead of accepting a barely-inside pose.
    assert.ok(
      Math.abs(parked.z) <= 0.14,
      `${parked.phase} should retain >=11 cm lateral body margin: ${JSON.stringify(parked)}`,
    )
    assert.ok(
      parked.x >= 5.72 && parked.x <= 6.08,
      `${parked.phase} should stop near the longitudinal bay center: ${JSON.stringify(parked)}`,
    )
    const expectedHeading = parked.phase === 'first-parked'
      ? Math.PI * 1.5
      : -Math.PI / 2
    const headingError = Math.atan2(
      Math.sin(parked.heading - expectedHeading),
      Math.cos(parked.heading - expectedHeading),
    )
    assert.ok(
      Math.abs(headingError) <= 0.08,
      `${parked.phase} should be parallel to the bay: ${JSON.stringify(parked)}`,
    )
  }
})



test('coach second reverse-parking pass keeps margin across frame timing and small pose errors', () => {
  const plan = subject2CoachPlan('reverse-parking')
  assert.ok(plan)

  const secondTurnIndex = plan.waypoints.findIndex(
    waypoint => waypoint.label === '第二次倒库 · 精确对中后进入复合转向',
  )
  assert.ok(secondTurnIndex > 0)
  const secondTurn = plan.waypoints[secondTurnIndex]!
  assert.ok(Math.abs(secondTurn.x) <= 0.03, JSON.stringify(secondTurn))

  const cases = [
    { dt: 1 / 60, dx: 0, dz: 0, dh: 0 },
    { dt: 1 / 30, dx: 0, dz: 0, dh: 0 },
    { dt: 1 / 60, dx: 0.035, dz: -0.025, dh: 0.008 },
    { dt: 1 / 30, dx: -0.035, dz: 0.025, dh: -0.008 },
  ]

  for (const scenario of cases) {
    const vehicle = {
      x: secondTurn.x + scenario.dx,
      z: secondTurn.z + scenario.dz,
      heading: (secondTurn.headingHoldRadians ?? 0) + scenario.dh,
      speed: 0,
      steering: 0,
      steeringWheelAngle: 0,
      throttle: 0,
      brake: 0,
      clutch: 0,
      gear: -1,
      engineOn: true,
      engineRpm: 820,
      stallTimer: 0,
      handbrake: false,
    }
    let coach = {
      ...createCoachRuntime(),
      waypointIndex: secondTurnIndex,
    }
    let course: ReturnType<typeof createReverseParkingRuntime> = {
      ...createReverseParkingRuntime(),
      phase: 'cross-to-opposite',
      started: true,
      firstControlPassed: true,
      oppositeControlPassed: true,
      elapsed: 25,
    }
    const infractions: string[] = []

    for (
      let frame = 0;
      frame < 5000 && course.phase !== 'second-parked';
      frame++
    ) {
      const next = stepCoachController(
        plan,
        vehicle,
        coach,
        scenario.dt,
        true,
      )
      coach = next.runtime
      vehicle.gear = next.command.gear
      vehicle.engineOn = next.command.engineOn
      vehicle.handbrake = next.command.handbrake

      stepVehiclePhysics(vehicle, {
        throttle: next.command.throttle,
        brake: next.command.brake,
        clutch: next.command.clutch,
        steer: 0,
        steeringWheelTarget: next.command.steeringWheelTarget,
      }, scenario.dt, {
        automatic: true,
        grade: 0,
      })

      const judged = updateReverseParking(
        vehicle,
        course,
        scenario.dt,
      )
      course = judged.runtime
      infractions.push(...judged.infractions.map(item => item.id))
    }

    assert.equal(
      course.phase,
      'second-parked',
      JSON.stringify({ scenario, vehicle, coach, course, infractions }),
    )
    assert.deepEqual(
      infractions,
      [],
      JSON.stringify({ scenario, vehicle, coach, course, infractions }),
    )
    assert.ok(
      Math.abs(vehicle.z) <= 0.15,
      JSON.stringify({ scenario, vehicle }),
    )
    assert.ok(
      vehicle.x >= 5.70 && vehicle.x <= 6.10,
      JSON.stringify({ scenario, vehicle }),
    )
  }
})


test('coach side-parking plan parks and exits through real physics without penalties', () => {
  const plan = subject2CoachPlan('side-parking')
  assert.ok(plan)

  const start = subject2StartPose('side-parking')
  assert.ok(start)
  const vehicle = {
    x: start.x,
    z: start.z,
    heading: start.heading,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 1,
    engineOn: true,
    engineRpm: 820,
    stallTimer: 0,
    handbrake: false,
    leftIndicator: false,
    rightIndicator: false,
  }

  let coach = createCoachRuntime()
  let course = createSideParkingRuntime()
  const phases = new Set<string>()
  const infractions: string[] = []
  let firstInfraction: {
    frame: number
    x: number
    z: number
    heading: number
    steering: number
    gear: number
    waypoint: number
    phase: string
    ids: string[]
  } | null = null
  const dt = 0.02

  for (let frame = 0; frame < 12000 && !course.completed; frame++) {
    const next = stepCoachController(plan, vehicle, coach, dt, true)
    coach = next.runtime
    vehicle.gear = next.command.gear
    vehicle.engineOn = next.command.engineOn
    vehicle.handbrake = next.command.handbrake
    vehicle.leftIndicator = next.command.leftIndicator
    vehicle.rightIndicator = next.command.rightIndicator

    stepVehiclePhysics(vehicle, {
      throttle: next.command.throttle,
      brake: next.command.brake,
      clutch: next.command.clutch,
      steer: 0,
      steeringWheelTarget: next.command.steeringWheelTarget,
    }, dt, {
      automatic: true,
      grade: 0,
    })

    const judged = updateSideParking(vehicle, course, dt)
    course = judged.runtime
    phases.add(course.phase)
    if (!firstInfraction && judged.infractions.length > 0) {
      firstInfraction = {
        frame,
        x: vehicle.x,
        z: vehicle.z,
        heading: vehicle.heading,
        steering: vehicle.steering,
        gear: vehicle.gear,
        waypoint: coach.waypointIndex,
        phase: course.phase,
        ids: judged.infractions.map(item => item.id),
      }
    }
    infractions.push(...judged.infractions.map(item => item.id))
  }

  assert.equal(
    course.completed,
    true,
    JSON.stringify({
      vehicle: {
        x: vehicle.x,
        z: vehicle.z,
        heading: vehicle.heading,
        speed: vehicle.speed,
        gear: vehicle.gear,
      },
      coach,
      currentTarget: plan.waypoints[coach.waypointIndex],
      course,
      phases: [...phases],
      firstInfraction,
      infractions: [...new Set(infractions)],
    }),
  )
  assert.equal(phases.has('parked'), true)
  assert.equal(phases.has('exit'), true)
  assert.equal(infractions.length, 0, JSON.stringify(firstInfraction))
})



test('coach slope plan performs an accurate handbrake stop and zero-rollback start', () => {
  const plan = subject2CoachPlan('slope-start')
  assert.ok(plan)

  const start = subject2StartPose('slope-start')
  assert.ok(start)
  const vehicle = {
    x: start.x,
    z: start.z,
    heading: start.heading,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 1,
    engineOn: true,
    engineRpm: 820,
    stallTimer: 0,
    handbrake: false,
  }

  let coach = createCoachRuntime()
  let course = createSlopeRuntime()
  const phases = new Set<string>()
  const infractions: string[] = []
  let handbrakeObserved = false
  let firstInfraction: {
    frame: number
    x: number
    z: number
    speed: number
    handbrake: boolean
    waypoint: number
    phase: string
    ids: string[]
  } | null = null
  const dt = 0.02

  for (let frame = 0; frame < 12000 && !course.completed; frame++) {
    const next = stepCoachController(plan, vehicle, coach, dt, true)
    coach = next.runtime
    vehicle.gear = next.command.gear
    vehicle.engineOn = next.command.engineOn
    vehicle.handbrake = next.command.handbrake
    handbrakeObserved ||= vehicle.handbrake

    const slope = getSlopePose(vehicle.z)
    stepVehiclePhysics(vehicle, {
      throttle: next.command.throttle,
      brake: next.command.brake,
      clutch: next.command.clutch,
      steer: 0,
      steeringWheelTarget: next.command.steeringWheelTarget,
    }, dt, {
      automatic: true,
      grade: slope.grade,
      gradeHeading: 0,
    })

    const judged = updateSlopeStart(vehicle, course, dt)
    course = judged.runtime
    phases.add(course.phase)
    if (!firstInfraction && judged.infractions.length > 0) {
      firstInfraction = {
        frame,
        x: vehicle.x,
        z: vehicle.z,
        speed: vehicle.speed,
        handbrake: vehicle.handbrake,
        waypoint: coach.waypointIndex,
        phase: course.phase,
        ids: judged.infractions.map(item => item.id),
      }
    }
    infractions.push(...judged.infractions.map(item => item.id))
  }

  assert.equal(
    course.completed,
    true,
    JSON.stringify({
      vehicle: {
        x: vehicle.x,
        z: vehicle.z,
        speed: vehicle.speed,
        handbrake: vehicle.handbrake,
      },
      coach,
      currentTarget: plan.waypoints[coach.waypointIndex],
      course,
      phases: [...phases],
      firstInfraction,
      infractions: [...new Set(infractions)],
    }),
  )
  assert.equal(handbrakeObserved, true)
  assert.equal(phases.has('stopped'), true)
  assert.equal(phases.has('starting'), true)
  assert.equal(infractions.length, 0, JSON.stringify(firstInfraction))
})

test('coach controller only completes after reaching the final waypoint', () => {
  const plan = {
    id: 'straight',
    title: 'straight',
    waypoints: [
      { x: 0, z: -1, targetSpeedMps: 1, gear: 1 as const },
      { x: 0, z: -2, targetSpeedMps: 0, gear: 1 as const, stop: true, holdSeconds: 0.2 },
    ],
  }
  let runtime = createCoachRuntime()

  let result = stepCoachController(plan, {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    gear: 1,
  }, runtime, 0.1, true)
  runtime = result.runtime
  assert.equal(runtime.completed, false)

  result = stepCoachController(plan, {
    x: 0,
    z: -2,
    heading: 0,
    speed: 0,
    gear: 1,
  }, { ...runtime, waypointIndex: 1 }, 0.1, true)
  assert.equal(result.runtime.completed, false)

  result = stepCoachController(plan, {
    x: 0,
    z: -2,
    heading: 0,
    speed: 0,
    gear: 1,
  }, result.runtime, 0.1, true)
  assert.equal(result.runtime.completed, true)
  assert.ok(result.command.brake >= 0.5)
})


test('coach lookahead stops at a stop and gear-change boundary', () => {
  const plan = {
    id: 'gear-boundary',
    title: 'gear boundary',
    lookAheadWaypoints: 4,
    waypoints: [
      { x: 0, z: -1, targetSpeedMps: 0.8, gear: 1 as const },
      { x: 0, z: -2, targetSpeedMps: 0, gear: 1 as const, stop: true, holdSeconds: 0.2 },
      { x: 8, z: -2, targetSpeedMps: 0.6, gear: -1 as const },
    ],
  }

  const result = stepCoachController(plan, {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0.4,
    gear: 1,
  }, createCoachRuntime(), 0.02, true)

  assert.ok(Math.abs(result.command.steeringWheelTarget) < 0.05)
})


test('coach critical waypoint cannot be skipped by projection', () => {
  const plan = {
    id: 'capture-only',
    title: 'capture only',
    waypoints: [
      { x: 0, z: -1, targetSpeedMps: 0.5, gear: 1 as const },
      { x: 0, z: -2, targetSpeedMps: 0.4, gear: 1 as const, arrivalRadiusMeters: 0.1, requireCapture: true },
      { x: 1, z: -3, targetSpeedMps: 0.4, gear: 1 as const },
    ],
  }

  const result = stepCoachController(plan, {
    x: 0,
    z: -2.6,
    heading: 0,
    speed: 0.3,
    gear: 1,
  }, { waypointIndex: 1, holdSeconds: 0, completed: false }, 0.02, true)

  assert.equal(result.runtime.waypointIndex, 1)
})


test('coach curved waypoint advances only after passing inside its tight corridor', () => {
  const plan = {
    id: 'curved-corridor',
    title: 'curved corridor',
    waypoints: [
      { x: 0, z: 0, targetSpeedMps: 0.4, gear: -1 as const, pathCurvaturePerMeter: 0.2 },
      { x: 0.25, z: 0, targetSpeedMps: 0.4, gear: -1 as const, pathCurvaturePerMeter: 0.2, arrivalRadiusMeters: 0.1 },
      { x: 0.5, z: 0, targetSpeedMps: 0.4, gear: -1 as const, pathCurvaturePerMeter: 0.2, arrivalRadiusMeters: 0.1 },
    ],
  }

  const nearPassed = stepCoachController(plan, {
    x: 0.3,
    z: 0.18,
    heading: Math.PI,
    speed: -0.3,
    gear: -1,
  }, { waypointIndex: 1, holdSeconds: 0, completed: false }, 0.02, true)
  assert.equal(nearPassed.runtime.waypointIndex, 2)

  const farPassed = stepCoachController(plan, {
    x: 0.3,
    z: 0.7,
    heading: Math.PI,
    speed: -0.3,
    gear: -1,
  }, { waypointIndex: 1, holdSeconds: 0, completed: false }, 0.02, true)
  assert.equal(farPassed.runtime.waypointIndex, 1)
})


test('coach heading hold corrects lateral error on a reverse straight', () => {
  const plan = {
    id: 'reverse-line-hold',
    title: 'reverse line hold',
    curvatureFeedforwardBlend: 1,
    waypoints: [
      {
        x: -0.3,
        z: 6,
        targetSpeedMps: 0.5,
        gear: -1 as const,
        pathCurvaturePerMeter: 0,
        headingHoldRadians: Math.PI,
      },
    ],
  }

  const eastOfLine = stepCoachController(plan, {
    x: -0.05,
    z: 7,
    heading: Math.PI,
    speed: -0.4,
    gear: -1,
  }, createCoachRuntime(), 0.02, true)

  assert.ok(eastOfLine.command.steeringWheelTarget > 0)
})
