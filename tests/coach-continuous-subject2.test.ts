import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createCoachRuntime,
  stepCoachController,
} from '../src/coach/coachController'
import {
  subject2CoachPlan,
  subject2ContinuousCoachPlan,
} from '../src/coach/subject2Coach'
import { stepVehiclePhysics } from '../src/sim/vehiclePhysics'
import {
  SUBJECT2_EXAM_ENTRY_CAPTURE_METERS,
  SUBJECT2_EXAM_PLACEMENTS,
  subject2ExamDistanceToStart,
  subject2ExamSequence,
  subject2ExamTransitions,
} from '../src/subject2/subject2ExamLayout'
import { localPointToWorld } from '../src/subject2/courseTransform'
import type { Subject2ProjectId } from '../src/subject2/courseStartPoses'

function physicsVehicle(pose: { x: number; z: number; heading: number }) {
  return {
    ...pose,
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
}

for (const automatic of [false, true]) {
  test(`${automatic ? 'C2' : 'C1'} continuous coach builds a world-space plan for every project`, () => {
    for (const project of subject2ExamSequence(automatic)) {
      const localPlan = subject2CoachPlan(project)
      const worldPlan = subject2ContinuousCoachPlan(project, true, automatic)
      assert.ok(localPlan, `${project} local plan`)
      assert.ok(worldPlan, `${project} world plan`)
      assert.equal(worldPlan.id, `continuous:${project}`)
      assert.equal(worldPlan.waypoints.length, localPlan.waypoints.length)

      for (const index of [0, Math.floor(localPlan.waypoints.length / 2), localPlan.waypoints.length - 1]) {
        const local = localPlan.waypoints[index]
        const world = worldPlan.waypoints[index]
        const expected = localPointToWorld(
          local,
          SUBJECT2_EXAM_PLACEMENTS[project],
        )
        assert.ok(Math.abs(world.x - expected.x) < 1e-9)
        assert.ok(Math.abs(world.z - expected.z) < 1e-9)
        assert.equal(world.gear, local.gear)
        assert.equal(world.pathCurvaturePerMeter, local.pathCurvaturePerMeter)
      }
    }
  })

  test(`${automatic ? 'C2' : 'C1'} continuous coach drives every connector into the next entry capture zone`, () => {
    for (const transition of subject2ExamTransitions(automatic)) {
      const plan = subject2ContinuousCoachPlan(
        transition.to,
        false,
        automatic,
      )
      assert.ok(plan, `${transition.from} -> ${transition.to} plan`)
      assert.equal(
        plan.id,
        `continuous-transition:${transition.from}:${transition.to}`,
      )

      const vehicle = physicsVehicle(transition.start)
      let runtime = createCoachRuntime()
      const dt = 0.02

      for (let frame = 0; frame < 12_000 && !runtime.completed; frame++) {
        const step = stepCoachController(
          plan,
          vehicle,
          runtime,
          dt,
          automatic,
        )
        runtime = step.runtime
        vehicle.gear = step.command.gear
        vehicle.engineOn = step.command.engineOn
        vehicle.handbrake = step.command.handbrake

        const physics = stepVehiclePhysics(vehicle, {
          throttle: step.command.throttle,
          brake: step.command.brake,
          clutch: step.command.clutch,
          steer: 0,
          steeringWheelTarget: step.command.steeringWheelTarget,
        }, dt, {
          automatic,
          grade: 0,
        })
        assert.equal(
          physics.stalled,
          false,
          `${transition.from} -> ${transition.to} must not stall`,
        )
      }

      assert.equal(
        runtime.completed,
        true,
        JSON.stringify({
          transition,
          runtime,
          vehicle: {
            x: vehicle.x,
            z: vehicle.z,
            heading: vehicle.heading,
            speed: vehicle.speed,
          },
        }),
      )
      assert.ok(
        subject2ExamDistanceToStart(transition.to, vehicle) <=
          SUBJECT2_EXAM_ENTRY_CAPTURE_METERS,
        `${transition.from} -> ${transition.to} should finish inside entry capture radius`,
      )
    }
  })
}

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('continuous Subject 2 exposes coach takeover and keeps it active across project changes', () => {
  assert.match(app, /subject2ContinuousCoachPlan\(/)
  assert.match(app, /combinedExam \|\| subject2CoachSupported/)
  assert.match(app, /if \(!combinedExam\) setCoachActive\(false\)/)
  assert.match(app, /activeCoachPlanId/)
  assert.match(app, /SUBJECT2_EXAM_ENTRY_CAPTURE_METERS/)
  assert.doesNotMatch(app, /activeEntryDistance <= 6/)
})
