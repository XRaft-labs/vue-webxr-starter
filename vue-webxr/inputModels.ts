import { MeshBasicMaterial, type Material, type Mesh, type Object3D } from 'three'

/**
 * How hand and controller models are drawn.
 *
 * - 'occlusion' (default in AR): the model writes depth but no colour. You see your real
 *   hand or controller in the passthrough, and virtual objects behind it are hidden, as
 *   they would be in reality. Without this, a box held behind your hand is drawn on top
 *   of it and looks like it floats in front of your fingers.
 * - 'visible': the models are drawn normally. Useful to check what tracking sees.
 *
 * In VR the models are always drawn: there is no passthrough to show through the mask,
 * only the empty background.
 */
export type InputModelStyle = 'occlusion' | 'visible'

/** Writes depth only. Shared by every masked mesh */
const occlusionMaterial = new MeshBasicMaterial({ colorWrite: false })

interface Saved {
  material: Material | Material[]
  renderOrder: number
}

export function createInputModels() {
  /** Model roots handed over by the Three.js model factories once their GLB has loaded */
  const models = new Set<Object3D>()
  let current: { style: InputModelStyle; passthrough: boolean } = { style: 'occlusion', passthrough: false }

  function apply(root: Object3D) {
    const mask = current.passthrough && current.style === 'occlusion'
    root.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      const saved = mesh.userData.__inputModel as Saved | undefined
      if (mask) {
        if (!saved) mesh.userData.__inputModel = { material: mesh.material, renderOrder: mesh.renderOrder }
        mesh.material = occlusionMaterial
        // Draw the mask before everything else, so its depth hides what is behind it
        mesh.renderOrder = -1
      } else if (saved) {
        mesh.material = saved.material
        mesh.renderOrder = saved.renderOrder
        delete mesh.userData.__inputModel
      }
    })
  }

  return {
    /** Pass to XRHandModelFactory / XRControllerModelFactory as their onLoad callback */
    onModelLoaded(root: Object3D) {
      models.add(root)
      apply(root)
    },
    /** Call when the style setting or the session mode changes */
    setStyle(style: InputModelStyle, passthrough: boolean) {
      current = { style, passthrough }
      for (const root of models) apply(root)
    },
  }
}
