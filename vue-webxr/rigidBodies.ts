import type { Object3D, Scene } from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'

/**
 * Copy the pose of every <RigidBody> from @tresjs/rapier to its group, once per frame.
 *
 * @tresjs/rapier does this itself, but only from TresJS's useLoop(), which runs on
 * window.requestAnimationFrame and stops inside an immersive session. Without this, a
 * <RigidBody> that was not registered with useGrabbable() (for example one added to a
 * v-for list later) keeps falling in the physics world but stays frozen on screen.
 *
 * @tresjs/rapier stores the group's uuid in each body's userData, which is how the
 * group is found. Bodies the starter manages itself (grabbables) are skipped: the
 * registry copies those and leaves held ones to the hand code.
 */
export function createRigidBodySync(world: RAPIER.World, scene: Scene) {
  const groups = new Map<string, Object3D>()

  function groupFor(uuid: string): Object3D | undefined {
    const cached = groups.get(uuid)
    // A group removed from the scene (its v-for item was deleted) is looked up again
    if (cached?.parent) return cached
    groups.delete(uuid)
    const found = scene.getObjectByProperty('uuid', uuid)
    if (found) groups.set(uuid, found)
    return found
  }

  /** @param skip handles of bodies that something else keeps in sync */
  function sync(skip: Set<number>) {
    world.forEachRigidBody((body) => {
      if (body.isFixed() || body.isSleeping() || skip.has(body.handle)) return
      const uuid = (body.userData as { uuid?: string } | undefined)?.uuid
      if (!uuid) return
      const group = groupFor(uuid)
      if (!group) return
      const t = body.translation()
      const r = body.rotation()
      group.position.set(t.x, t.y, t.z)
      group.quaternion.set(r.x, r.y, r.z, r.w)
    })
    // Forget groups whose body is gone
    if (groups.size > world.bodies.len()) {
      for (const [uuid, group] of groups) if (!group.parent) groups.delete(uuid)
    }
  }

  return { sync }
}
