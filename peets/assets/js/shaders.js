/* ═══════════════════════════════════════════════════════════
   shaders.js — GLSL ES 3.00 for the whole film.

   Written as chunks that get concatenated, because the object
   shader compiles twice (instanced and not) and the depth shader
   has to deform vertices exactly the same way the colour shader
   does or the shadows detach from the objects casting them.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PEET = (global.PEET = global.PEET || {});
  /* int precision has to be stated: the ES 3.00 default is highp in
     a vertex shader and mediump in a fragment shader, and a uniform
     shared across both then fails to link */
  var H = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

  /* ── noise, matched to the CPU implementation in math.js ─── */

  var NOISE = [
    'float hash13(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453123); }',
    'float hash12(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }',
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
    '  float a=0.5, s=0.0; ',
    '  for(int i=0;i<6;i++){ if(i>=oct) break; s += a*noise3(p); p*=2.02; a*=0.5; }',
    '  return s;',
    '}',
    'float fbm2(vec2 p, int oct){ return fbm3(vec3(p,0.0), oct); }',
    'mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }'
  ].join('\n');

  /* ── environment ─────────────────────────────────────────────
     There is no cubemap in this project. Reflections come from an
     analytic café: a dark warm room, one broad window in the sun
     direction, a warm bounce off the table below. Roughness widens
     the window lobe, which is what makes ceramic, steel and glass
     read as different materials under the same light. */

  var ENV = [
    'uniform vec3 uEnvTop, uEnvFloor, uEnvWindow, uEnvBounce;',
    'vec3 envColor(vec3 d, vec3 sunDir, float rough){',
    '  float up = d.y*0.5+0.5;',
    '  vec3 c = mix(uEnvFloor, uEnvTop, pow(up, 0.75));',
    '  float w = max(dot(d, sunDir), 0.0);',
    '  float tight = mix(90.0, 1.6, rough*rough);',
    '  c += uEnvWindow * pow(w, tight) * mix(1.0, 0.22, rough);',
    '  c += uEnvBounce * pow(max(-d.y,0.0), 1.6) * (0.5+0.5*rough);',
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

    'uniform sampler2D uShadowMap;',
    'uniform mat4 uShadowMat;',
    'uniform float uShadowStrength;',
    'uniform vec2 uShadowTexel;',

    /* 3×3 PCF with a slope-scaled bias. Soft enough that the cup
       lands on the saucer instead of hovering over a hard stencil. */
    'float shadowAt(vec3 wp, float NoL){',
    '  if(uShadowStrength <= 0.001) return 1.0;',
    '  vec4 sc = uShadowMat * vec4(wp,1.0);',
    '  vec3 p = sc.xyz/sc.w * 0.5 + 0.5;',
    '  if(p.x<0.002||p.x>0.998||p.y<0.002||p.y>0.998||p.z>1.0) return 1.0;',
    '  float bias = mix(0.0016, 0.0003, NoL);',
    '  float s = 0.0;',
    '  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){',
    '    float d = texture(uShadowMap, p.xy + vec2(float(x),float(y))*uShadowTexel).r;',
    '    s += step(p.z - bias, d);',
    '  }',
    '  s /= 9.0;',
    '  return mix(1.0, s, uShadowStrength);',
    '}',

    'uniform vec3 uSunDir, uSunColor, uAmbient, uRimColor;',
    'uniform vec3 uCam;',

    'vec3 shade(vec3 wp, vec3 N, vec3 albedo, float rough, float metal, float ao, float shadowMul){',
    '  vec3 V = normalize(uCam - wp);',
    '  vec3 L = uSunDir;',
    '  vec3 Hv = normalize(V+L);',
    '  float NoV = max(dot(N,V), 1e-4);',
    '  float NoL = max(dot(N,L), 0.0);',
    '  float NoH = max(dot(N,Hv), 0.0);',
    '  float VoH = max(dot(V,Hv), 0.0);',
    '  float a = max(rough*rough, 0.0015);',
    '  vec3 f0 = mix(vec3(0.045), albedo, metal);',
    '  float sh = shadowAt(wp, NoL) * shadowMul;',

    /* direct */
    '  vec3 F = F_Schlick(f0, VoH);',
    '  vec3 spec = F * D_GGX(NoH,a) * V_Smith(NoV,NoL,a);',
    '  vec3 kd = (1.0-F)*(1.0-metal);',
    '  vec3 direct = (kd*albedo/PI + spec) * uSunColor * NoL * sh;',

    /* environment: one diffuse tap, one specular tap */
    '  vec3 R = reflect(-V, N);',
    '  vec3 envSpec = envColor(R, uSunDir, rough);',
    '  vec3 envDiff = envColor(N, uSunDir, 1.0);',
    '  vec3 Fenv = F_Schlick(f0, NoV);',
    '  vec3 ambient = (albedo*(1.0-metal)*envDiff*uAmbient + envSpec*Fenv*mix(1.0,1.6,metal)) * ao;',

    /* a narrow warm rim so objects separate from a near-black
       ground without lifting the whole silhouette */
    '  float rim = pow(1.0-NoV, 3.5);',
    '  vec3 rimC = uRimColor * rim * (0.35+0.65*max(dot(N,L)*0.5+0.5,0.0));',

    '  return direct + ambient + rimC;',
    '}'
  ].join('\n');

  /* ── object vertex shader ───────────────────────────────────
     One source, two compiles. INSTANCED pulls the transform from
     per-instance attributes; otherwise it comes from uModel. */

  var OBJ_VS = [
    'layout(location=0) in vec3 aPos;',
    'layout(location=1) in vec3 aNrm;',
    'layout(location=2) in vec2 aUv;',
    '#ifdef INSTANCED',
    'layout(location=3) in vec4 iPosScale;',
    'layout(location=4) in vec4 iQuat;',
    'layout(location=5) in vec4 iTint;',
    'layout(location=6) in vec4 iScale3;',
    'out vec4 vTint;',
    '#endif',
    'uniform mat4 uViewProj, uModel;',
    'uniform mat3 uNormalMat;',
    'uniform float uTime;',
    'uniform int uMat;',
    'uniform vec4 uDeform;',   /* stream twist/wobble/taper/phase */
    'out vec3 vWPos, vNrm, vLocal;',
    'out vec2 vUv;',

    'vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }',
    'mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }',

    /* The liquid streams are one static tube deformed at draw time:
       it twists as it falls, thins under gravity, and wanders. Doing
       it here rather than on the CPU keeps the whole pour to a
       single buffer and a single draw call. */
    'vec3 deformStream(vec3 p){',
    '  float t = -p.y;',
    '  float fall = uDeform.x;',
    '  float amp = uDeform.y;',
    '  float twist = uDeform.z;',
    '  float ph = uDeform.w;',
    '  p.xz *= 1.0 - clamp(t*0.16, 0.0, 0.55) * fall;',
    '  p.xz = rot2(t*twist + ph) * p.xz;',
    '  p.x += sin(t*2.3 + ph*3.0 + uTime*1.4)*amp*t*0.25;',
    '  p.z += cos(t*1.9 + ph*2.2 + uTime*1.1)*amp*t*0.25;',
    '  return p;',
    '}',

    'void main(){',
    '  vec3 p = aPos;',
    '  vec3 n = aNrm;',
    '  if(uMat == 4) p = deformStream(p);',
    '#ifdef INSTANCED',
    '  vTint = iTint;',
    /* non-uniform instance scale is what lets a hundred machine
       parts — rails, bolts, panels, vents — come out of one box
       mesh and one draw call; the normal takes the inverse scale */
    '  vec3 s3 = max(iScale3.xyz, vec3(1e-4));',
    '  p = qrot(iQuat, p * s3 * iPosScale.w) + iPosScale.xyz;',
    '  n = normalize(qrot(iQuat, n / s3));',
    '  vLocal = aPos;',
    '  vWPos = p;',
    '  vNrm = n;',
    '#else',
    '  vLocal = p;',
    '  vec4 wp = uModel * vec4(p,1.0);',
    '  vWPos = wp.xyz;',
    '  vNrm = uNormalMat * n;',
    '#endif',
    '  vUv = aUv;',
    '  gl_Position = uViewProj * vec4(vWPos,1.0);',
    '}'
  ].join('\n');

  /* ── object fragment shader ───────────────────────────────── */

  var OBJ_FS = [
    NOISE, ENV, PBR,
    'in vec3 vWPos, vNrm, vLocal;',
    'in vec2 vUv;',
    '#ifdef INSTANCED',
    'in vec4 vTint;',
    '#endif',
    'uniform vec3 uBase, uEmissive;',
    'uniform float uRough, uMetal, uAlpha, uTime, uFade, uDetail;',
    'uniform int uMat;',
    /* liquid surface */
    'uniform sampler2D uArtTex;',
    'uniform vec4 uLiquid;',   /* x radius, y crema, z swirl angle, w art reveal */
    'uniform vec4 uPour;',     /* xy impact point, z strength, w art opacity */
    'uniform vec2 uFog;',      /* x start distance, y density */
    'out vec4 frag;',

    /* ── the coffee surface ───────────────────────────────────
       Espresso under crema. The crema is domain-warped fbm rather
       than a texture so it keeps swirling with the liquid, and it
       banks up against the wall the way real crema does. */
    'void surfaceCoffee(out vec3 albedo, out float rough, out vec3 N){',
    '  float R = uLiquid.x;',
    '  vec2 q = vLocal.xz / R;',
    '  float rr = clamp(length(q), 0.0, 1.4);',
    /* vortex: the middle turns faster than the edge */
    '  vec2 sq = rot2(uLiquid.z * (1.0 - rr*0.55)) * q;',
    '  vec2 w = sq*2.4 + vec2(fbm2(sq*2.1 + uTime*0.05, 3), fbm2(sq*2.1 + 9.7 - uTime*0.04, 3))*0.75;',
    '  float c = fbm3(vec3(w*1.9, uTime*0.06), 4)*0.5 + 0.5;',
    '  float bubbles = fbm3(vec3(sq*26.0, uTime*0.15), 2)*0.5+0.5;',

    '  vec3 espresso = vec3(0.055, 0.021, 0.010);',
    '  vec3 crema    = vec3(0.62, 0.34, 0.135);',
    '  vec3 cremaHi  = vec3(0.86, 0.59, 0.30);',

    '  float cm = smoothstep(0.34, 0.78, c) * uLiquid.y;',
    /* the ring where crema piles against the ceramic */
    '  cm = max(cm, smoothstep(0.66, 0.99, rr) * uLiquid.y * 0.95);',
    '  albedo = mix(espresso, crema, cm);',
    '  albedo = mix(albedo, cremaHi, smoothstep(0.55,0.95,bubbles)*cm*0.55);',

    /* ripples from where the stream is landing */
    '  float d = length(q - uPour.xy);',
    '  float ripple = sin(d*46.0 - uTime*9.0) * exp(-d*4.2) * uPour.z;',

    /* latte art, revealed in the order it was pulled */
    '  vec4 art = texture(uArtTex, sq*0.5 + 0.5);',
    '  float reveal = smoothstep(art.g - 0.03, art.g + 0.09, uLiquid.w);',
    '  float milk = art.r * reveal * uPour.w;',
    '  vec3 milkC = vec3(0.93, 0.87, 0.775);',
    '  albedo = mix(albedo, milkC, milk);',
    /* milk sits slightly proud and is glossier than crema */
    '  rough = mix(mix(0.22, 0.42, cm), 0.16, milk);',

    /* normal from the sum of ripple + crema relief + art edge */
    '  float relief = (c-0.5)*0.05*cm + ripple*0.02 + art.b*milk*0.06;',
    '  float e = 0.006;',
    '  vec2 dxy = vec2(0.0);',
    '  dxy.x = (sin((d+e)*46.0 - uTime*9.0)*exp(-(d+e)*4.2) - sin((d-e)*46.0 - uTime*9.0)*exp(-(d-e)*4.2)) * uPour.z;',
    '  N = normalize(vec3(-(relief*3.0 + dxy.x)*1.6, 1.0, -(relief*3.0)*1.6));',
    /* the meniscus curls up at the wall */
    '  float men = smoothstep(0.86, 1.0, rr);',
    '  N = normalize(mix(N, normalize(vec3(-q.x, 0.85, -q.y)), men*0.75));',
    '  albedo *= mix(1.0, 0.55, men*0.6);',
    '}',

    'void main(){',
    '  vec3 N = normalize(vNrm);',
    '  vec3 albedo = uBase;',
    '  float rough = uRough, metal = uMetal, ao = 1.0, alpha = uAlpha;',
    '  float shadowMul = 1.0;',
    '  vec3 emissive = uEmissive;',

    '#ifdef INSTANCED',
    /* roast variation: darker beans are oilier, so they get a lower
       roughness as well as a darker albedo — the two travel together
       on a real roast and faking one without the other looks wrong */
    '  albedo *= mix(0.55, 1.35, vTint.x);',
    '  rough = clamp(rough + (vTint.y-0.5)*0.34 - (1.0-vTint.x)*0.10, 0.04, 1.0);',
    '  alpha *= vTint.z;',
    '#endif',

    /* ── materials ── */
    /* A roasted bean is not smooth. At the distance act zero holds
       it, the wrinkles left by the seed drying are the difference
       between a coffee bean and a brown pebble — so the hero bean
       gets a real perturbed normal, and the crowd, which is never
       more than a few pixels across, gets only the cheap part. */
    '  if(uMat == 6 && uDetail > 0.5){',
    '    vec3 q = vLocal*7.5;',
    '    float e = 0.09;',
    '    float gx = fbm3(q+vec3(e,0,0),3) - fbm3(q-vec3(e,0,0),3);',
    '    float gy = fbm3(q+vec3(0,e,0),3) - fbm3(q-vec3(0,e,0),3);',
    '    float gz = fbm3(q+vec3(0,0,e),3) - fbm3(q-vec3(0,0,e),3);',
    '    vec3 g = vec3(gx,gy,gz);',
    '    g -= N*dot(g,N);',
    '    N = normalize(N - g*0.55);',
    /* the wrinkle troughs hold roasting oil: darker and glossier */
    '    float w = fbm3(q, 3);',
    '    albedo *= 0.80 + 0.42*smoothstep(-0.25, 0.30, w);',
    '    rough = clamp(rough - smoothstep(0.1,-0.3,w)*0.16, 0.05, 1.0);',
    '  }',

    '  if(uMat == 1){',            /* glazed ceramic */
    '    float glaze = fbm3(vWPos*38.0, 2)*0.5+0.5;',
    '    rough = clamp(rough + (glaze-0.5)*0.07, 0.02, 1.0);',
    '    ao = mix(1.0, 0.72, smoothstep(0.25,-0.15,N.y));',
    '  } else if(uMat == 2){',     /* coffee surface */
    '    surfaceCoffee(albedo, rough, N);',
    '    metal = 0.0;',
    '  } else if(uMat == 3){',     /* brushed / polished steel */
    '    float grain = fbm3(vec3(vLocal.x*140.0, vLocal.y*7.0, vLocal.z*140.0), 2);',
    '    rough = clamp(rough + grain*0.10, 0.02, 1.0);',
    '    metal = 1.0;',
    '  } else if(uMat == 4){',     /* falling liquid */
    /* A stream is dark in the body and bright only where the
       surface turns away — get that backwards and you render a
       pale dowel. The strands run *down* the fall at speed, which
       is the only cue that tells the eye this is moving liquid
       and not a rod. */
    '    vec3 V = normalize(uCam - vWPos);',
    '    float fres = pow(1.0 - max(dot(N,V),0.0), 2.0);',
    '    float strand = fbm3(vec3(vLocal.x*16.0, vLocal.y*2.0 - uTime*5.0, vLocal.z*16.0), 3)*0.5+0.5;',
    '    albedo = uBase * (0.55 + 1.05*strand);',
    '    rough = 0.045;',
    '    alpha = clamp(uAlpha * (0.62 + fres*0.60), 0.0, 1.0);',
    /* the lit edge of the column, and a hint of caustic where it
       is thinnest */
    '    emissive += uBase * fres * 1.10 + uSunColor * pow(fres, 4.0) * 0.16;',
    '  } else if(uMat == 5){',     /* the table */
    '    float g = fbm3(vec3(vWPos.x*2.2, vWPos.z*26.0, 0.0), 4);',
    '    float g2 = fbm3(vec3(vWPos.x*0.7, vWPos.z*5.0, 3.0), 3);',
    '    albedo *= 0.72 + 0.42*smoothstep(-0.3,0.5,g*0.7+g2*0.5);',
    '    rough = clamp(0.42 + g*0.16, 0.1, 1.0);',
    '    ao = 1.0;',
    '  } else if(uMat == 7){',     /* glass */
    '    vec3 V = normalize(uCam - vWPos);',
    '    float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);',
    '    alpha = clamp(uAlpha*(0.10 + fres*1.25), 0.0, 1.0);',
    '    rough = 0.03; metal = 0.0;',
    '    emissive += envColor(reflect(-V,N), uSunDir, 0.02)*fres*0.6;',
    '  } else if(uMat == 8){',     /* the ground plane of act zero: nothing */
    '    ao = 0.6;',
    '  }',

    '  vec3 col = shade(vWPos, N, albedo, rough, metal, ao, shadowMul) + emissive;',

    /* Distance haze. Without it the bench ends in a straight line
       against the sky — a lit table has an edge, and the edge is
       the most artificial thing in the frame. Fading distant
       geometry into the same environment the sky is drawn from
       puts a room behind the room. */
    '  vec3 toEye = vWPos - uCam;',
    '  float dist = length(toEye);',
    '  float fog = 1.0 - exp(-max(dist - uFog.x, 0.0) * uFog.y);',
    '  col = mix(col, envColor(toEye/max(dist,1e-4), uSunDir, 0.85), fog);',

    '  alpha *= uFade;',
    '  if(alpha < 0.004) discard;',
    '  frag = vec4(col * uFade, alpha);',
    '}'
  ].join('\n');

  /* ── depth-only (shadow) ─────────────────────────────────── */

  var DEPTH_VS = [
    'layout(location=0) in vec3 aPos;',
    '#ifdef INSTANCED',
    'layout(location=3) in vec4 iPosScale;',
    'layout(location=4) in vec4 iQuat;',
    'layout(location=5) in vec4 iTint;',
    'layout(location=6) in vec4 iScale3;',
    'out float vSkip;',
    '#endif',
    'uniform mat4 uLightViewProj, uModel;',
    'vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }',
    'void main(){',
    '#ifdef INSTANCED',
    '  vSkip = iTint.z;',
    '  vec3 p = qrot(iQuat, aPos * max(iScale3.xyz, vec3(1e-4)) * iPosScale.w) + iPosScale.xyz;',
    '  gl_Position = uLightViewProj * vec4(p,1.0);',
    '#else',
    '  gl_Position = uLightViewProj * uModel * vec4(aPos,1.0);',
    '#endif',
    '}'
  ].join('\n');

  var DEPTH_FS = [
    '#ifdef INSTANCED',
    'in float vSkip;',
    '#endif',
    'out vec4 frag;',
    'void main(){',
    /* a body that has faded out must stop casting, or the film is
       full of shadows from things that are not there */
    '#ifdef INSTANCED',
    '  if(vSkip < 0.35) discard;',
    '#endif',
    '  frag = vec4(1.0);',
    '}'
  ].join('\n');

  /* ── sprites: dust, cocoa, cinnamon, grounds, embers ────────
     Camera-facing quads with a soft analytic falloff. No texture,
     so they stay round at any size and cost one instruction. */

  var SPRITE_VS = [
    'layout(location=0) in vec3 aPos;',
    'layout(location=2) in vec2 aUv;',
    'layout(location=3) in vec4 iPosScale;',
    'layout(location=4) in vec4 iQuat;',
    'layout(location=5) in vec4 iTint;',
    'uniform mat4 uViewProj;',
    'uniform vec3 uRight, uUp;',
    'out vec2 vUv; out vec4 vTint; out vec3 vWPos;',
    'void main(){',
    '  vec2 c = aUv*2.0 - 1.0;',
    /* iQuat.x carries a spin so grounds and cocoa tumble */
    '  float s = sin(iQuat.x), co = cos(iQuat.x);',
    '  c = mat2(co,-s,s,co) * c;',
    '  vec3 wp = iPosScale.xyz + (uRight*c.x + uUp*c.y) * iPosScale.w;',
    '  vWPos = wp; vUv = aUv; vTint = iTint;',
    '  gl_Position = uViewProj * vec4(wp,1.0);',
    '}'
  ].join('\n');

  var SPRITE_FS = [
    NOISE,
    'in vec2 vUv; in vec4 vTint; in vec3 vWPos;',
    'uniform vec3 uBase, uSunDir, uSunColor;',
    'uniform float uFade, uSoft, uTime;',
    'uniform int uKind;',
    'out vec4 frag;',
    'void main(){',
    '  vec2 c = vUv*2.0-1.0;',
    '  float r = length(c);',
    '  if(r > 1.0) discard;',
    '  float a = pow(1.0 - r, uSoft);',
    '  vec3 col = uBase * mix(0.55, 1.5, vTint.x);',
    /* powders (cocoa, cinnamon) are flakes rather than points: a
       little internal structure keeps a drifting cloud from
       reading as a screen full of identical dots */
    '  if(uKind == 1){',
    '    float n = fbm2(c*3.0 + vTint.w*40.0, 2)*0.5+0.5;',
    '    a *= smoothstep(0.25, 0.7, n)*1.4;',
    '    col *= 0.7 + 0.6*n;',
    '  }',
    '  if(uKind == 2){ a *= 0.5 + 0.5*sin(uTime*2.0 + vTint.w*30.0); }',  /* embers pulse */
    '  frag = vec4(col * a * vTint.z * uFade, a * vTint.z * uFade);',
    '}'
  ].join('\n');

  /* ── sky / room ──────────────────────────────────────────────
     The background is the same analytic environment the materials
     reflect, so nothing in frame reflects a room that is not
     behind the camera. */

  var FS_VS = [
    'layout(location=0) in vec2 aPos;',
    'out vec2 vUv;',
    'void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }'
  ].join('\n');

  var SKY_FS = [
    NOISE, ENV,
    'in vec2 vUv;',
    'uniform mat4 uInvViewProj;',
    'uniform vec3 uCam, uSunDir;',
    'uniform float uTime, uRoomAmt, uHazeAmt;',
    'uniform vec3 uHazeColor;',
    'out vec4 frag;',
    'void main(){',
    '  vec4 h = uInvViewProj * vec4(vUv*2.0-1.0, 1.0, 1.0);',
    '  vec3 d = normalize(h.xyz/h.w - uCam);',
    '  vec3 col = envColor(d, uSunDir, 0.55) * uRoomAmt;',
    /* the window itself, not just its reflection */
    '  float w = max(dot(d,uSunDir),0.0);',
    '  col += uEnvWindow * pow(w, 8.0) * 0.55 * uRoomAmt;',
    /* slow drifting haze so the darkness is never flat black */
    '  float haze = fbm3(vec3(d.xy*2.6, uTime*0.02), 3)*0.5+0.5;',
    '  col += uHazeColor * haze * uHazeAmt;',
    '  frag = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ── volumetric steam ────────────────────────────────────────
     A raymarch through an fbm field shaped into a plume. It reads
     scene depth so it can drift *behind* the cup, gets one
     shadow tap toward the sun so it has form rather than being a
     flat wash, and can be pulled into letterforms by a screen-space
     mask — which is how the steam becomes typography without a
     cut. */

  var STEAM_FS = [
    NOISE,
    'in vec2 vUv;',
    'uniform mat4 uInvViewProj;',
    'uniform vec3 uCam, uSunDir, uSunColor, uFwd;',
    'uniform sampler2D uDepth, uTextTex;',
    'uniform float uTime, uNear, uFar;',
    'uniform vec3 uOrigin;',
    'uniform vec4 uShape;',    /* x amount, y height, z radius, w rise speed */
    'uniform vec4 uWrap;',     /* x camera-fog amount, y density, z text amount, w cool */
    'uniform vec3 uTint, uTintDeep;',
    'uniform int uSteps;',
    'out vec4 frag;',

    'float linearDepth(float d){',
    '  float z = d*2.0-1.0;',
    '  return (2.0*uNear*uFar)/(uFar+uNear - z*(uFar-uNear));',
    '}',

    'float plume(vec3 p, out float lift){',
    '  vec3 q = p - uOrigin;',
    '  float h = q.y;',
    '  lift = clamp(h/max(uShape.y,0.001), 0.0, 1.0);',
    /* the column leans and widens as it rises, and the whole field
       drifts upward with time so it never looks like static fog */
    '  float t = uTime*uShape.w;',
    '  q.xz += vec2(sin(h*1.1 + t*0.7), cos(h*0.9 - t*0.5)) * lift * 0.30;',
    '  float rad = uShape.z * (0.35 + lift*1.85);',
    '  float radial = 1.0 - smoothstep(rad*0.35, rad, length(q.xz));',
    '  float vert = smoothstep(-0.02, 0.16, h) * (1.0 - smoothstep(uShape.y*0.45, uShape.y, h));',
    '  vec3 np = vec3(q.x*2.1, h*1.5 - t*1.35, q.z*2.1);',
    '  float n = fbm3(np, 4)*0.5+0.5;',
    '  n = pow(n, 1.55);',
    '  float d = radial*vert*n;',
    /* wisps survive higher than the body of the plume */
    '  d += radial*vert*pow(max(n-0.42,0.0), 1.6)*0.9;',
    '  return max(d, 0.0);',
    '}',

    'void main(){',
    '  vec4 h0 = uInvViewProj * vec4(vUv*2.0-1.0, -1.0, 1.0);',
    '  vec4 h1 = uInvViewProj * vec4(vUv*2.0-1.0,  1.0, 1.0);',
    '  vec3 near = h0.xyz/h0.w, far = h1.xyz/h1.w;',
    '  vec3 rd = normalize(far-near);',

    /* scene depth is measured along the camera axis, the march is
       along the pixel ray — divide by cos(theta) or the steam eats
       into geometry toward the edges of frame */
    '  float sceneZ = linearDepth(texture(uDepth, vUv).r);',
    '  float maxT = min(sceneZ / max(dot(rd, uFwd), 0.25), 26.0);',

    '  float total = uShape.x + uWrap.x;',
    '  if(total < 0.002){ frag = vec4(0.0); return; }',

    /* Screen-space letterform mask. Making the steam denser inside
       the letters is only half of it — the other half is taking the
       density *out* of everywhere else, or the words are white on
       white. At full strength the field keeps a sixth of its
       density outside the glyphs, so the plume does not vanish, it
       gathers. */
    '  float textMask = texture(uTextTex, vec2(vUv.x, 1.0-vUv.y)).r;',
    '  float textAmt = uWrap.z;',

    /* Bound the march to where the steam actually is. Marching from
       the near plane to the far plane spends every step in empty
       air: at 64 steps over 26 units the sample spacing is 40 cm,
       far coarser than the plume is wide, and the jitter that hides
       the banding becomes the image. Clipping to the plume's own
       box gives the same 64 steps a spacing of about 3 cm. */
    '  vec3 bmin = uOrigin + vec3(-uShape.z*2.6, -0.06, -uShape.z*2.6);',
    '  vec3 bmax = uOrigin + vec3( uShape.z*2.6, uShape.y*1.06,  uShape.z*2.6);',
    '  if(uWrap.x > 0.001){ bmin = min(bmin, uCam - vec3(5.0)); bmax = max(bmax, uCam + vec3(5.0)); }',
    '  vec3 inv = 1.0/rd;',
    '  vec3 ta = (bmin - uCam)*inv, tb = (bmax - uCam)*inv;',
    '  vec3 tlo = min(ta, tb), thi = max(ta, tb);',
    '  float tEnter = max(max(tlo.x, tlo.y), tlo.z);',
    '  float tExit  = min(min(thi.x, thi.y), thi.z);',
    '  float t0 = max(tEnter, 0.05);',
    '  float t1 = min(tExit, maxT);',
    '  if(t1 <= t0){ frag = vec4(0.0); return; }',
    '  float steps = float(uSteps);',
    '  float dt = (t1 - t0)/steps;',

    '  vec3 acc = vec3(0.0);',
    '  float trans = 1.0;',
    '  float jitter = hash12(gl_FragCoord.xy + fract(uTime)*57.0);',

    '  for(int i=0;i<96;i++){',
    '    if(i >= uSteps || trans < 0.012) break;',
    '    float t = t0 + (float(i)+jitter)*dt;',
    '    if(t > t1) break;',
    '    vec3 p = uCam + rd*t;',
    '    float lift;',
    '    float dens = plume(p, lift) * uShape.x;',

    /* the wrap field: fog that closes around the lens itself */
    '    if(uWrap.x > 0.001){',
    '      float n = fbm3(vec3(p*1.15) + vec3(0.0, -uTime*0.5, uTime*0.12), 3)*0.5+0.5;',
    '      float near0 = smoothstep(0.2, 3.4, t);',
    '      dens += pow(n,1.4) * uWrap.x * near0;',
    '    }',

    '    dens *= uWrap.y;',
    '    dens = mix(dens, dens*0.16 + textMask*2.35, textAmt);',
    '    if(dens <= 0.0005) continue;',

    /* one shadow tap toward the light — enough to give the plume a
       lit edge and a dark core, which is most of what sells volume */
    '    float ls;',
    '    float shade = plume(p + uSunDir*0.22, ls)*uShape.x + 0.0;',
    '    float lightAmt = exp(-shade*3.4);',
    '    vec3 col = mix(uTintDeep, uTint, lightAmt);',
    '    col += uSunColor * lightAmt * 0.55 * (0.35 + 0.65*lift);',
    '    col = mix(col, uTint*1.30, textMask*textAmt);',

    '    float aStep = 1.0 - exp(-dens*dt*7.0);',
    '    acc += col * aStep * trans;',
    '    trans *= 1.0 - aStep;',
    '  }',

    '  frag = vec4(acc, 1.0 - trans);',
    '}'
  ].join('\n');

  /* ── post ────────────────────────────────────────────────── */

  var BRIGHT_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uScene, uSteam;',
    'uniform float uThreshold, uKnee;',
    'out vec4 frag;',
    'void main(){',
    '  vec4 s = texture(uScene, vUv);',
    '  vec4 st = texture(uSteam, vUv);',
    '  vec3 c = s.rgb*(1.0-st.a) + st.rgb;',
    '  float l = max(c.r, max(c.g, c.b));',
    /* soft knee so the bloom fades in rather than switching on */
    '  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0*uKnee);',
    '  soft = soft*soft/(4.0*uKnee + 1e-5);',
    '  float w = max(soft, l - uThreshold)/max(l, 1e-5);',
    '  frag = vec4(c*w, 1.0);',
    '}'
  ].join('\n');

  /* 13-tap downsample / 9-tap tent upsample — the pairing that
     gives a bloom without the stair-stepping a naive box chain has */
  var DOWN_FS = [
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
    '  vec3 h = texture(uTex, vUv + t*vec2( 0,-2)).rgb;',
    '  vec3 i = texture(uTex, vUv + t*vec2( 0, 2)).rgb;',
    '  vec3 col = e*0.25 + (a+b+c+d)*0.125 + (f+g+h+i)*0.0625;',
    '  frag = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var UP_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uTex, uPrev;',
    'uniform vec2 uTexel;',
    'uniform float uRadius;',
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
    '  frag = vec4(c + texture(uPrev, vUv).rgb, 1.0);',
    '}'
  ].join('\n');

  /* Sun shafts: a radial blur of the bright buffer toward the
     projected sun, plus a wide horizontal smear for the anamorphic
     streak. Both come off the same texture, so it is one pass. */
  var RAYS_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uSunUv;',
    'uniform float uDensity, uDecay, uWeight, uStreak;',
    'out vec4 frag;',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 delta = (uv - uSunUv) * uDensity / 24.0;',
    '  float illum = 1.0;',
    '  vec3 acc = vec3(0.0);',
    '  for(int i=0;i<24;i++){',
    '    uv -= delta;',
    '    acc += texture(uTex, uv).rgb * illum;',
    '    illum *= uDecay;',
    '  }',
    '  acc *= uWeight/24.0;',
    '  vec3 streak = vec3(0.0);',
    '  for(int i=-10;i<=10;i++){',
    '    float w = 1.0 - abs(float(i))/11.0;',
    '    streak += texture(uTex, vUv + vec2(float(i)*0.010, 0.0)).rgb * w*w;',
    '  }',
    '  streak *= uStreak/11.0;',
    '  frag = vec4(acc + streak*vec3(1.0,0.72,0.42), 1.0);',
    '}'
  ].join('\n');

  var COMPOSITE_FS = [
    NOISE,
    'in vec2 vUv;',
    'uniform sampler2D uScene, uSteam, uBloom, uRays;',
    'uniform float uTime, uBloomAmt, uRayAmt, uExposure, uVignette, uGrain, uAberration, uFadeToBlack, uWarmth;',
    'uniform vec2 uRes;',
    'out vec4 frag;',

    'vec3 aces(vec3 x){',
    '  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;',
    '  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);',
    '}',

    /* Everything above this point is linear light. The drawing
       buffer is sRGB, so the last thing that happens to a pixel is
       the transfer function — without it the whole film renders
       roughly a stop and a half under and the shadows crush. */
    'vec3 encodeSRGB(vec3 c){',
    '  c = max(c, vec3(0.0));',
    '  vec3 lo = c * 12.92;',
    '  vec3 hi = 1.055 * pow(c, vec3(1.0/2.4)) - 0.055;',
    '  return mix(lo, hi, step(vec3(0.0031308), c));',
    '}',

    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 c = uv - 0.5;',
    '  float r2 = dot(c,c);',

    /* lateral chromatic aberration, scaled by radius — a lens
       artefact, so it belongs at the edges and nowhere else */
    '  float ab = uAberration * r2;',
    '  vec3 scene;',
    '  scene.r = texture(uScene, uv + c*ab).r;',
    '  scene.g = texture(uScene, uv).g;',
    '  scene.b = texture(uScene, uv - c*ab).b;',

    '  vec4 steam = texture(uSteam, uv);',
    '  vec3 col = scene*(1.0 - steam.a) + steam.rgb;',

    '  col += texture(uBloom, uv).rgb * uBloomAmt;',
    '  col += texture(uRays, uv).rgb * uRayAmt;',

    '  col *= uExposure;',

    /* grade: shadows toward roasted brown, highlights toward crema.
       One hue family, pushed from both ends. */
    '  float l = dot(col, vec3(0.2126,0.7152,0.0722));',
    '  vec3 shadowTint = vec3(1.05, 0.94, 0.86);',
    '  vec3 highTint   = vec3(1.03, 0.985, 0.94);',
    '  col *= mix(shadowTint, highTint, smoothstep(0.0, 0.55, l));',
    '  col = mix(col, col*vec3(1.06,0.99,0.90), uWarmth);',

    /* vignette belongs in linear light — it is a lens, not a grade */
    '  col *= 1.0 - uVignette*smoothstep(0.15, 0.78, r2);',

    '  col = encodeSRGB(aces(col));',

    /* grain lives in display space and only in the shadows: grain
       in a crema highlight reads as noise, grain in the darkness
       reads as film */
    '  float g = hash12(gl_FragCoord.xy + fract(uTime)*1000.0) - 0.5;',
    '  col += g * uGrain * (1.0 - smoothstep(0.0, 0.72, dot(col, vec3(0.33))));',

    '  col *= (1.0 - uFadeToBlack);',
    '  frag = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  PEET.SH = {
    header: H,
    fsVS: H + FS_VS,
    obj: function (instanced) {
      var d = instanced ? '#define INSTANCED\n' : '';
      return { vs: H + d + OBJ_VS, fs: H + d + OBJ_FS };
    },
    depth: function (instanced) {
      var d = instanced ? '#define INSTANCED\n' : '';
      return { vs: H + d + DEPTH_VS, fs: H + d + DEPTH_FS };
    },
    sprite: { vs: H + SPRITE_VS, fs: H + SPRITE_FS },
    sky: H + SKY_FS,
    steam: H + STEAM_FS,
    bright: H + BRIGHT_FS,
    down: H + DOWN_FS,
    up: H + UP_FS,
    rays: H + RAYS_FS,
    composite: H + COMPOSITE_FS
  };

})(window);
