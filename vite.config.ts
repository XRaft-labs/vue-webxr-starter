import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import mkcert from 'vite-plugin-mkcert'
import { templateCompilerOptions } from '@tresjs/core'

// WebXR only runs in a secure context: HTTPS, or http://localhost.
//
//   pnpm dev      HTTPS with a locally trusted certificate (mkcert).
//                 Use it for LAN access (https://192.168.x.x:5173) or behind a tunnel.
//   pnpm dev:usb  Plain HTTP. Use it with `adb reverse` over USB: the headset opens
//                 http://localhost:5173, which is a secure context, so no certificate
//                 warning appears. See scripts/open-on-device.sh.
const useHttp = process.env.HTTP === '1'

export default defineConfig({
  plugins: [vue({ ...templateCompilerOptions }), ...(useHttp ? [] : [mkcert()])],
  resolve: {
    // The library lives in ./vue-webxr. Import it as 'vue-webxr', the way another project
    // would after copying the folder (or adding it as a local dependency)
    alias: { 'vue-webxr': fileURLToPath(new URL('./vue-webxr/index.ts', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    // Tunnels such as Cloudflare Tunnel or ngrok send their own Host header.
    // Vite rejects unknown hosts, so allow the common tunnel domains.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'],
  },
})
