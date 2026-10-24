<script setup lang="ts">
import { XRCanvas, xrState, resetScene } from 'vue-webxr'
import GreenBoxes from './GreenBoxes.vue'
</script>

<template>
  <XRCanvas>
    <!-- A floor grid for VR and the desktop preview. Hidden in AR, where the real floor is visible -->
    <TresGridHelper
      v-if="xrState.mode !== 'ar'"
      :args="[10, 40, '#2e5c8a', '#1a2433']"
      :position="[0, xrState.floorY, 0]"
    />

    <!-- Your scene goes here. Replace the example with your own components -->
    <GreenBoxes />
  </XRCanvas>

  <aside v-if="xrState.mode === 'none'" class="panel">
    <h1>vue-webxr-starter</h1>
    <p>Open this page in the browser of a Meta Quest 3 or an Android XR headset and press <b>START AR</b>.</p>
    <ul>
      <li><b>Pinch</b> the box with your fingertips (or pull the trigger with a controller touching it) to grab it.</li>
      <li><b>Move and twist</b> your hand: the box follows and turns with it.</li>
      <li><b>Pinch with your other hand</b> on the box too, then move your hands apart or together to scale it.</li>
      <li><b>Let go</b> and it falls onto your real desk or the floor. <b>Swing and let go</b> to throw it.</li>
      <li><b>Pinch once</b> in empty space (or pull a trigger away from the boxes) to drop a new box in front of your eyes.</li>
      <li><b>Pinch twice</b> in empty space (or press <b>A / X</b> on a controller) to bring the box to where you are looking. Added boxes are removed.</li>
      <li>The <b>reticle</b> shows where you are looking; the box gets a yellow frame when it is right on it. <b>Pinch three times</b> in empty space (or press <b>B / Y</b>) to turn it on or off.</li>
      <li><b>Pinch five times</b> in empty space to leave AR and come back to this page.</li>
      <li>Recognised desks and floors are shown in translucent green.</li>
    </ul>
    <label class="setting check">
      <input v-model="xrState.reticle" type="checkbox" />
      Show the reticle
    </label>
    <fieldset class="setting">
      <legend>Hands and controllers in AR</legend>
      <label>
        <input v-model="xrState.inputModels" type="radio" value="occlusion" />
        Show my real hands (models hide what is behind them)
      </label>
      <label>
        <input v-model="xrState.inputModels" type="radio" value="visible" />
        Draw hand and controller models
      </label>
    </fieldset>
    <button type="button" class="reset" @click="resetScene">Reset the box</button>
    <p class="note">
      On Quest 3, scan your room first (Settings &gt; Physical space &gt; Space setup) so the box can land on your real desk.
    </p>
    <p class="note">Status: {{ xrState.ready ? 'ready' : 'loading physics…' }}</p>
  </aside>
</template>

<style scoped>
.panel {
  position: fixed;
  top: 16px;
  left: 16px;
  max-width: 420px;
  padding: 16px 20px;
  background: rgb(11 15 23 / 0.85);
  color: #e6edf3;
  border: 1px solid #2e3b4e;
  border-radius: 10px;
  font: 14px/1.6 system-ui, sans-serif;
  /* Scroll when the text is taller than the window. Leave room at the bottom for the
     START AR / VR buttons. Dragging on the panel scrolls it instead of turning the
     preview camera */
  box-sizing: border-box;
  max-height: calc(100dvh - 96px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* On a narrow screen the panel reaches the buttons in the middle: stop above them */
@media (max-width: 600px) {
  .panel {
    right: 16px;
    max-height: calc(100dvh - 150px);
  }
}
.setting {
  margin: 10px 0 0;
  padding: 6px 10px 8px;
  border: 1px solid #2e3b4e;
  border-radius: 6px;
  font-size: 13px;
}
.setting legend {
  padding: 0 4px;
  color: #9aa7b4;
}
.setting label {
  display: block;
  cursor: pointer;
}
.setting.check {
  display: block;
  cursor: pointer;
}
.reset {
  margin-top: 10px;
  padding: 4px 12px;
  color: #e6edf3;
  background: #1f2a3a;
  border: 1px solid #2e3b4e;
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}
h1 {
  margin: 0 0 8px;
  font-size: 17px;
  color: #42b883;
}
ul {
  margin: 8px 0;
  padding-left: 18px;
}
b {
  color: #ffd400;
}
.note {
  margin: 8px 0 0;
  font-size: 12px;
  color: #9aa7b4;
}
</style>
