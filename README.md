# vue-webxr-starter

A starter kit for mixed reality on the web with **Vue**, **[TresJS](https://tresjs.org)** and **Three.js**.
Open a page in the headset browser, press **START AR**, and a box falls onto your real desk. Pick it up with your hands.

Built for **Meta Quest 3** and **Android XR**. No app store, no native SDK: just a web page.

[日本語の README はこちら](./README.ja.md)

## What you get

| Feature | What it does |
| --- | --- |
| Passthrough AR / VR | START AR and ENTER VR buttons. The background is transparent in passthrough |
| Physics | [Rapier](https://rapier.rs) with gravity and collisions, stepped at a fixed rate so it behaves the same at 72, 90 and 120 Hz |
| Bounding box colliders | Any mesh or model gets a box collider fitted to its bounds, with no shape to write by hand |
| Plane detection | Real desks and floors become colliders, drawn as translucent green, so objects land on your actual desk |
| Floor detection | Finds the real floor height even when the runtime puts the origin at eye level |
| Grab with hands or controllers | Pinch an object with your fingertips (or pull the trigger with a controller touching it) to grab it. It follows your hand and turns with your wrist |
| Two-hand scaling | Pinch the held object with your other hand too, then move your hands apart or together to scale and rotate it |
| Drop and throw | Let go gently and the object drops onto the desk or the floor. Swing and let go to throw it along your hand's path |
| Add a box (example) | Pinch once in empty space to drop a new box 40 cm in front of your eyes |
| Reset | Pinch twice in empty space (or press A / X) to bring objects to where you are looking: onto the desk or floor your gaze meets, or 60 cm ahead if it meets nothing. They wait for the desks to be detected before falling. Boxes added by pinching are removed |
| Gaze reticle | A reticle shows where you are looking, and the object it is right on gets a yellow frame. Toggle it inside AR by pinching three times in empty space, or with B / Y |
| Leave the session | Pinch five times in empty space to leave AR / VR and return to the page |
| Quest menu gesture | Pinching with your palm turned to your face opens the Quest menu. Such pinches are not counted, so they do not add a box or reset the scene |
| Hand occlusion | In AR, hand and controller models only hide what is behind them, so you see your real hands. Switch to drawn models on the page before entering AR |

The reusable part is the **`vue-webxr/` folder**. The green box is only an example, in `examples/green-box/`.

## Use it in your own project

`vue-webxr/` is a self-contained library folder. To use it elsewhere:

1. Copy `vue-webxr/` into your project (or add it as a local dependency: `pnpm add link:../vue-webxr-starter/vue-webxr`).
2. Install the peer dependencies: `pnpm add vue three @tresjs/core @tresjs/rapier @dimforge/rapier3d-compat`.
3. Register the TresJS template options in `vite.config.ts`: `vue({ ...templateCompilerOptions })` from `@tresjs/core`.
4. If you copied the folder rather than linking it, add an alias so imports read `from 'vue-webxr'` (see `vite.config.ts` and `tsconfig.app.json` here).

Then put `<XRCanvas>` on a page and call `useGrabbable()` on anything you want to pick up.

## Quick start

You need [Node.js](https://nodejs.org) 20 or later and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/XRaft-labs/vue-webxr-starter.git
cd vue-webxr-starter
pnpm install
```

Before the first run on **Quest 3**, scan your room so the headset knows where your desk is:
**Settings > Physical space > Space setup**, and register your desk as a desk.
Without a scan everything still works, but objects fall to the floor instead of landing on the desk.

Then pick one of the ways below to open the page in the headset.

### A. USB cable (recommended for development)

WebXR only runs on HTTPS or on `localhost`. Over USB, `adb reverse` makes the headset see your
computer as `localhost`, so plain HTTP works: no certificate, no shared Wi-Fi.

1. Install `adb` ([Android platform-tools](https://developer.android.com/tools/releases/platform-tools)).
   On macOS: `brew install --cask android-platform-tools`.
2. Enable developer mode on the headset and connect it with a USB cable. Accept the "Allow USB debugging" prompt inside the headset.
3. Run:

```bash
pnpm dev:usb      # dev server on http://localhost:5173
pnpm device       # in another terminal: forwards the port and opens the page in the headset
```

For Android XR, use `./scripts/open-on-device.sh --chrome` to open it in Chrome.
On Windows, run the two `adb` commands from the script by hand:

```bash
adb reverse tcp:5173 tcp:5173
adb shell am start -a android.intent.action.VIEW -d "http://localhost:5173/" com.oculus.browser
```

### B. Same Wi-Fi

```bash
pnpm dev
```

This serves HTTPS with a local certificate ([mkcert](https://github.com/FiloSottile/mkcert)).
Open the `Network` address it prints (`https://192.168.x.x:5173`) in the headset and accept the certificate warning.

### C. A tunnel

To open the page from anywhere, put a temporary public HTTPS URL in front of the dev server:

```bash
pnpm dev:usb
cloudflared tunnel --url http://localhost:5173    # Cloudflare Tunnel, no account needed
# or: ngrok http 5173
```

Anyone with the URL can open the page while the tunnel runs.

### D. Deploy

```bash
pnpm build
```

Upload `dist/` to any static host with HTTPS (Netlify, Vercel, Cloudflare Pages, GitHub Pages...).
A deployed page is public: restrict access (for example by IP address) if it is not meant for everyone.

## Make it yours

The example scene is `examples/green-box/GreenBoxes.vue`, a list of `GreenBox.vue`. The shortest form of a grabbable object looks like this:

```vue
<script setup lang="ts">
import { shallowRef } from 'vue'
import type { Mesh } from 'three'
import { useGrabbable } from 'vue-webxr'

const box = shallowRef<Mesh>()
useGrabbable(box, { mass: 0.3 })
</script>

<template>
  <TresAmbientLight :intensity="0.8" />
  <TresDirectionalLight :position="[1, 3, 2]" :intensity="2" />

  <TresMesh ref="box" :position="[0, 1.2, -0.6]">
    <TresBoxGeometry :args="[0.1, 0.1, 0.1]" />
    <TresMeshStandardMaterial color="#3fae7c" />
  </TresMesh>
</template>
```

Copy the example folder, change the mesh, and put your component inside `<XRCanvas>` in its `App.vue`. To run another example, point the `<script>` in `index.html` at its `main.ts`.
`useGrabbable()` works with anything that is an `Object3D`, including models loaded from glTF / GLB files.

Things to know:

- **Units are meters.** `y` is up. The origin is on the floor where the session started, and `-z` is the direction you were facing.
- **Physics owns the pose of grabbable objects.** Give them a constant starting `:position`. Binding reactive state to `:position` makes Vue overwrite the physics pose on re-render.
- **Objects are re-placed every time a session starts**, where you are looking (see Reset above). With several objects, the first goes there and the others keep their authored offsets from it. Call `resetScene()` to do the same at any time.
- **React to a single pinch in empty space with `useEmptyPinch()`**, which gets the head pose (the example drops a box there), and **to a reset with `useSceneReset()`** (the example removes the added boxes). Two and three pinches stay reserved for reset and the reticle.
- **Use `useXRFrame()` for per-frame code**, not TresJS's `useLoop()`. Inside an immersive session only `renderer.setAnimationLoop()` keeps running, and the starter drives the frame from there.
- **Every tunable value is in `vue-webxr/config.ts`**: physics rate, grab distance, scale limits, plane overlay colour, requested features and more.

## Project structure

```
vue-webxr/                   The library. Copy this folder to reuse it
  package.json               Name and peer dependencies, for use as a local dependency
  index.ts                   Public API: import from 'vue-webxr'
  XRCanvas.vue               <TresCanvas> plus <Physics> (@tresjs/rapier) plus WebXR
  XRPhysicsBridge.vue        Hands the <Physics> world to the XR runtime
  runtime.ts                 Frame loop and session lifecycle
  session.ts                 AR / VR buttons, closing sessions on page unload
  physics.ts                 Steps the <Physics> world at a fixed rate from the XR loop
  grabbables.ts              Bounding box colliders, scaling, physics-to-mesh sync
  rigidBodies.ts             Copies every <RigidBody> pose to its group in XR
  floor.ts                   Floor collider and real floor height
  planes.ts                  Plane detection to desk / floor colliders and green overlays
  interaction.ts             Grab, follow, two-hand scale, drop and throw
  reset.ts                   Re-place objects where the viewer looks, wait for planes
  gaze.ts                    Head gaze, reticle and the selection frame
  inputModels.ts             Hand and controller models: occlusion mask or visible
  composables.ts             useGrabbable(), useXRFrame(), useEmptyPinch(), useSceneReset()
  config.ts                  All tunable values
examples/
  green-box/                 Grabbable green boxes
    App.vue                  The page: <XRCanvas> with the scene inside
    GreenBoxes.vue           Lights and the list of boxes. A pinch adds one
    GreenBox.vue             One box
    main.ts                  Entry point (loaded by index.html)
scripts/open-on-device.sh    adb reverse + open the page in the headset
```

## Debugging

- Connect the headset over USB and open `chrome://inspect` in Chrome on your computer to see the console of the headset browser.
- In development, `window.__xrStarter` exposes the internals (physics, planes, floor, grabbables) for the console.
- `xrState` (exported from `vue-webxr`) holds the session mode, input type, granted features and number of detected planes, ready for a debug panel.
- Detected surfaces are drawn as translucent green overlays. Change the colour with `planeColor` / `planeOpacity`, or turn them off with `showPlanes`, in `vue-webxr/config.ts`.

## Device support

| Device | Browser | AR (passthrough) | Hands | Plane detection |
| --- | --- | --- | --- | --- |
| Meta Quest 3 / 3S | Quest Browser | Yes | Yes | Yes (after Space setup) |
| Android XR | Chrome | Yes | Yes | Depends on the device |
| Apple Vision Pro | Safari | No (VR only) | Pinch with your hand at the object | No |

Meta Quest 3 is the primary target. Android XR and Vision Pro follow the same WebXR standard and are expected to work as listed, but have not been verified on hardware yet. Reports are welcome.
Features are requested as optional, so a missing feature never blocks the session.

## Tech stack

Vue 3, TresJS 5, Three.js r172, Rapier 0.20 through @tresjs/rapier 1.2, Vite, TypeScript.

Inside an immersive session TresJS's own loop does not run (it is built on `window.requestAnimationFrame`), so @tresjs/rapier neither steps nor syncs there. The starter does both from its XR loop. On Quest 3, `window.requestAnimationFrame` was called 0 times in 2 seconds inside a session, against 180 XR frames.

## License

[MIT](./LICENSE)
