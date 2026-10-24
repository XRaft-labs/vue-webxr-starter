# vue-webxr-starter

**Vue**・**[TresJS](https://tresjs.org)**・**Three.js**で、ウェブの複合現実(MR)を始めるためのスターターキットです。
ヘッドセットのブラウザでページを開き、**START AR**を押すと、緑の箱が実物の机の上に落ちてきます。手で掴めます。

**Meta Quest 3**と**Android XR**向けです。アプリストアもネイティブSDKも不要で、ウェブページとして動きます。

[English README](./README.md)

## 入っている機能

| 機能 | 内容 |
| --- | --- |
| パススルーAR / VR | START ARとENTER VRのボタン。パススルーでは背景を透明にする |
| 物理エンジン | [Rapier](https://rapier.rs)で重力と衝突。固定の時間刻みで計算するので、72・90・120Hzのどれでも落ちる速さが同じ |
| バウンディングボックスの当たり判定 | メッシュやモデルの大きさに合わせた箱の当たり判定を自動で付ける |
| 平面検出 | 実物の机と床を当たり判定にし、緑の半透明で表示する。物が実物の机の上で止まる |
| 床の高さの判定 | 参照空間の原点が目の高さにある環境でも、実際の床の高さを求める |
| 手やコントローラで掴む | 物を指先でつまむ(コントローラなら物に触れた状態でトリガーを引く)と掴める。物が手の移動に付いてきて、手首をひねると一緒に回る |
| 両手で拡大縮小 | 掴んでいる物をもう一方の手でもつまみ、手を広げると拡大、縮めると縮小。両手の向きで回転 |
| 離すと落ちる・投げる | そっと離すと机か床まで真下に落ちる。手を振りながら離すと、手の軌道と速さで飛んでいく |
| 箱を足す(例) | 何もない所で1回ピンチすると、目の高さの40cm先に新しい箱が出て落ちる |
| リセット | 何もない所で2回ピンチする(コントローラならA/Xボタン)と、物が視線の先に戻る。視線が当たった机か床の上に置き、何にも当たらなければ60cm先に出す。机の検出を待ってから落ちる。ピンチで足した箱は消える |
| 視線のレティクル | 見ている先にレティクル(照準の輪)を出し、照準がちょうど合った物を黄色の枠で囲む。AR中は何もない所で3回ピンチするか、B/Yボタンで表示を切り替えられる |
| セッションを終える | 何もない所で5回続けてピンチすると、AR / VRを終えてページに戻る |
| Questのメニュー操作 | 手のひらを顔に向けたピンチはQuestのメニューを開く操作なので、数えない。箱が増えたりリセットされたりしない |
| 手のオクルージョン | ARでは手とコントローラのモデルが後ろの物を隠すだけになり、実物の手がそのまま見える。ARに入る前のページで、モデルを表示する設定に切り替えられる |

使い回せる部分は`vue-webxr/`フォルダにまとめてあります。緑の箱は例として`examples/green-box/`に置いています。

## 自分のプロジェクトで使う

`vue-webxr/`は単体で完結したライブラリのフォルダです。別のプロジェクトでは次の手順で使えます。

1. `vue-webxr/`をプロジェクトにコピーします。コピーせずにローカルの依存として足す場合は`pnpm add link:../vue-webxr-starter/vue-webxr`です。
2. 依存パッケージを入れます。`pnpm add vue three @tresjs/core @tresjs/rapier @dimforge/rapier3d-compat`
3. `vite.config.ts`で、`@tresjs/core`の`templateCompilerOptions`を`vue({ ...templateCompilerOptions })`のように渡します。
4. フォルダをコピーした場合は、`from 'vue-webxr'`で読み込めるようにエイリアスを足します。このリポジトリの`vite.config.ts`と`tsconfig.app.json`が参考になります。

あとはページに`<XRCanvas>`を置き、掴ませたい物に`useGrabbable()`を呼ぶだけです。

## はじめかた

[Node.js](https://nodejs.org) 20以上と[pnpm](https://pnpm.io)が必要です。

```bash
git clone https://github.com/XRaft-labs/vue-webxr-starter.git
cd vue-webxr-starter
pnpm install
```

**Quest 3**で初めて動かす前に、部屋をスキャンして机の位置を登録しておきます。
**設定 > 物理的な空間 > スペースの設定**で、机を机として登録してください。
スキャンが無くても動きますが、物は机に乗らず床まで落ちます。

次に、下のどれかの方法でヘッドセットのブラウザでページを開きます。

### A. USBでつなぐ(開発時はこれがおすすめ)

WebXRはHTTPSか`localhost`でしか動きません。USBでつないで`adb reverse`を使うと、
ヘッドセットからPCが`localhost`に見えるので、HTTPのままで動きます。証明書も、同じWi-Fiも不要です。

1. `adb`([Android platform-tools](https://developer.android.com/tools/releases/platform-tools))を入れる。
   macOSなら`brew install --cask android-platform-tools`
2. ヘッドセットの開発者モードを有効にして、USBケーブルでつなぐ。ヘッドセットの中で「USBデバッグを許可」を承認する
3. 次を実行する

```bash
pnpm dev:usb      # http://localhost:5173 で開発サーバーを起動
pnpm device       # 別のターミナルで実行。ポートを転送し、ヘッドセットのブラウザでページを開く
```

Android XRでは`./scripts/open-on-device.sh --chrome`でChromeで開きます。
Windowsでは、スクリプトの中の2つの`adb`コマンドを直接実行してください。

```bash
adb reverse tcp:5173 tcp:5173
adb shell am start -a android.intent.action.VIEW -d "http://localhost:5173/" com.oculus.browser
```

### B. 同じWi-Fiでつなぐ

```bash
pnpm dev
```

ローカル証明書([mkcert](https://github.com/FiloSottile/mkcert))でHTTPS配信します。
表示される`Network`のアドレス(`https://192.168.x.x:5173`)をヘッドセットで開き、証明書の警告を承認します。

### C. トンネルを使う

どこからでも開けるように、開発サーバーに一時的なHTTPSのURLを付けます。

```bash
pnpm dev:usb
cloudflared tunnel --url http://localhost:5173    # Cloudflare Tunnel(アカウント不要)
# または ngrok http 5173
```

トンネルを開いている間は、URLを知っていれば誰でもページを開けます。

### D. 公開する

```bash
pnpm build
```

`dist/`をHTTPSの静的ホスティング(Netlify、Vercel、Cloudflare Pages、GitHub Pagesなど)に置きます。
公開したページは誰でも見られるため、必要に応じてIPアドレス制限などでアクセスできる人を絞ってください。

## 自分のものに書き換える

例のシーンは`examples/green-box/GreenBoxes.vue`で、`GreenBox.vue`を並べています。掴める物のいちばん短い書き方は次のとおりです。

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

例のフォルダをコピーしてメッシュを書き換え、その`App.vue`の`<XRCanvas>`の中に置きます。別の例を動かすときは、`index.html`の`<script>`をその例の`main.ts`に向けます。
`useGrabbable()`は`Object3D`なら何にでも使えます。glTF / GLBから読み込んだモデルも同じです。

知っておくこと:

- **単位はメートル**です。`y`が上。原点はセッションを始めた場所の床で、`-z`がそのとき向いていた方向です。
- **掴める物の位置と回転は物理エンジンが持ちます。** 最初の`:position`は定数で渡してください。リアクティブな値を`:position`に渡すと、再描画のたびにVueが物理の位置を上書きします。
- **セッションを始めるたびに、物を視線の先に置き直します。** 置き方はリセットと同じです。物が複数あるときは、1つ目をそこに置き、残りはシーンに書いた1つ目との位置関係のまま並べます。`resetScene()`を呼べば、いつでも同じことができます。
- **何もない所での1回ピンチには`useEmptyPinch()`で反応できます。** 頭の位置と向きを受け取れます(例ではそこに箱を出します)。**リセットには`useSceneReset()`で反応できます**(例では足した箱を消します)。2回と3回のピンチは、リセットとレティクルに使います。
- **毎フレームの処理は`useXRFrame()`に書きます。** TresJSの`useLoop()`ではありません。没入セッション中に動き続けるのは`renderer.setAnimationLoop()`だけなので、スターターはそこからフレームを回しています。
- **調整できる値はすべて`vue-webxr/config.ts`にあります。** 物理の計算頻度、掴める距離、拡大縮小の範囲、平面の表示色、要求する機能など。

## フォルダ構成

```
vue-webxr/                   ライブラリ本体。このフォルダをコピーすれば使い回せる
  package.json               名前と依存パッケージ。ローカルの依存として足すときに使う
  index.ts                   公開する API。'vue-webxr' から読み込む
  XRCanvas.vue               <TresCanvas> に <Physics>(@tresjs/rapier)と WebXR を足したもの
  XRPhysicsBridge.vue        <Physics> のワールドを XR の処理に渡す
  runtime.ts                 フレームループとセッションの開始・終了
  session.ts                 AR / VR ボタン、ページを閉じるときのセッション終了
  physics.ts                 <Physics> のワールドを XR のループから固定の刻みで進める
  grabbables.ts              バウンディングボックスの当たり判定、拡大縮小、物理とメッシュの同期
  rigidBodies.ts             XRの中で、すべての <RigidBody> の位置を見た目に写す
  floor.ts                   床の当たり判定と実際の床の高さ
  planes.ts                  平面検出から机・床の当たり判定と緑の表示を作る
  interaction.ts             掴む、追従、両手で拡大縮小、落とす・投げる
  reset.ts                   物を視線の先に置き直し、平面の検出を待つ
  gaze.ts                    頭の向きによる視線、レティクル、選択の枠
  inputModels.ts             手とコントローラのモデルを、マスクにするか表示するか
  composables.ts             useGrabbable()、useXRFrame()、useEmptyPinch()、useSceneReset()
  config.ts                  調整できる値の一覧
examples/
  green-box/                 掴める緑の箱
    App.vue                  ページ本体。<XRCanvas> の中にシーンを置く
    GreenBoxes.vue           ライトと箱の一覧。ピンチで1つ足す
    GreenBox.vue             箱 1 つ
    main.ts                  入口。index.html から読み込む
scripts/open-on-device.sh    adb reverse して、ヘッドセットでページを開く
```

## デバッグ

- ヘッドセットをUSBでつなぎ、PCのChromeで`chrome://inspect`を開くと、ヘッドセットのブラウザのコンソールが見られます。
- 開発中は`window.__xrStarter`から内部(物理、平面、床、掴める物)をコンソールで触れます。
- `vue-webxr`が公開する`xrState`に、セッションの種類、入力の種類、許可された機能、検出した平面の数が入っています。デバッグ表示に使えます。
- 検出した面は緑の半透明で表示します。`vue-webxr/config.ts`の`planeColor`と`planeOpacity`で色と濃さを変えられ、`showPlanes`で消せます。

## 対応デバイス

| デバイス | ブラウザ | AR(パススルー) | 手 | 平面検出 |
| --- | --- | --- | --- | --- |
| Meta Quest 3 / 3S | Quest Browser | 対応 | 対応 | 対応(スペースの設定が必要) |
| Android XR | Chrome | 対応 | 対応 | デバイスによる |
| Apple Vision Pro | Safari | 非対応(VRのみ) | 物に手を添えてピンチ | 非対応 |

主な対象はMeta Quest 3です。Android XRとVision Proも同じWebXRの標準に沿っているため表のとおり動く想定ですが、実機での確認はまだです。
機能はすべてoptionalで要求するので、デバイスに無い機能があってもセッションは開始されます。

## 使っている技術

Vue 3、TresJS 5、Three.js r172、Rapier 0.20(@tresjs/rapier 1.2経由)、Vite、TypeScript。

没入中はTresJS自身のループ(`window.requestAnimationFrame`で回る)が止まるため、@tresjs/rapierは物理を進めず、位置の反映もしません。スターターが XR のループから両方を行っています。Quest 3 で測ったところ、没入中の2秒間に XR のフレームは180回来たのに対し、`window.requestAnimationFrame`は0回でした。

## ライセンス

[MIT](./LICENSE)
