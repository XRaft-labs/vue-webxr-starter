import type { WebGLRenderer } from 'three'
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js'
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'
import { XR_CONFIG } from './config'

/** Marks the DOM this module adds to <body>, so it can be removed again */
const MARK = 'data-xr-starter'

/**
 * Add the "START AR" and "ENTER VR" buttons from Three.js.
 *
 * The buttons request the session and its features. Features are passed as
 * optionalFeatures: a device that does not support one still enters the session.
 * Check `session.enabledFeatures` to see what was actually granted.
 */
export function createXRButtons(renderer: WebGLRenderer) {
  removeXRButtons()

  // ARButton creates a hidden overlay element for 'dom-overlay' every time it is called
  // unless it is given one. Pass our own so it can be cleaned up with the buttons
  const overlay = document.createElement('div')
  overlay.style.display = 'none'
  overlay.setAttribute(MARK, '')
  document.body.appendChild(overlay)

  const ar = ARButton.createButton(renderer, {
    optionalFeatures: [...XR_CONFIG.arFeatures, 'dom-overlay'],
    domOverlay: { root: overlay },
  })
  ar.style.bottom = '76px'
  ar.setAttribute(MARK, '')
  document.body.appendChild(ar)

  const vr = VRButton.createButton(renderer, { optionalFeatures: [...XR_CONFIG.vrFeatures] })
  vr.style.bottom = '20px'
  vr.setAttribute(MARK, '')
  document.body.appendChild(vr)
}

export function removeXRButtons() {
  for (const el of Array.from(document.querySelectorAll(`[${MARK}]`))) el.remove()
}

/**
 * Close the immersive session when the page goes away.
 *
 * If the page unloads while a session is running (a full reload from Vite during
 * development, for example), Quest Browser keeps the orphaned session and shows a
 * "an immersive experience is still running" bar that cannot be dismissed. Ending the
 * session first avoids that.
 *
 * During development, Vite full reloads are also postponed until the session ends.
 *
 * @returns `dispose()` to remove the listeners, and `flushReload()` to call on session end
 */
export function guardSessionLifetime(getSession: () => XRSession | null) {
  const end = () => {
    getSession()?.end().catch(() => {})
  }
  window.addEventListener('pagehide', end)
  window.addEventListener('beforeunload', end)

  let reloadPending = false
  if (import.meta.hot) {
    // Vite only reloads when payload.path matches the current page. Pointing it elsewhere
    // cancels the reload while immersed. Relies on Vite client internals (checked on 8.x);
    // if that ever changes, the pagehide handler above still prevents the stuck session.
    import.meta.hot.on('vite:beforeFullReload', (payload: { path?: string }) => {
      if (!getSession()) return
      payload.path = '__xr-session-active__.html'
      reloadPending = true
      console.info('[xr] Reload postponed until the immersive session ends')
    })
  }

  return {
    dispose() {
      window.removeEventListener('pagehide', end)
      window.removeEventListener('beforeunload', end)
    },
    /** Perform a reload that was postponed during the session */
    flushReload() {
      if (!reloadPending) return
      reloadPending = false
      location.reload()
    },
  }
}
