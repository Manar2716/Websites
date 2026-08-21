/* ═══════════════════════════════════════════════════════════
   shaders.js — GLSL ES 3.00 for every pass on this site.

   The whole project turns on one question: what makes a rendered
   prawn look like a photograph of a prawn rather than a plastic
   toy of one? Three things, in this order of importance.

   1. Light goes *through* it. Prawn meat is a few millimetres of
      dense translucent protein. Point a light at the far side and
      the near side glows red-orange. Without that the surface is
      opaque and reads as painted resin, no matter how good the
      specular is.

   2. It is wet. Everything served here comes out of butter, oil
      or its own juice, and a wet surface is a rough diffuse body
      under a smooth clear layer — two lobes, not one roughness.
      A single mid-roughness GGX gives you satin, and satin is
      exactly what food never looks like.

   3. Its colour is banded, not uniform. A cooked prawn is coral
      where the shell segment bulged and near-white in the joint
      behind it, with a dark line down the back. The banding is
      driven off the same v coordinate the mesh was swept along,
      so the pattern and the geometry can never disagree.

   Everything up to the composite is linear light. The composite
   is shared by both stages, so the hero and the menu are graded
   by one curve — which is most of what makes them read as one
   piece of work rather than two demos on one page.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIM = (global.SHRIM = global.SHRIM || {});
  var SH = (SHRIM.SH = {});

  var H = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

  /* ── noise, matched to the CPU implementation in math.js ─── */

  var NOISE = [
    /* An integer hash, not the usual `fract(sin(dot(p, …)) * big)`.

       That one is fine while the coordinates are small and falls
       apart when they are not: `sin` of a number in the tens of
       thousands, evaluated in 32-bit float, aliases into a regular
       pattern. The table on this page is twenty-six metres of oak
       whose grain is sampled at seventeen cycles a metre, which
       puts the argument comfortably past that — and it printed a
       diamond trellis across the whole surface. Three rounds of
       integer mixing costs about the same and has no such
       coordinate at which it starts repeating. */
    'uint hashU(uvec3 x){',
    '  x = x * 1664525u + 1013904223u;',
    '  x.x += x.y*x.z; x.y += x.z*x.x; x.z += x.x*x.y;',
    '  x ^= x >> 16u;',
    '  x.x += x.y*x.z; x.y += x.z*x.x; x.z += x.x*x.y;',
    '  return x.x;',
    '}',
    'float hash13(vec3 p){',
    '  return float(hashU(uvec3(ivec3(floor(p)) + 8192)) & 0x00FFFFFFu) / 16777216.0;',
    '}',
    'float hash12(vec2 p){',
    '  return float(hashU(uvec3(ivec3(floor(p), 0) + 8192)) & 0x00FFFFFFu) / 16777216.0;',
    '}',
    'float noise3(vec3 x){',
    '  vec3 i = floor(x), f = fract(x);',
    '  vec3 u = f*f*(3.0-2.0*f);',
    '  float n000=hash13(i), n100=hash13(i+vec3(1,0,0));',
    '  float n010=hash13(i+vec3(0,1,0)), n110=hash13(i+vec3(1,1,0));',
    '  float n001=hash13(i+vec3(0,0,1)), n101=hash13(i+vec3(1,0,1));',
    '  float n011=hash13(i+vec3(0,1,1)), n111=hash13(i+vec3(1,1,1));',
    '  float x00=mix(n000,n100,u.x), x10=mix(n010,n110,u.x);',
    '  float x01=mix(n001,n101,u.x), x11=mix(n011,n111,u.x);',
    '  return mix(mix(x00,x10,u.y), mix(x01,x11,u.y), u.z)*2.0-1.0;',
    '}',
    'float fbm3(vec3 p, int oct){',
    '  float a=0.5, s=0.0;',
    '  for(int i=0;i<6;i++){ if(i>=oct) break; s += a*noise3(p); p*=2.02; a*=0.5; }',
    '  return s;',
    '}',
    'float ridged(vec3 p, int oct){',
    '  float a=0.5, s=0.0;',
    '  for(int i=0;i<6;i++){ if(i>=oct) break; s += a*(1.0-abs(noise3(p))); p*=2.03; a*=0.5; }',
    '  return s;',
    '}',
    'mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }'
  ].join('\n');

  /* ── the room ────────────────────────────────────────────────
     There is no cubemap and no HDRI here. Reflections come from an
     analytic dining room: a dark warm ceiling, a broad soft key
     overhead where a photographer would hang one, one cool window
     off to the side, and a warm bounce back up off the table.

     Roughness widens the key's lobe. That single relationship is
     doing an enormous amount of work — it is what makes glazed
     ceramic, cast iron, butter, citrus rind and wet prawn read as
     five different materials under one light, without a single
     texture map between them. */

  var ENV = [
    'uniform vec3 uEnvTop, uEnvFloor, uEnvKey, uEnvCool, uEnvBounce;',
    'uniform vec3 uKeyDir, uCoolDir;',
    'vec3 envColor(vec3 d, float rough){',
    '  float up = d.y*0.5+0.5;',
    '  vec3 c = mix(uEnvFloor, uEnvTop, pow(up, 0.80));',
    /* the softbox: broad, and it only tightens as the surface
       smooths — a mirror sees a small bright rectangle, a rough
       surface sees the whole ceiling */
    '  float k = max(dot(d, uKeyDir), 0.0);',
    '  c += uEnvKey * pow(k, mix(64.0, 1.7, rough*rough)) * mix(1.0, 0.20, rough);',
    /* the window, cooler and much wider */
    '  float w = max(dot(d, uCoolDir), 0.0);',
    '  c += uEnvCool * pow(w, mix(18.0, 1.4, rough)) * mix(1.0, 0.34, rough);',
    /* what comes back up off the table */
    '  c += uEnvBounce * pow(max(-d.y,0.0), 1.5) * (0.45+0.55*rough);',
    '  return c;',
    '}'
  ].join('\n');

  /* ── shading ─────────────────────────────────────────────── */

  var PBR = [
    'const float PI = 3.14159265359;',
    'float D_GGX(float NoH, float a){ float a2=a*a; float d=NoH*NoH*(a2-1.0)+1.0; return a2/max(PI*d*d,1e-7); }',
    'float V_Smith(float NoV, float NoL, float a){',
    '  float k = a*0.5;',
    '  return 0.5/max(mix(NoV,1.0,k)*mix(NoL,1.0,k)*4.0, 1e-5);',
    '}',
    'vec3 F_Schlick(vec3 f0, float u){ return f0 + (1.0-f0)*pow(1.0-u, 5.0); }',
    'float F_Schlick1(float f0, float u){ return f0 + (1.0-f0)*pow(1.0-u, 5.0); }',

    'uniform sampler2D uShadowMap;',
    'uniform mat4 uShadowMat;',
    'uniform float uShadowStrength;',
    'uniform vec2 uShadowTexel;',

    /* 3×3 PCF with a slope-scaled bias. Contact is everything on a
       plate: a prawn whose shadow starts a millimetre away from it
       is a prawn floating over a picture of a plate. */
    'float shadowAt(vec3 wp, float NoL){',
    '  if(uShadowStrength <= 0.001) return 1.0;',
    '  vec4 sc = uShadowMat * vec4(wp,1.0);',
    '  vec3 p = sc.xyz/sc.w * 0.5 + 0.5;',
    '  if(p.x<0.002||p.x>0.998||p.y<0.002||p.y>0.998||p.z>1.0) return 1.0;',
    '  float bias = mix(0.0014, 0.00025, NoL);',
    '  float s = 0.0;',
    '  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){',
    '    float d = texture(uShadowMap, p.xy + vec2(float(x),float(y))*uShadowTexel).r;',
    '    s += step(p.z - bias, d);',
    '  }',
    '  s /= 9.0;',
    '  return mix(1.0, s, uShadowStrength);',
    '}',

    'uniform vec3 uKeyColor, uCoolColor, uRimColor, uAmbient;',
    'uniform vec3 uCam;',

    /* The material, as the renderer hands it over. */
    'struct Surf {',
    '  vec3 albedo;',
    '  float rough;',
    '  float metal;',
    '  float ao;',
    '  float coat;',       /* wet layer: 0 dry … 1 straight out of the pan */
    '  float sss;',        /* how much light gets through */
    '  vec3  sssTint;',    /* and what colour it is when it does */
    '  float thick;',      /* 0 at the thin edges, 1 through the body */
    '}',
    ';',

    /* One light, evaluated twice: base lobe, then the clear coat
       on top of it. The coat's Fresnel attenuates what is under
       it, which is why a wet prawn's colour desaturates toward the
       glancing edges instead of staying flat coral all over. */
    'vec3 lightLobe(vec3 N, vec3 V, vec3 L, vec3 lightCol, Surf s, float shadow){',
    '  vec3 Hv = normalize(V+L);',
    '  float NoV = max(dot(N,V), 1e-4);',
    '  float NoL = max(dot(N,L), 0.0);',
    '  float NoH = max(dot(N,Hv), 0.0);',
    '  float VoH = max(dot(V,Hv), 0.0);',
    '  float a = max(s.rough*s.rough, 0.0018);',
    '  vec3 f0 = mix(vec3(0.045), s.albedo, s.metal);',
    '  vec3 F = F_Schlick(f0, VoH);',
    '  vec3 spec = F * D_GGX(NoH,a) * V_Smith(NoV,NoL,a);',
    '  vec3 kd = (1.0-F)*(1.0-s.metal);',
    /* light that scatters through is light that did not bounce off
       the front — the diffuse lobe pays for the subsurface term
       rather than the two being added on top of each other, which
       is what turns a prawn into a glowing lamp */
    '  vec3 col = (kd*s.albedo/PI*(1.0 - s.sss*0.42) + spec) * lightCol * NoL * shadow;',

    /* subsurface: a wrapped diffuse term for the near side plus a
       forward-scatter term for light coming through from behind */
    '  if(s.sss > 0.001){',
    '    float wrapd = max((dot(N,L)+0.62)/1.62, 0.0);',
    '    float back = pow(max(dot(V, -normalize(L + N*0.32)), 0.0), 3.2);',
    '    vec3 through = s.sssTint * (wrapd*0.34 + back*0.80) * s.thick * s.sss / PI;',
    '    col += through * lightCol * mix(0.45, 1.0, shadow);',
    '  }',

    /* the wet coat */
    '  if(s.coat > 0.001){',
    '    float ca = max(0.055*0.055, 1e-4);',
    '    float cF = F_Schlick1(0.04, VoH) * s.coat;',
    '    col *= (1.0 - cF*0.85);',
    '    col += vec3(cF * D_GGX(NoH, ca) * V_Smith(NoV, NoL, ca)) * lightCol * NoL * shadow;',
    '  }',
    '  return col;',
    '}',

    'vec3 shadeSurf(vec3 wp, vec3 N, Surf s){',
    '  vec3 V = normalize(uCam - wp);',
    '  float NoL = max(dot(N,uKeyDir), 0.0);',
    '  float sh = shadowAt(wp, NoL);',

    '  vec3 col = lightLobe(N, V, uKeyDir, uKeyColor, s, sh);',
    /* the fill never casts — a second shadow map for a light that
       exists to open the shadows is a contradiction */
    '  col += lightLobe(N, V, uCoolDir, uCoolColor, s, 1.0);',

    /* environment: one diffuse tap, one specular tap, one for the coat */
    '  float NoV = max(dot(N,V), 1e-4);',
    '  vec3 R = reflect(-V, N);',
    '  vec3 f0 = mix(vec3(0.045), s.albedo, s.metal);',
    '  vec3 envSpec = envColor(R, s.rough);',
    '  vec3 envDiff = envColor(N, 1.0);',
    '  vec3 Fenv = F_Schlick(f0, NoV);',
    '  col += (s.albedo*(1.0-s.metal)*envDiff*uAmbient + envSpec*Fenv*mix(1.0,1.7,s.metal)) * s.ao;',
    '  if(s.coat > 0.001){',
    '    col += envColor(R, 0.055) * F_Schlick1(0.04, NoV) * s.coat * s.ao * 1.15;',
    '  }',

    /* a narrow rim so food separates from a near-black table
       without lifting the whole silhouette into a halo */
    /* A rim, not a halo. It is squared off hard and it is gated on
       the key being behind the surface, so it lifts the top edge of
       a prawn off a black table and does nothing at all to the
       edges facing the camera. */
    '  float rim = pow(1.0-NoV, 5.0) * smoothstep(0.0, 0.6, dot(N, uKeyDir)*0.5+0.5);',
    '  col += uRimColor * rim * s.ao;',
    '  return col;',
    '}'
  ].join('\n');

  /* ── object vertex shader ────────────────────────────────── */

  var OBJ_VS = [
    H,
    'layout(location=0) in vec3 aPos;',
    'layout(location=1) in vec3 aNrm;',
    'layout(location=2) in vec2 aUv;',
    'uniform mat4 uViewProj, uModel;',
    'uniform mat3 uNormalMat;',
    'uniform float uTime, uWobble;',
    'out vec3 vWorld;',
    'out vec3 vNrm;',
    'out vec2 vUv;',
    'out vec3 vLocal;',
    'void main(){',
    '  vec3 p = aPos;',
    /* Ingredients in flight get a slow bend rather than a rigid
       rotation. It is one sine per axis and it is the difference
       between a herb leaf falling and a herb leaf being carried. */
    '  if(uWobble > 0.0001){',
    '    float k = uWobble;',
    '    p.x += sin(p.z*2.6 + uTime*1.15) * k * 0.05;',
    '    p.y += sin(p.x*2.2 + uTime*0.93) * k * 0.04;',
    '  }',
    '  vLocal = p;',
    '  vec4 w = uModel * vec4(p, 1.0);',
    '  vWorld = w.xyz;',
    '  vNrm = normalize(uNormalMat * aNrm);',
    '  vUv = aUv;',
    '  gl_Position = uViewProj * w;',
    '}'
  ].join('\n');

  /* ── object fragment shader ──────────────────────────────────
     One shader, fifteen materials. A switch on a uniform costs
     nothing on any GPU made this decade — every fragment in a
     draw call takes the same branch — and one shader means one
     lighting model, which means the chilli and the ceramic under
     it can never end up lit by different rooms. */

  var MAT = {
    PLAIN: 0, PRAWN: 1, CERAMIC: 2, LIQUID: 3, CITRUS: 4, HERB: 5,
    CHILLI: 6, GARLIC: 7, CRUST: 8, NOODLE: 9, METAL: 10, GRAIN: 11,
    TABLE: 12, BUTTER: 13, CHAR: 14
  };

  var OBJ_FS = [
    H, NOISE, ENV, PBR,
    'in vec3 vWorld;',
    'in vec3 vNrm;',
    'in vec2 vUv;',
    'in vec3 vLocal;',
    'uniform vec3 uBase, uTint2, uSSSTint;',
    'uniform float uRough, uMetal, uAlpha, uCoat, uSSS, uDetail, uChar, uTime, uFade;',
    'uniform int uMat;',
    'uniform vec2 uFog;',
    'out vec4 frag;',

    /* Perturb the normal from a height field sampled three times.
       Cheaper than a tangent frame and correct enough for detail
       that is a fraction of a millimetre deep.

       Every normalize here is guarded, and that is not defensive
       programming for its own sake. A screen-space derivative goes
       to zero wherever a surface is degenerate — the fan of
       triangles closing the end of a swept tube, the seam where a
       wrapped grid meets itself — and `normalize(vec3(0))` is a
       NaN. One NaN fragment on the prawn went into the bright
       pass, `NaN/NaN` came out of the knee, and the blur chain
       spread it across a third of the frame as a hard black
       rectangle quantised to the size of the smallest mip. It
       took a while to find, because the shape it made looked far
       more like a shadow bug than a divide. */
    'vec3 bump(vec3 N, float h, float hx, float hy, float amt){',
    '  if(amt <= 0.0001) return N;',
    '  vec3 dx = dFdx(vWorld);',
    '  vec3 t = dx - N*dot(N,dx);',
    '  float tl = length(t);',
    '  if(tl < 1e-6) return N;',
    '  t /= tl;',
    '  vec3 b = cross(N,t);',
    '  float bl = length(b);',
    '  if(bl < 1e-6) return N;',
    '  b /= bl;',
    '  vec3 r = N - (t*(hx-h) + b*(hy-h)) * amt;',
    '  float rl = length(r);',
    '  return rl > 1e-6 ? r/rl : N;',
    '}',

    'void main(){',
    '  vec3 N = normalize(vNrm);',
    '  if(!gl_FrontFacing) N = -N;',
    '  vec3 P = vWorld;',
    '  vec2 uv = vUv;',
    '  float alpha = uAlpha;',

    '  Surf s;',
    '  s.albedo = uBase;',
    '  s.rough = uRough;',
    '  s.metal = uMetal;',
    '  s.ao = 1.0;',
    '  s.coat = uCoat;',
    '  s.sss = uSSS;',
    '  s.sssTint = uSSSTint;',
    '  s.thick = 1.0;',

    /* ── prawn ────────────────────────────────────────────────
       v runs head (0) to tail (1) along the sweep; u runs around.
       Six segments are cut into the mesh's radius, and the colour
       has to land on the same six or the thing looks printed. */
    '  if(uMat == 1){',
    '    float seg = clamp((uv.y - 0.06)/0.80, 0.0, 1.0) * 6.0;',
    '    float f = fract(seg);',
    /* Bulk is meat — pale, warm, barely pink. The coral is the
       pigment the shell left behind, and it sits over the crown of
       each segment and fades toward the joint. An earlier version
       ran the full distance from cream to coral inside every
       segment and the prawn came out striped like a sweet: real
       banding is a shift of about a quarter of that range, with
       one narrow pale line where the shells overlapped. */
    '    float band = smoothstep(0.04, 0.44, f) * (1.0 - smoothstep(0.60, 0.97, f));',
    /* A prawn is not the same colour all the way round. The
       pigment sat in the shell over its back, so the dorsal side
       is coral and the belly — which was under the swimmerets — is
       nearly white. u runs around the body, and the back is at a
       fixed u, so this is one cosine. */
    '    float belly = 0.5 + 0.5*cos((uv.x - 0.25)*6.28318);',
    '    vec3 col = mix(uTint2, uBase, clamp(0.54 + band*0.22 + belly*0.22, 0.0, 1.0));',
    '    float joint = exp(-pow(f-1.0, 2.0)/0.0016) + exp(-pow(f, 2.0)/0.0016);',
    '    col = mix(col, uTint2*1.16, min(joint,1.0)*0.45);',
    /* the dorsal line: the vein groove, dark and narrow, along the
       back — u is around the body, so the back is a fixed u */
    '    float dorsal = exp(-pow((abs(fract(uv.x + 0.25) - 0.5)) - 0.5, 2.0)/0.0012);',
    '    col = mix(col, uBase*0.30, dorsal * 0.55 * smoothstep(0.06,0.2,uv.y) * smoothstep(0.98,0.8,uv.y));',
    /* the tail fan and the very head end go pale and thin */
    '    float tailish = smoothstep(0.86, 1.0, uv.y);',
    /* the fan is shell, not meat: it goes translucent orange-red
       and it is the one place on the prawn light really pours
       through, which is why it is worth a colour of its own */
    '    col = mix(col, uBase*1.12, tailish*0.80);',
    /* mottling: cooked protein is never one flat colour */
    '    float mot = fbm3(P*24.0, 3) + fbm3(P*88.0, 2)*0.5;',
    '    col *= 1.0 + mot*0.20*uDetail;',
    /* char: bands laid across the body where it met the bars */
    '    if(uChar > 0.001){',
    '      float bars = smoothstep(0.62, 0.98, sin(uv.y*30.0 + uv.x*1.4)*0.5+0.5);',
    '      float grain2 = fbm3(P*11.0, 2)*0.5+0.5;',
    '      float burn = bars * grain2 * uChar * smoothstep(0.08,0.25,uv.y);',
    '      col = mix(col, vec3(0.055,0.028,0.016), burn*0.86);',
    '      s.rough = mix(s.rough, 0.62, burn);',
    '    }',
    '    s.albedo = col;',
    /* thin at the tail, thick through the body — the SSS term
       reads this, so light pours through the fan and not the back */
    '    s.thick = mix(1.0, 0.30, tailish) * mix(0.55, 1.0, smoothstep(0.0,0.2,uv.y));',
    /* the wet coat pools in the joints and thins over the bulges */
    /* the wet coat pools in the joints and thins over the bulges —
       and comes almost all the way off over the tail fan, which is
       dry shell rather than wet meat. Left glossy, a fan lit
       face-on from a softbox goes to pure white and blooms. */
    '    s.coat = uCoat * (0.72 + 0.28*(1.0-band)) * (1.0 - tailish*0.80);',
    '    s.rough = mix(s.rough, 0.46, tailish);',
    '    float h  = fbm3(P*58.0, 3);',
    '    float hx = fbm3(P*58.0 + vec3(0.014,0,0), 3);',
    '    float hy = fbm3(P*58.0 + vec3(0,0.014,0), 3);',
    '    N = bump(N, h, hx, hy, 1.35*uDetail);',
    '    s.rough = s.rough * (1.0 + mot*0.10);',
    '  }',

    /* ── glazed ceramic ─────────────────────────────────────── */
    '  else if(uMat == 2){',
    '    float sp = fbm3(P*160.0, 2);',
    '    s.albedo = uBase * (1.0 + sp*0.05*uDetail);',
    /* a glaze is never perfectly even: broad slow variation in
       roughness is what gives a plate its sheet of reflected light
       instead of one mirror-sharp streak */
    '    s.rough = clamp(uRough + fbm3(P*6.0, 2)*0.05*uDetail, 0.02, 1.0);',
    '    float h  = fbm3(P*90.0, 2);',
    '    N = bump(N, h, fbm3(P*90.0+vec3(0.01,0,0),2), fbm3(P*90.0+vec3(0,0.01,0),2), 0.06*uDetail);',
    '  }',

    /* ── a pool of sauce ──────────────────────────────────────
       v is 0 at the middle of the pool and 1 at its edge. Thin
       liquid takes the colour of what is under it near the rim and
       its own colour in the middle; the bright line just inside
       the edge is the meniscus, and it is the single detail that
       makes a disc read as wet. */
    '  else if(uMat == 3){',
    '    float edge = smoothstep(0.80, 1.0, uv.y);',
    '    float flow = fbm3(vec3(P.xz*7.0, uTime*0.06), 3);',
    '    s.albedo = mix(uBase, uTint2, edge*0.55 + flow*0.10);',
    '    s.rough = mix(0.055, 0.14, edge) + flow*0.02;',
    '    s.coat = 1.0;',
    '    s.thick = 1.0 - edge*0.6;',
    /* The meniscus. Surface tension pulls liquid up against
       whatever it is touching, and that lip catches a bright line
       a hair inside the edge. Without it a pool of sauce is a
       yellow disc lying on a plate like a sticker — which is
       exactly what the first version of this looked like. */
    '    float lip = exp(-pow(uv.y - 0.955, 2.0)/0.00035);',
    '    s.albedo += uTint2 * lip * 0.55;',
    '    s.rough = mix(s.rough, 0.035, lip);',
    /* slow ripple, tiny amplitude — sauce settling, not water */
    '    float h  = fbm3(vec3(P.xz*16.0, uTime*0.10), 2);',
    '    N = bump(N, h, fbm3(vec3((P.xz+vec2(0.01,0.0))*16.0, uTime*0.10),2),',
    '                   fbm3(vec3((P.xz+vec2(0.0,0.01))*16.0, uTime*0.10),2), 0.12*uDetail);',
    /* and the film thins to nothing at the very rim, so there is
       no cut line between sauce and plate */
    '    alpha = uAlpha * (1.0 - smoothstep(0.955, 1.0, uv.y)*0.92) + lip*0.25;',
    '    alpha = clamp(alpha, 0.0, 1.0);',
    '  }',

    /* ── citrus ───────────────────────────────────────────────
       Radial segments across u, a white pith band, then rind with
       its oil pits. All three are one mesh and one draw. */
    '  else if(uMat == 4){',
    '    float r = uv.y;',
    '    float segn = abs(fract(uv.x*4.0)-0.5)*2.0;',
    '    float wall = smoothstep(0.80, 0.99, segn);',
    '    vec3 flesh = mix(uBase, uBase*1.35+vec3(0.05), wall*0.7);',
    /* juice vesicles: long cells running out from the centre */
    '    float ves = ridged(vec3(uv.x*70.0, r*26.0, 0.0), 2);',
    '    flesh *= 0.86 + ves*0.42;',
    '    float pith = smoothstep(0.80, 0.90, r) * (1.0 - smoothstep(0.93, 0.985, r));',
    '    float rind = smoothstep(0.93, 0.97, r);',
    '    vec3 col = mix(flesh, vec3(0.86,0.83,0.74), pith);',
    '    col = mix(col, uTint2, rind);',
    /* the oil pits in the peel */
    '    float pits = fbm3(P*120.0, 2);',
    '    col *= 1.0 + pits*0.22*rind;',
    '    s.albedo = col;',
    '    s.rough = mix(0.16, 0.46, rind) + pith*0.34;',
    '    s.coat = mix(0.85, 0.25, rind);',
    '    s.sss = uSSS * (1.0 - rind*0.75);',
    '    s.thick = 1.0 - r*0.35;',
    '    float h = fbm3(P*(mix(60.0,150.0,rind)), 2);',
    '    N = bump(N, h, fbm3(P*mix(60.0,150.0,rind)+vec3(0.01,0,0),2),',
    '                    fbm3(P*mix(60.0,150.0,rind)+vec3(0,0.01,0),2), (0.10+0.34*rind)*uDetail);',
    '  }',

    /* ── herb ─────────────────────────────────────────────────
       Two-sided and thin: the underside is paler and the veins
       show through it, which is what a leaf lying in shade does. */
    '  else if(uMat == 5){',
    '    float rib = exp(-pow(uv.x-0.5, 2.0)/0.0009);',
    '    float veins = 0.0;',
    '    for(int i=0;i<3;i++){',
    '      float o = float(i)*0.16 + 0.12;',
    '      veins += exp(-pow(abs(uv.x-0.5) - (o + uv.y*0.10), 2.0)/0.0016);',
    '    }',
    /* The midrib is the pale part of a leaf and the edges are the
       dark part. An earlier version faded the whole tip toward the
       lighter tone instead, which made every leaf look like it had
       been dipped in something. */
    '    vec3 col = uBase * (1.0 - veins*0.12);',
    '    col = mix(col, uTint2, rib*0.42);',
    '    col *= 0.82 + 0.30*(1.0 - abs(uv.x-0.5)*2.0);',
    '    s.albedo = col;',
    '    s.thick = 1.0;',
    '    s.rough = uRough - rib*0.10;',
    '  }',

    /* ── chilli ───────────────────────────────────────────────
       Wax on skin: very smooth, very saturated, and the wrinkles
       are in the mesh, so all that is left here is the sheen and
       the paler flesh where it was cut. */
    '  else if(uMat == 6){',
    '    float wax = fbm3(P*30.0, 2);',
    '    s.albedo = uBase * (1.0 + wax*0.10);',
    '    s.rough = clamp(uRough + wax*0.05, 0.03, 1.0);',
    '    s.coat = uCoat;',
    '    s.thick = 0.7;',
    '    float top = smoothstep(0.90, 1.0, uv.y);',
    '    s.albedo = mix(s.albedo, uTint2, top);',
    '  }',

    /* ── garlic ───────────────────────────────────────────────
       Fibres run the length of a clove and catch light in lines,
       which is why sliced garlic goes translucent at the edges. */
    '  else if(uMat == 7){',
    '    float fib = ridged(vec3(uv.x*46.0, uv.y*7.0, 0.0), 2);',
    '    s.albedo = uBase * (0.90 + fib*0.24);',
    '    s.rough = uRough - fib*0.08;',
    '    s.thick = 0.85;',
    '    N = bump(N, fib, ridged(vec3(uv.x*46.0+0.15, uv.y*7.0,0.0),2), fib, 0.08*uDetail);',
    '  }',

    /* ── fried crust ──────────────────────────────────────────
       Deep ridged noise, golden on the ridges and dark in the
       crevices, plus enough roughness variation that the whole
       thing never catches one broad highlight. */
    '  else if(uMat == 8){',
    '    float c1 = ridged(P*13.0, 3);',
    '    float c2 = fbm3(P*40.0, 3);',
    '    float k = clamp(c1*0.75 + c2*0.35, 0.0, 1.4);',
    '    s.albedo = mix(uTint2, uBase, smoothstep(0.25, 0.95, k));',
    '    s.rough = clamp(0.44 + (1.0-k)*0.30, 0.2, 0.95);',
    '    s.coat = uCoat * smoothstep(0.4, 1.0, k) * 0.5;',
    '    s.ao = mix(0.62, 1.0, smoothstep(0.1, 0.8, k));',
    '    N = bump(N, c2, fbm3(P*40.0+vec3(0.012,0,0),3), fbm3(P*40.0+vec3(0,0.012,0),3), 0.85*uDetail);',
    '  }',

    /* ── pasta ────────────────────────────────────────────────
       Squid-ink linguine: near-black, and the only way it reads as
       anything but a void is the long sheen running down each
       ribbon and the oil sitting on it. */
    '  else if(uMat == 9){',
    '    float sheen = pow(abs(sin(uv.x*3.14159)), 3.0);',
    '    float flour = fbm3(P*70.0, 2);',
    '    s.albedo = uBase * (1.0 + flour*0.20) + uTint2*sheen*0.55;',
    '    s.rough = clamp(uRough - sheen*0.14 + flour*0.05, 0.05, 1.0);',
    '    s.coat = uCoat;',
    '  }',

    /* ── cast iron ────────────────────────────────────────────
       Seasoned, not polished: a pitted surface that scatters the
       key into a wide soft sheet instead of a point. */
    '  else if(uMat == 10){',
    '    float pit = fbm3(P*70.0, 3);',
    '    float wear = fbm3(P*8.0, 2);',
    '    s.albedo = uBase * (1.0 + wear*0.22 + pit*0.10);',
    '    s.rough = clamp(uRough + pit*0.16 + wear*0.10, 0.12, 1.0);',
    '    N = bump(N, pit, fbm3(P*70.0+vec3(0.01,0,0),3), fbm3(P*70.0+vec3(0,0.01,0),3), 0.30*uDetail);',
    '  }',

    /* ── rice ─────────────────────────────────────────────────
       Pearl: translucent, low roughness, and each grain reads
       because the mesh has each grain in it. */
    '  else if(uMat == 11){',
    '    float g = fbm3(P*90.0, 2);',
    '    s.albedo = uBase * (0.94 + g*0.14);',
    '    s.rough = clamp(uRough + g*0.06, 0.05, 1.0);',
    '    s.thick = 0.8;',
    '  }',

    /* ── the table ────────────────────────────────────────────
       Dark oiled oak. Grain runs along Z, the boards along X, and
       the whole thing falls off into black well before it reaches
       an edge, because the room this is lit in has no far wall. */
    '  else if(uMat == 12){',
    /* Grain runs along Z and boards along X.

       Value noise built on a sin-hash goes to a visible diagonal
       lattice when one axis is stretched forty-odd times more than
       the other — the first table on this page had a diamond
       trellis printed across it. Stretching less and warping the
       lookup with a second, isotropic sample breaks the lattice
       up while keeping the grain directional. */
    '    vec2 q = P.xz;',
    '    float warp = fbm3(vec3(q*2.7, 11.3), 2);',
    '    float grain = ridged(vec3(q.x*3.4 + warp*0.35, q.y*17.0, 4.7), 3);',
    '    float board = smoothstep(0.015, 0.075, abs(fract(q.x*0.19)-0.5));',
    '    float knots = fbm3(vec3(q*1.1, 0.0), 2);',
    '    vec3 col = mix(uBase, uTint2, grain*0.55 + knots*0.25);',
    '    col *= mix(0.72, 1.0, board);',
    '    s.albedo = col;',
    '    s.rough = clamp(uRough - grain*0.10 + knots*0.06, 0.06, 1.0);',
    '    s.ao = mix(0.86, 1.0, board);',
    '    N = bump(N, grain, ridged(vec3(q.x*2.2+0.02, q.y*46.0,0.0),3),',
    '                        ridged(vec3(q.x*2.2, q.y*46.0+0.4,0.0),3), 0.14*uDetail);',
    /* the pool of light this room has, and nothing beyond it */
    '    float d = length(q);',
    '    s.ao *= exp(-d*d*uFog.y) + uFog.x;',
    '  }',

    /* ── butter ───────────────────────────────────────────────
       Solid fat is a waxy translucent — a lot of subsurface, very
       little specular, and it goes glassy where it has started to
       go. */
    '  else if(uMat == 13){',
    '    float melt = fbm3(P*20.0, 3);',
    '    s.albedo = uBase * (1.0 + melt*0.08);',
    '    s.rough = clamp(uRough + melt*0.10, 0.08, 1.0);',
    '    s.thick = 1.0;',
    '    N = bump(N, melt, fbm3(P*20.0+vec3(0.02,0,0),3), fbm3(P*20.0+vec3(0,0.02,0),3), 0.22*uDetail);',
    '  }',

    /* ── charred wood ─────────────────────────────────────────── */
    '  else if(uMat == 14){',
    '    float ch = fbm3(vec3(uv.x*8.0, uv.y*40.0, 0.0), 3);',
    '    float burn = smoothstep(0.25, 0.75, uv.y);',
    '    s.albedo = mix(uBase, uTint2, burn*0.8 + ch*0.2);',
    '    s.rough = clamp(uRough + ch*0.12, 0.2, 1.0);',
    '  }',

    '  vec3 col = shadeSurf(P, N, s);',
    /* A single non-finite fragment anywhere in the scene ends up
       spread over the whole frame by the blur chain, so it is
       caught here rather than left for the bright pass to
       propagate. The ceiling is far above anything the grade will
       keep, and well below where half-float stops being able to
       add. */
    '  if(any(isnan(col)) || any(isinf(col))) col = vec3(0.0);',
    '  frag = vec4(clamp(col, 0.0, 48.0) * uFade, alpha);',
    '}'
  ].join('\n');

  /* ── shadow depth ────────────────────────────────────────── */

  var DEPTH_VS = [
    H,
    'layout(location=0) in vec3 aPos;',
    'uniform mat4 uLightViewProj, uModel;',
    'void main(){ gl_Position = uLightViewProj * uModel * vec4(aPos,1.0); }'
  ].join('\n');

  var DEPTH_FS = [H, 'void main(){}'].join('\n');

  /* ── steam ───────────────────────────────────────────────────
     Not a raymarch. Two stages run on this page and a volumetric
     pass in each of them is a GPU's whole budget spent on
     something that is, in the end, a soft grey shape.

     These are camera-facing quads with an fbm cloud in them,
     soft-clipped against scene depth so a plume can pass behind a
     prawn without a hard edge, and drifting on the same noise the
     CPU uses to move them. Forty of them cost less than sixteen
     raymarch steps and — because each one is lit by the key from
     the side — they have form rather than being a flat wash. */

  var SPRITE_VS = [
    H,
    'layout(location=0) in vec3 aPos;',
    'layout(location=1) in vec3 aNrm;',
    'layout(location=2) in vec2 aUv;',
    'layout(location=3) in vec4 iPos;',    /* xyz world, w size */
    'layout(location=4) in vec4 iData;',   /* x opacity, y rotation, z seed, w warp */
    'uniform mat4 uViewProj;',
    'uniform vec3 uRight, uUp;',
    'out vec2 vUv;',
    'out float vOpacity;',
    'out float vSeed;',
    'out float vWarp;',
    'out vec4 vClip;',
    'void main(){',
    '  vec2 q = (aUv - 0.5) * 2.0;',
    '  float c = cos(iData.y), s = sin(iData.y);',
    '  vec2 r = vec2(q.x*c - q.y*s, q.x*s + q.y*c) * iPos.w;',
    '  vec3 wp = iPos.xyz + uRight*r.x + uUp*r.y;',
    '  vUv = aUv; vOpacity = iData.x; vSeed = iData.z; vWarp = iData.w;',
    '  vClip = uViewProj * vec4(wp, 1.0);',
    '  gl_Position = vClip;',
    '}'
  ].join('\n');

  var SPRITE_FS = [
    H, NOISE,
    'in vec2 vUv; in float vOpacity; in float vSeed; in float vWarp; in vec4 vClip;',
    'uniform sampler2D uDepth;',
    'uniform vec3 uTint, uLit;',
    'uniform float uTime, uNear, uFar, uSoft;',
    'uniform vec2 uRes;',
    'out vec4 frag;',
    'float linearDepth(float d){ float z = d*2.0-1.0; return (2.0*uNear*uFar)/(uFar+uNear-z*(uFar-uNear)); }',
    'void main(){',
    '  vec2 q = vUv*2.0 - 1.0;',
    '  float r = length(q);',
    '  if(r > 1.0) discard;',
    /* the cloud, warped so no two puffs are the same shape */
    '  float n = fbm3(vec3(q*2.1 + vSeed*13.0, uTime*0.20 + vSeed*7.0), 3);',
    '  float shape = (1.0 - r) + n*vWarp;',
    '  float a = smoothstep(0.0, 0.62, shape) * vOpacity;',
    '  if(a <= 0.002) discard;',
    /* soft against whatever is behind it */
    '  vec2 su = gl_FragCoord.xy / uRes;',
    '  float sceneZ = linearDepth(texture(uDepth, su).r);',
    '  float myZ = linearDepth(gl_FragCoord.z);',
    '  a *= clamp((sceneZ - myZ)/uSoft, 0.0, 1.0);',
    /* form: light falls on the side of the puff the key is on */
    '  float lit = smoothstep(-0.7, 0.9, -q.x*0.7 + q.y*0.7 + n*0.5);',
    '  vec3 col = mix(uTint, uLit, lit);',
    '  frag = vec4(col*a, a);',
    '}'
  ].join('\n');

  /* ── fullscreen passes ───────────────────────────────────── */

  var FS_VS = [
    H,
    'layout(location=0) in vec2 aPos;',
    'out vec2 vUv;',
    'void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }'
  ].join('\n');

  /* The room behind the food. Not a gradient sheet: the same
     analytic environment the reflections are sampled from, so what
     you see behind the plate and what you see reflected in it are
     the same room. */
  var BACKDROP_FS = [
    H, NOISE, ENV,
    'in vec2 vUv;',
    'uniform mat4 uInvViewProj;',
    'uniform vec3 uCam;',
    'uniform float uTime, uRoomAmt, uHazeAmt;',
    'uniform vec3 uHazeColor;',
    'out vec4 frag;',
    'void main(){',
    '  vec4 h = uInvViewProj * vec4(vUv*2.0-1.0, 1.0, 1.0);',
    '  vec3 d = normalize(h.xyz/h.w - uCam);',
    '  vec3 col = envColor(d, 0.62) * uRoomAmt;',
    '  float k = max(dot(d, uKeyDir), 0.0);',
    '  col += uEnvKey * pow(k, 7.0) * 0.22 * uRoomAmt;',
    /* very slow drift so the dark is never a flat plate of black */
    '  float haze = fbm3(vec3(d.xy*2.4, uTime*0.015), 3)*0.5+0.5;',
    '  col += uHazeColor * haze * uHazeAmt;',
    '  frag = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var BRIGHT_FS = [
    H,
    'in vec2 vUv;',
    'uniform sampler2D uScene;',
    'uniform float uThreshold, uKnee;',
    'out vec4 frag;',
    'void main(){',
    '  vec3 c = texture(uScene, vUv).rgb;',
    '  float l = max(c.r, max(c.g, c.b));',
    '  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0*uKnee);',
    '  soft = soft*soft/(4.0*uKnee + 1e-5);',
    '  float w = max(soft, l - uThreshold)/max(l, 1e-5);',
    '  frag = vec4(c*w, 1.0);',
    '}'
  ].join('\n');

  /* 13-tap down / 9-tap tent up — the pairing that gives a bloom
     without the stair-stepping a naive box chain has. */
  var DOWN_FS = [
    H,
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',
    'out vec4 frag;',
    'void main(){',
    '  vec2 t = uTexel;',
    '  vec3 a = texture(uTex, vUv + t*vec2(-1,-1)).rgb;',
    '  vec3 b = texture(uTex, vUv + t*vec2( 1,-1)).rgb;',
    '  vec3 c = texture(uTex, vUv + t*vec2(-1, 1)).rgb;',
    '  vec3 d = texture(uTex, vUv + t*vec2( 1, 1)).rgb;',
    '  vec3 e = texture(uTex, vUv).rgb;',
    '  vec3 f = texture(uTex, vUv + t*vec2(-2, 0)).rgb;',
    '  vec3 g = texture(uTex, vUv + t*vec2( 2, 0)).rgb;',
    '  vec3 hh= texture(uTex, vUv + t*vec2( 0,-2)).rgb;',
    '  vec3 i = texture(uTex, vUv + t*vec2( 0, 2)).rgb;',
    '  frag = vec4(e*0.25 + (a+b+c+d)*0.125 + (f+g+hh+i)*0.0625, 1.0);',
    '}'
  ].join('\n');

  var UP_FS = [
    H,
    'in vec2 vUv;',
    'uniform sampler2D uTex, uPrev;',
    'uniform vec2 uTexel;',
    'uniform float uRadius, uPrevAmt;',
    'out vec4 frag;',
    'void main(){',
    '  vec2 t = uTexel*uRadius;',
    '  vec3 c = vec3(0.0);',
    '  c += texture(uTex, vUv + t*vec2(-1,-1)).rgb * 1.0;',
    '  c += texture(uTex, vUv + t*vec2( 0,-1)).rgb * 2.0;',
    '  c += texture(uTex, vUv + t*vec2( 1,-1)).rgb * 1.0;',
    '  c += texture(uTex, vUv + t*vec2(-1, 0)).rgb * 2.0;',
    '  c += texture(uTex, vUv                ).rgb * 4.0;',
    '  c += texture(uTex, vUv + t*vec2( 1, 0)).rgb * 2.0;',
    '  c += texture(uTex, vUv + t*vec2(-1, 1)).rgb * 1.0;',
    '  c += texture(uTex, vUv + t*vec2( 0, 1)).rgb * 2.0;',
    '  c += texture(uTex, vUv + t*vec2( 1, 1)).rgb * 1.0;',
    '  c /= 16.0;',
    '  frag = vec4(c + texture(uPrev, vUv).rgb * uPrevAmt, 1.0);',
    '}'
  ].join('\n');

  /* ── depth of field ──────────────────────────────────────────
     A real one — gather, with a proper CoC and a near field — is
     six or seven taps per pixel plus a separate near/far
     resolution, and none of that is affordable twice on one page.

     This is the cheap correct-enough version: the scene, blurred
     once at quarter resolution, mixed back in by a circle of
     confusion computed from linear depth. Food photography is shot
     at f/2.8 on a macro lens, so the near and far fields fall away
     within centimetres, and a plate rendered without that reads as
     a diagram of a plate. */
  var DOF_FS = [
    H,
    'in vec2 vUv;',
    'uniform sampler2D uScene, uSoft, uDepth;',
    'uniform float uNear, uFar, uFocus, uRange, uAmount, uMaxCoC;',
    'out vec4 frag;',
    'float linearDepth(float d){ float z = d*2.0-1.0; return (2.0*uNear*uFar)/(uFar+uNear-z*(uFar-uNear)); }',
    'void main(){',
    '  float z = linearDepth(texture(uDepth, vUv).r);',
    '  float coc = clamp(abs(z - uFocus)/max(uRange,1e-3), 0.0, 1.0);',
    '  coc = pow(coc, 1.35) * uAmount;',
    '  coc = min(coc, uMaxCoC);',
    '  vec3 sharp = texture(uScene, vUv).rgb;',
    '  vec3 soft  = texture(uSoft,  vUv).rgb;',
    '  frag = vec4(mix(sharp, soft, coc), 1.0);',
    '}'
  ].join('\n');

  /* ── composite ───────────────────────────────────────────────
     Shared by both stages. ACES, then a warm grade, a vignette
     that is an aperture rather than a black frame, one channel of
     aberration at the very edges, and grain — which is the last
     thing standing between a clean render and something that
     looks like it came out of a camera. */
  var COMPOSITE_FS = [
    H, NOISE,
    'in vec2 vUv;',
    'uniform sampler2D uScene, uBloom;',
    'uniform float uTime, uBloomAmt, uExposure, uVignette, uGrain, uAberration, uFade, uWarmth, uLift;',
    'uniform vec2 uRes;',
    'out vec4 frag;',

    'vec3 aces(vec3 x){',
    '  const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;',
    '  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);',
    '}',

    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 off = (uv - 0.5);',
    '  float r2 = dot(off, off);',
    /* aberration is zero in the middle and only ever shows at the
       corners, which is where a real lens has it */
    '  float ab = uAberration * r2;',
    '  vec3 col;',
    '  col.r = texture(uScene, uv - off*ab).r;',
    '  col.g = texture(uScene, uv).g;',
    '  col.b = texture(uScene, uv + off*ab).b;',

    '  col += texture(uBloom, uv).rgb * uBloomAmt;',
    '  col *= uExposure;',

    /* warm the highlights, cool the shadows — one stop of split
       tone, which is what the room is doing anyway */
    '  float l = dot(col, vec3(0.2126,0.7152,0.0722));',
    '  col = mix(col, col * vec3(1.06,1.0,0.93), uWarmth*smoothstep(0.2,1.2,l));',
    '  col = mix(col, col * vec3(0.95,0.99,1.06), uWarmth*(1.0-smoothstep(0.0,0.35,l)));',

    '  col = aces(col);',

    /* a lifted black point: pure 0,0,0 in a photograph of a dark
       room does not happen, and a page full of it reads as a hole */
    '  col = mix(col, col*(1.0-uLift) + vec3(uLift)*vec3(0.09,0.075,0.072), 1.0);',

    '  float vig = smoothstep(1.05, 0.20, length(off*vec2(1.0, uRes.y/uRes.x))*1.42);',
    '  col *= mix(1.0, vig, uVignette);',

    '  float g = hash12(gl_FragCoord.xy + fract(uTime)*311.7)*2.0-1.0;',
    '  col += g * uGrain * (0.35 + 0.65*(1.0-smoothstep(0.0,0.5,dot(col,vec3(0.333)))));',

    '  frag = vec4(max(col,0.0) * uFade, 1.0);',
    '}'
  ].join('\n');

  /* Straight copy, used to get the graded 8-bit result onto the
     canvas — and, at boot, to have something readPixels can pull a
     thumbnail out of without asking for a preserved drawing
     buffer. */
  var BLIT_FS = [
    H,
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'out vec4 frag;',
    'void main(){ frag = vec4(texture(uTex, vUv).rgb, 1.0); }'
  ].join('\n');

  SH.MAT = MAT;
  SH.objVS = OBJ_VS;
  SH.objFS = OBJ_FS;
  SH.depthVS = DEPTH_VS;
  SH.depthFS = DEPTH_FS;
  SH.spriteVS = SPRITE_VS;
  SH.spriteFS = SPRITE_FS;
  SH.fsVS = FS_VS;
  SH.backdrop = BACKDROP_FS;
  SH.bright = BRIGHT_FS;
  SH.down = DOWN_FS;
  SH.up = UP_FS;
  SH.dof = DOF_FS;
  SH.composite = COMPOSITE_FS;
  SH.blit = BLIT_FS;

})(window);
