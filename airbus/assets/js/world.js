/* ═══════════════════════════════════════════════════════════
   world.js — one renderer, one sky, one post chain, and the
   stage manager that hands the screen between them.

   Every view in the site (hero, hangar, walkaround, flight deck,
   radar) is a Stage: a scene, a camera, and three lifecycle
   calls. Only one draws at a time, and switching between them
   crossfades through a full-screen wipe rather than cutting, so
   the aircraft never blinks out of existence.

   Post-processing is hand-rolled rather than borrowed: the
   effect composer that ships with three.js lives in the examples
   directory, and this project vendors only the core build. What
   is here is what the site actually uses — a bright-pass bloom
   pyramid, depth-of-field, chromatic aberration at the corners,
   a vignette and animated grain — in a single composite pass.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { loop, quality, clamp, lerp, damp, env, bus } from './core.js';

/* ── renderer ────────────────────────────────────────────── */

export const canvas = document.getElementById('gl');

export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,          /* resolved in post; MSAA on a float target is expensive */
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
/* Tone mapping and the sRGB transfer are done in the composite
   pass at the end of the chain, not by the renderer, so that
   bloom and depth of field work on linear light the way they
   physically should. The scene target is half-float and holds
   values well above 1. */
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;

export const size = { w: 1, h: 1, rw: 1, rh: 1, dpr: 1 };

/* ── sky ─────────────────────────────────────────────────── */

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;          /* pin to the far plane */
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uSun;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform float uSunI;
uniform float uHaze;
uniform float uNight;
uniform float uTime;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += noise(p)*a; p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;

  /* Rayleigh-ish vertical falloff. The exponent is what decides
     whether the sky reads as noon or as an hour before sunset. */
  float t = pow(1.0 - clamp(h, 0.0, 1.0), 2.6);
  vec3 col = mix(uZenith, uHorizon, t);

  /* below the horizon the dome becomes ground haze rather than
     a hard edge, so the terrain can fade into it */
  float below = smoothstep(0.0, -0.10, h);
  col = mix(col, uGround, below);

  float mu = dot(d, uSun);

  /* forward scatter — the reason the sky near the sun is pale */
  col += uHorizon * pow(max(mu, 0.0), 10.0) * 0.42 * uSunI;
  col += vec3(1.0, 0.86, 0.66) * pow(max(mu, 0.0), 900.0) * 1.5 * uSunI;

  /* the disc itself */
  float disc = smoothstep(0.99972, 0.99990, mu);
  col += vec3(1.0, 0.95, 0.86) * disc * 3.6 * uSunI;

  /* high cirrus, only above the horizon and only where it does
     not fight the sun disc */
  if (h > 0.02) {
    vec2 q = d.xz / max(h + 0.14, 0.05) * 1.4;
    float c = fbm(q * 0.9 + vec2(uTime * 0.004, uTime * 0.002));
    c = smoothstep(0.52, 0.86, c) * smoothstep(0.02, 0.30, h) * uHaze;
    col = mix(col, mix(vec3(1.0), vec3(1.0,0.92,0.86), max(mu,0.0)) * (0.9 + 0.4*uSunI), c * 0.55);
  }

  /* stars, cross-faded in as the sun goes down */
  if (uNight > 0.01 && h > -0.05) {
    vec2 sp = d.xz / max(abs(h) + 0.25, 0.05) * 60.0;
    float st = hash(floor(sp));
    float star = smoothstep(0.9975, 1.0, st) * uNight * smoothstep(-0.02, 0.25, h);
    col += vec3(0.85, 0.9, 1.0) * star * 2.2;
  }

  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor() {
    this.uniforms = {
      uSun: { value: new THREE.Vector3(0.3, 0.35, -0.9).normalize() },
      uZenith: { value: new THREE.Color(0x1d4a86) },
      uHorizon: { value: new THREE.Color(0xa8c6e6) },
      uGround: { value: new THREE.Color(0x6a7a89) },
      uSunI: { value: 1 },
      uHaze: { value: 0.7 },
      uNight: { value: 0 },
      uTime: { value: 0 }
    };
    const geo = new THREE.SphereGeometry(1, 32, 20);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;

    /* The sun's own light, which stages parent to their scene. */
    this.light = new THREE.DirectionalLight(0xfff2e0, 3.0);
    this.light.castShadow = quality.shadows;
    if (quality.shadows) {
      const s = this.light.shadow;
      s.mapSize.set(quality.shadowSize, quality.shadowSize);
      s.camera.near = 1; s.camera.far = 420;
      s.camera.left = -110; s.camera.right = 110;
      s.camera.top = 110; s.camera.bottom = -110;
      s.bias = -0.0008;
      s.normalBias = 0.35;
    }
    this.ambient = new THREE.HemisphereLight(0xbdd6f2, 0x50565e, 1.05);

    this._pmrem = null;
    this._envDirty = true;
    this.setTime(11.5);
  }

  /* `hour` is local solar time. Everything visible about the
     time of day — colour, intensity, the star fade — is derived
     from the one number, so a stage only ever sets that. */
  setTime(hour) {
    this.hour = hour;
    const a = ((hour - 6) / 12) * Math.PI;                 /* 6am → 6pm */
    const elev = Math.sin(a);
    const azi = Math.cos(a) * 0.55 + 0.35;
    this.uniforms.uSun.value.set(Math.sin(azi * Math.PI), elev, -Math.cos(azi * Math.PI)).normalize();

    const day = clamp(elev * 2.2, 0, 1);
    const dusk = clamp(1 - Math.abs(elev) * 5.5, 0, 1);
    const night = clamp(-elev * 3.2, 0, 1);

    const zen = new THREE.Color(0x1d4a86).lerp(new THREE.Color(0x050a18), night)
      .lerp(new THREE.Color(0x2c3f78), dusk * 0.5);
    const hor = new THREE.Color(0xa8c6e6).lerp(new THREE.Color(0x0b1224), night)
      .lerp(new THREE.Color(0xf5924a), dusk * 0.85);
    const grd = new THREE.Color(0x6a7a89).lerp(new THREE.Color(0x07090f), night);

    this.uniforms.uZenith.value.copy(zen);
    this.uniforms.uHorizon.value.copy(hor);
    this.uniforms.uGround.value.copy(grd);
    this.uniforms.uSunI.value = clamp(day + dusk * 0.6, 0.02, 1);
    this.uniforms.uNight.value = night;

    this.light.position.copy(this.uniforms.uSun.value).multiplyScalar(180);
    this.light.intensity = lerp(0.05, 3.4, day);
    this.light.color.setHex(dusk > 0.35 ? 0xffb277 : 0xfff2e0);
    this.ambient.intensity = lerp(0.18, 1.1, day) + dusk * 0.25;
    this.ambient.color.copy(hor);
    this.ambient.groundColor.copy(grd);
    this._envDirty = true;
  }

  /* Image-based lighting comes from the sky itself: render the
     dome into a cubemap once whenever the sun moves, and every
     metal surface in the scene picks up the same horizon. */
  environment() {
    if (!this._envDirty && this._env) return this._env;
    if (!this._pmrem) {
      this._pmrem = new THREE.PMREMGenerator(renderer);
      this._pmrem.compileEquirectangularShader();
    }
    const scene = new THREE.Scene();
    const m = new THREE.Mesh(this.mesh.geometry, this.material);
    m.frustumCulled = false;
    scene.add(m);
    this._env?.dispose();
    this._env = this._pmrem.fromScene(scene, 0, 0.1, 100).texture;
    this._envDirty = false;
    return this._env;
  }

  update(dt) { this.uniforms.uTime.value += dt; }
}

export const sky = new Sky();

/* ── post ────────────────────────────────────────────────── */

const QUAD = new THREE.BufferGeometry();
QUAD.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
QUAD.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new THREE.Scene();
const quadMesh = new THREE.Mesh(QUAD, null);
quadMesh.frustumCulled = false;
quadScene.add(quadMesh);

function fullscreen(fragment, uniforms) {
  return new THREE.RawShaderMaterial({
    uniforms,
    vertexShader: `
      precision highp float;
      attribute vec3 position; attribute vec2 uv;
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: 'precision highp float;\n' + fragment,
    depthTest: false, depthWrite: false
  });
}

function blit(material, target) {
  quadMesh.material = material;
  renderer.setRenderTarget(target || null);
  renderer.render(quadScene, quadCam);
}

class Post {
  constructor() {
    const opts = {
      type: THREE.HalfFloatType,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      depthBuffer: true,
      colorSpace: THREE.NoColorSpace
    };
    this.scene = new THREE.WebGLRenderTarget(1, 1, opts);
    this.scene.depthTexture = new THREE.DepthTexture(1, 1);
    this.scene.depthTexture.type = THREE.UnsignedShortType;

    this.LEVELS = 5;
    this.down = [];
    this.up = [];
    for (let i = 0; i < this.LEVELS; i++) {
      this.down.push(new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: false }));
      this.up.push(new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: false }));
    }

    this.uBright = {
      tIn: { value: null }, uThreshold: { value: 1.30 }, uKnee: { value: 0.30 },
      uTexel: { value: new THREE.Vector2() }
    };
    this.mBright = fullscreen(`
      varying vec2 vUv; uniform sampler2D tIn;
      uniform float uThreshold, uKnee; uniform vec2 uTexel;
      void main(){
        vec3 c = texture2D(tIn, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float s = clamp((l - uThreshold + uKnee) / (2.0*uKnee), 0.0, 1.0);
        float w = max(l - uThreshold, s * s * uKnee) / max(l, 1e-4);
        gl_FragColor = vec4(c * w, 1.0);
      }`, this.uBright);

    this.uBlur = { tIn: { value: null }, uTexel: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) } };
    this.mBlur = fullscreen(`
      varying vec2 vUv; uniform sampler2D tIn; uniform vec2 uTexel, uDir;
      void main(){
        vec2 o = uTexel * uDir;
        vec3 c = texture2D(tIn, vUv).rgb * 0.2270270270;
        c += texture2D(tIn, vUv + o*1.3846153846).rgb * 0.3162162162;
        c += texture2D(tIn, vUv - o*1.3846153846).rgb * 0.3162162162;
        c += texture2D(tIn, vUv + o*3.2307692308).rgb * 0.0702702703;
        c += texture2D(tIn, vUv - o*3.2307692308).rgb * 0.0702702703;
        gl_FragColor = vec4(c, 1.0);
      }`, this.uBlur);

    this.uUp = { tIn: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } };
    this.mUp = fullscreen(`
      varying vec2 vUv; uniform sampler2D tIn, tAdd; uniform vec2 uTexel;
      void main(){
        vec3 a = texture2D(tIn, vUv).rgb;
        vec3 b = texture2D(tAdd, vUv).rgb;
        gl_FragColor = vec4(a + b, 1.0);
      }`, this.uUp);

    this.uComp = {
      tScene: { value: null }, tBloom: { value: null }, tDepth: { value: null },
      uBloom: { value: 0.42 }, uTime: { value: 0 }, uGrain: { value: 0.055 },
      uVignette: { value: 0.34 }, uAberration: { value: 0.0016 },
      uFocus: { value: 40 }, uDofRange: { value: 90 }, uDof: { value: 0 },
      uNear: { value: 0.1 }, uFar: { value: 1000 },
      uFade: { value: 0 }, uFadeCol: { value: new THREE.Color(0x05070c) },
      uTexel: { value: new THREE.Vector2() }, uExposure: { value: 1 }
    };
    this.mComp = fullscreen(`
      varying vec2 vUv;
      uniform sampler2D tScene, tBloom, tDepth;

      /* Narkowicz's fit to the ACES filmic curve — close enough
         at a fraction of the cost of the real thing. */
      vec3 aces(vec3 x){
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      vec3 linearToSRGB(vec3 c){
        return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
                   step(vec3(0.0031308), c));
      }
      uniform float uBloom, uTime, uGrain, uVignette, uAberration;
      uniform float uFocus, uDofRange, uDof, uNear, uFar, uFade, uExposure;
      uniform vec3 uFadeCol;
      uniform vec2 uTexel;

      float linearDepth(vec2 uv){
        float z = texture2D(tDepth, uv).x;
        float ndc = z * 2.0 - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
      }

      void main(){
        vec2 uv = vUv;
        vec2 fromCentre = uv - 0.5;
        float r2 = dot(fromCentre, fromCentre);

        /* lateral chromatic aberration: only at the corners, and
           only a pixel or two, which is what a real lens does */
        float ab = uAberration * r2 * 4.0;
        vec3 col;
        col.r = texture2D(tScene, uv + fromCentre * ab).r;
        col.g = texture2D(tScene, uv).g;
        col.b = texture2D(tScene, uv - fromCentre * ab).b;

        /* depth of field, approximated by leaning on the bloom
           pyramid's own blur rather than a second gather */
        if (uDof > 0.001) {
          float d = linearDepth(uv);
          float coc = clamp(abs(d - uFocus) / uDofRange, 0.0, 1.0);
          coc = pow(coc, 1.6) * uDof;
          vec3 blurred = texture2D(tBloom, uv).rgb * 3.4 + col * 0.25;
          col = mix(col, blurred / 1.4, coc);
        }

        col += texture2D(tBloom, uv).rgb * uBloom;
        col *= uExposure;

        /* vignette */
        col *= 1.0 - uVignette * smoothstep(0.16, 0.78, r2);

        /* ── output transform ──────────────────────────
           Everything above is linear light. A RawShaderMaterial
           gets none of three.js's automatic output conversion,
           so the tone curve and the sRGB transfer are applied
           here — without them the whole site renders as if the
           sun had gone down. */
        col = max(col, vec3(0.0));
        col = aces(col);
        col = linearToSRGB(col);

        /* grain sits in display space, weighted into the shadows
           where film actually shows it */
        float g = fract(sin(dot(uv * vec2(1024.0, 768.0) + uTime * 37.0, vec2(12.9898, 78.233))) * 43758.5453);
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col += (g - 0.5) * uGrain * (1.0 - smoothstep(0.0, 0.9, lum));

        col = mix(col, uFadeCol, uFade);
        gl_FragColor = vec4(col, 1.0);
      }`, this.uComp);
  }

  resize(w, h) {
    this.scene.setSize(w, h);
    this.scene.depthTexture.image.width = w;
    this.scene.depthTexture.image.height = h;
    let bw = w, bh = h;
    for (let i = 0; i < this.LEVELS; i++) {
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      this.down[i].setSize(bw, bh);
      this.up[i].setSize(bw, bh);
    }
  }

  render(camera) {
    const bloomOn = quality.bloom;
    if (bloomOn) {
      this.uBright.tIn.value = this.scene.texture;
      blit(this.mBright, this.down[0]);

      for (let i = 1; i < this.LEVELS; i++) {
        const src = this.down[i - 1], dst = this.down[i];
        this.uBlur.tIn.value = src.texture;
        this.uBlur.uTexel.value.set(1 / src.width, 1 / src.height);
        this.uBlur.uDir.value.set(1, 0);
        blit(this.mBlur, this.up[i]);
        this.uBlur.tIn.value = this.up[i].texture;
        this.uBlur.uTexel.value.set(1 / this.up[i].width, 1 / this.up[i].height);
        this.uBlur.uDir.value.set(0, 1);
        blit(this.mBlur, dst);
      }
      /* upsample and accumulate back down the pyramid */
      for (let i = this.LEVELS - 2; i >= 0; i--) {
        this.uUp.tIn.value = this.down[i].texture;
        this.uUp.tAdd.value = (i === this.LEVELS - 2 ? this.down[i + 1] : this.up[i + 1]).texture;
        blit(this.mUp, this.up[i]);
      }
    }

    this.uComp.tScene.value = this.scene.texture;
    this.uComp.tBloom.value = bloomOn ? this.up[0].texture : this.down[0].texture;
    this.uComp.tDepth.value = this.scene.depthTexture;
    this.uComp.uBloom.value = bloomOn ? this._bloom ?? 0.42 : 0;
    this.uComp.uNear.value = camera.near;
    this.uComp.uFar.value = camera.far;
    blit(this.mComp, null);
  }
}

export const post = new Post();

/* ── stages ──────────────────────────────────────────────── */

export class Stage {
  constructor(name) {
    this.name = name;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 6000);
    this.built = false;
    this.active = false;
    this.grade = { bloom: 0.42, grain: 0.055, vignette: 0.34, dof: 0, focus: 40, range: 90, exposure: 1 };
  }
  build() {}
  enter() {}
  exit() {}
  update() {}
  resize() {}
}

class App {
  constructor() {
    this.stages = new Map();
    this.current = null;
    this.pending = null;
    this.fade = 0;
    this.fadeDir = 0;
    this.grade = { bloom: 0.42, grain: 0.055, vignette: 0.34, dof: 0, focus: 40, range: 90, exposure: 1 };
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize, { passive: true });
    window.addEventListener('orientationchange', this._resize, { passive: true });
    this._resize();
    loop.add((dt, t) => this._frame(dt, t), 100);
  }

  register(stage) { this.stages.set(stage.name, stage); return stage; }

  /* Never a cut. The outgoing stage dims to black over ~0.34 s,
     the incoming one is built and warmed while the screen is
     dark, and then comes back up. */
  go(name, opts = {}) {
    if (!this.stages.has(name)) return;
    if (this.current?.name === name && !opts.force) return;
    this.pending = { name, opts };
    this.fadeDir = 1;
    bus.emit('stage:leaving', this.current?.name);
  }

  _swap() {
    const { name, opts } = this.pending;
    const next = this.stages.get(name);
    if (this.current) { this.current.active = false; this.current.exit(); }
    if (!next.built) { next.build(); next.built = true; }
    next.active = true;
    next.resize(size.w, size.h);
    next.enter(opts);
    this.current = next;
    this.pending = null;
    this.fadeDir = -1;
    document.documentElement.dataset.stage = name;
    bus.emit('stage:entered', name);
  }

  _resize() {
    size.w = window.innerWidth;
    size.h = window.innerHeight;
    size.dpr = quality.dpr;
    this._applySize();
    for (const s of this.stages.values()) if (s.built) s.resize(size.w, size.h);
  }

  _applySize() {
    const rw = Math.max(2, Math.round(size.w * size.dpr * quality.scale));
    const rh = Math.max(2, Math.round(size.h * size.dpr * quality.scale));
    if (rw === size.rw && rh === size.rh) return;
    size.rw = rw; size.rh = rh;
    renderer.setPixelRatio(1);
    renderer.setSize(rw, rh, false);
    canvas.style.width = size.w + 'px';
    canvas.style.height = size.h + 'px';
    post.resize(rw, rh);
  }

  _frame(dt, t) {
    this._applySize();

    if (this.fadeDir > 0) {
      this.fade = Math.min(1, this.fade + dt * 3.4);
      if (this.fade >= 1 && this.pending) this._swap();
    } else if (this.fadeDir < 0) {
      this.fade = Math.max(0, this.fade - dt * 2.6);
      if (this.fade <= 0) this.fadeDir = 0;
    }

    sky.update(dt);
    const s = this.current;
    if (!s) return;

    s.update(dt, t);

    /* colour grade eases toward whatever the stage asks for, so
       walking from a hangar into daylight is a exposure ramp
       rather than a jump */
    const g = this.grade, w = s.grade;
    const k = env.reduced ? 30 : 2.6;
    for (const key of ['bloom', 'grain', 'vignette', 'dof', 'focus', 'range', 'exposure']) {
      g[key] = damp(g[key], w[key], k, dt);
    }
    post._bloom = g.bloom;
    post.uComp.uGrain.value = quality.grain ? g.grain : 0;
    post.uComp.uVignette.value = g.vignette;
    post.uComp.uDof.value = quality.tier > 0 ? g.dof : 0;
    post.uComp.uFocus.value = g.focus;
    post.uComp.uDofRange.value = g.range;
    post.uComp.uExposure.value = g.exposure;
    post.uComp.uTime.value = t;
    post.uComp.uFade.value = this.fade;

    renderer.info.reset();
    renderer.setRenderTarget(post.scene);
    renderer.clear();
    renderer.render(s.scene, s.camera);
    post.render(s.camera);
    renderer.setRenderTarget(null);
  }
}

export const app = new App();

/* Shared helper: give a stage the sky dome, the sun and the IBL
   environment without every stage repeating the same six lines.

   There is exactly one sun and one ambient in this project, and
   they move between scenes rather than being copied into them —
   an early version cloned the ambient at build time, which froze
   each stage at whatever time of day happened to be set when it
   was first constructed. `claimSky` re-parents them, and every
   stage calls it on entry. */
export function attachSky(stage, { hour = 11.5, fog = null } = {}) {
  const dome = new THREE.Mesh(sky.mesh.geometry, sky.material);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.onBeforeRender = (r, sc, cam) => {
    dome.position.copy(cam.position);
    dome.scale.setScalar(cam.far * 0.9);
  };
  stage.scene.add(dome);
  stage.sun = sky.light;
  stage.skyHour = hour;
  if (fog) stage.scene.fog = fog;
  sky.setTime(hour);
  claimSky(stage);
  stage.scene.environment = sky.environment();
  return dome;
}

export function claimSky(stage) {
  stage.scene.add(sky.light, sky.light.target, sky.ambient);
  if (stage.skyHour !== undefined) sky.setTime(stage.skyHour);
  stage.scene.environment = sky.environment();
}

export { THREE };
