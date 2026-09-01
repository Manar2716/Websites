/* WebGL plumbing: context, programs, buffers, and the resolution policy.
 *
 * WebGL2 is required for instanced drawing without an extension dance;
 * where it is missing the caller falls back to the ANGLE_instanced_arrays
 * path on WebGL1, which every phone from the last decade has.
 */

export function createContext(canvas) {
  const attrs = {
    alpha: false, antialias: false, depth: true, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
    desynchronized: true,               // shaves a frame of latency where supported
    failIfMajorPerformanceCaveat: false,
  };
  let gl = canvas.getContext('webgl2', attrs);
  let version = 2;
  if (!gl) {
    gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    version = 1;
    if (gl) {
      const ext = gl.getExtension('ANGLE_instanced_arrays');
      if (!ext) return null;
      gl.drawArraysInstanced = ext.drawArraysInstancedANGLE.bind(ext);
      gl.drawElementsInstanced = ext.drawElementsInstancedANGLE.bind(ext);
      gl.vertexAttribDivisor = ext.vertexAttribDivisorANGLE.bind(ext);
      const vao = gl.getExtension('OES_vertex_array_object');
      if (vao) {
        gl.createVertexArray = vao.createVertexArrayOES.bind(vao);
        gl.bindVertexArray = vao.bindVertexArrayOES.bind(vao);
      } else {
        gl.createVertexArray = () => null;
        gl.bindVertexArray = () => {};
      }
      gl.getExtension('OES_element_index_uint');
    }
  }
  if (!gl) return null;
  gl.__version = version;
  return gl;
}

export function compile(gl, vsSrc, fsSrc, name = 'program') {
  const vs = shader(gl, gl.VERTEX_SHADER, vsSrc, name + ':vs');
  const fs = shader(gl, gl.FRAGMENT_SHADER, fsSrc, name + ':fs');
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`${name} link failed: ${gl.getProgramInfoLog(p)}`);
  }
  gl.deleteShader(vs); gl.deleteShader(fs);
  // Cache locations up front; getUniformLocation in a draw loop is slow.
  p.u = new Proxy({}, {
    get(cache, key) {
      if (!(key in cache)) cache[key] = gl.getUniformLocation(p, key);
      return cache[key];
    },
  });
  p.a = new Proxy({}, {
    get(cache, key) {
      if (!(key in cache)) cache[key] = gl.getAttribLocation(p, key);
      return cache[key];
    },
  });
  return p;
}

function shader(gl, type, src, label) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
    throw new Error(`${label} failed: ${log}\n${numbered}`);
  }
  return s;
}

export function buffer(gl, target, data, usage) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  if (data) gl.bufferData(target, data, usage || gl.STATIC_DRAW);
  return b;
}

/* Dynamic resolution.
 *
 * The backing store is sized independently of the CSS size, and shrinks
 * when frames run long. On a phone this is the single most effective
 * quality dial there is: going from 1.0 to 0.7 scale is roughly half the
 * fragment work, and at arm's length it is hard to see.
 */
export class ResolutionController {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.min = opts.min || 0.5;
    this.max = opts.max || 1.0;
    this.target = opts.targetMs || 16.7;
    this.scale = opts.scale || 1;
    this.enabled = opts.dynamic !== false;
    this.cssW = 0; this.cssH = 0;
    this.dpr = 1;
    this.avg = this.target;
    this.cooldown = 0;
  }

  /* Called every frame with the last frame's duration. Adjusts slowly and
     asymmetrically: drop resolution quickly when frames are long, raise it
     grudgingly, so the picture does not pulse. */
  sample(frameMs, dt) {
    if (!this.enabled) return;
    this.avg = this.avg * 0.9 + Math.min(frameMs, 60) * 0.1;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (this.avg > this.target * 1.28 && this.scale > this.min) {
      this.scale = Math.max(this.min, this.scale - 0.08);
      this.cooldown = 0.6; this.resize(true);
    } else if (this.avg < this.target * 0.78 && this.scale < this.max) {
      this.scale = Math.min(this.max, this.scale + 0.04);
      this.cooldown = 1.8; this.resize(true);
    }
  }

  resize(force) {
    const c = this.canvas;
    const cssW = c.clientWidth || window.innerWidth;
    const cssH = c.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (!force && cssW === this.cssW && cssH === this.cssH && dpr === this.dpr) return false;
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    const w = Math.max(2, Math.round(cssW * dpr * this.scale));
    const h = Math.max(2, Math.round(cssH * dpr * this.scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; return true; }
    return false;
  }

  get aspect() { return (this.canvas.width || 1) / (this.canvas.height || 1); }
}

/* '#rrggbb' -> [r,g,b] in 0..1, with a small cache because map data
   repeats the same handful of colours hundreds of times. */
const colourCache = new Map();
export function parseColour(hex) {
  let c = colourCache.get(hex);
  if (c) return c;
  let h = String(hex || '#888888').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  c = Number.isFinite(n)
    ? [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    : [0.5, 0.5, 0.5];
  colourCache.set(hex, c);
  return c;
}
