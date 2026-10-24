import type RAPIER from '@dimforge/rapier3d-compat'
import { XR_CONFIG } from './config'

export type Rapier = typeof RAPIER

export interface Physics {
  rapier: Rapier
  world: RAPIER.World
  /** Length of one physics step (s) */
  readonly fixedDelta: number
  /**
   * Advance the simulation by `delta` seconds of real time, in fixed-size steps.
   *
   * @returns the number of fixed steps taken this frame (may be 0)
   */
  advance(delta: number): number
}

/** The parts of @tresjs/rapier's useRapierContext() used here */
export interface RapierContext {
  rapier: Rapier
  world: RAPIER.World
  step: (timestep?: number) => void
}

/**
 * Wrap the world that @tresjs/rapier's <Physics> created.
 *
 * Use the Rapier module that came with that world, never a separately imported one:
 * @tresjs/rapier brings its own copy of @dimforge/rapier3d-compat, and objects from two
 * copies of the WASM module cannot be mixed.
 *
 * The starter steps it, not @tresjs/rapier: <Physics> steps the world from TresJS's
 * useLoop(), which runs on window.requestAnimationFrame and stops inside an immersive
 * session (measured on Quest 3). The starter's loop runs
 * on renderer.setAnimationLoop(), which keeps going in XR.
 *
 * The world is stepped at a fixed rate (XR_CONFIG.physicsHz) with an accumulator, so a
 * box takes the same time to fall at 72, 90 or 120 Hz.
 */
export function createPhysics(ctx: RapierContext): Physics {
  const fixedDelta = 1 / XR_CONFIG.physicsHz
  let accumulator = 0

  return {
    rapier: ctx.rapier,
    world: ctx.world,
    fixedDelta,
    advance(delta) {
      // Clamp the frame time. After a hitch (tab switch, headset removed) we would
      // otherwise try to catch up on seconds of simulation in a single frame
      accumulator += Math.min(Math.max(delta, 0), 0.25)
      let steps = 0
      while (accumulator >= fixedDelta && steps < XR_CONFIG.maxSubSteps) {
        ctx.step(fixedDelta)
        accumulator -= fixedDelta
        steps++
      }
      // Still behind after the maximum number of steps: drop the backlog
      if (steps === XR_CONFIG.maxSubSteps) accumulator = 0
      return steps
    },
  }
}
