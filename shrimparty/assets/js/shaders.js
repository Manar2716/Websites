/* ═══════════════════════════════════════════════════════════
   shaders.js — GLSL ES 3.00 for the whole film.

   Written as chunks that get concatenated, because the object
   shader compiles twice — instanced and not — and the depth
   shader has to deform its vertices exactly the way the colour
   shader does, or the shadows detach from the things casting
   them.

   THE LIGHTING RULE, which every material below obeys:

     There are two lights in this film and only two. A low sun,
     warm and off to one side, and the sky it hangs in — which is
     a source in its own right and the larger of the two by area.
     A warm boil under the pail is the one local exception and it
     lights a single act. Every colour on screen is one of those
     reflected off something, and the only red in the project is a
     specular on wet shell — never a fill.

     That is why the palette holds together across nine acts shot
     in completely different places. Take the constraint away and
     it becomes a page with a lot of orange on it.

     The sky is not a gradient approximating a sky: `skyColor` is
     one function, and the sky pass, the ocean's reflection and
     every object's environment term all call it. Two different
     skies in one frame is the fastest way to make water look
     pasted onto a backdrop.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIMP = (global.SHRIMP = global.SHRIMP || {});
  /* int precision has to be stated: the ES 3.00 default is highp
     in a vertex shader and mediump in a fragment shader, and a
     uniform shared across both then fails to link. */
  var H = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

  /* ── noise, matched to the CPU implementation in math.js ───
     The CPU places things and the GPU shades them; when the two
     disagree, steam drifts off the object it is rising from. */

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
    '  return mix(mix(x00,x10,u.y), mix(x01,x11,u.y), u.z);',
    '}',
    'float fbm3(vec3 p, int oct){',
    '  float s=0.0, a=0.5;',
    '  for(int i=0;i<6;i++){ if(i>=oct) break; s += a*noise3(p); p*=2.03; a*=0.5; }',
    '  return s;',
    '}'
  ].join('\n');

  /* ── the swell ───────────────────────────────────────────────
     Four Gerstner waves. Gerstner rather than a sum of sines
     because the horizontal displacement is the entire point: it
     sharpens the crests and flattens the troughs, which is the
     silhouette that reads as ocean. Sines give you corduroy.

     The same function runs on the CPU in film.js to float the
     bucket, so it lives in a chunk shared by both the vertex and
     fragment stages and is transcribed there by hand. */

  var SWELL = [
    'const vec4 WA = vec4(0.062, 0.040, 0.026, 0.015);',   /* amplitude */
    'const vec4 WL = vec4(9.10,  5.30,  3.10,  1.70);',    /* wavelength */
    'const vec4 WS = vec4(0.70,  0.94,  1.28,  1.75);',    /* speed */
    'const vec2 WD0 = vec2( 1.000, 0.000);',
    'const vec2 WD1 = vec2( 0.760,-0.650);',
    'const vec2 WD2 = vec2( 0.420, 0.907);',
    'const vec2 WD3 = vec2(-0.300, 0.954);',
    'const vec4 WQ = vec4(0.86, 0.70, 0.52, 0.34);',       /* crest sharpness */

    'vec3 swell(vec2 p, float t, float amp){',
    '  vec3 d = vec3(0.0);',
    '  vec2 dirs[4]; dirs[0]=WD0; dirs[1]=WD1; dirs[2]=WD2; dirs[3]=WD3;',
    '  for(int i=0;i<4;i++){',
    '    float k = 6.2831853 / WL[i];',
    '    float ph = k * dot(dirs[i], p) - t * WS[i] * k * 1.6;',
    '    float a = WA[i] * amp;',
    '    d.xz += dirs[i] * (WQ[i] * a * cos(ph));',
    '    d.y  += a * sin(ph);',
    '  }',
    '  return d;',
    '}',

    /* Normal by central difference on the displaced surface. The
       analytic normal for a Gerstner sum exists, but it is wrong
       the moment anything else moves the surface — and the drop
       impact in act one does exactly that. */
    'vec3 swellNormal(vec2 p, float t, float amp, float e){',
    '  vec3 c = swell(p, t, amp);',
    '  vec3 x = swell(p + vec2(e,0.0), t, amp);',
    '  vec3 z = swell(p + vec2(0.0,e), t, amp);',
    '  vec3 pc = vec3(p.x,0,p.y)+c, px = vec3(p.x+e,0,p.y)+x, pz = vec3(p.x,0,p.y+e)+z;',
    '  return normalize(cross(pz-pc, px-pc));',
    '}',

    /* The droplet impact: an expanding ring of capillary waves,
       amplitude falling with radius and with age. This is what
       the whole first act is, so it is worth its own term rather
       than being faked with a texture scroll. */
    'float ripple(vec2 p, vec2 c, float age, float strength){',
    '  if(strength <= 0.0) return 0.0;',
    '  float d = length(p - c);',
    '  float front = age * 3.10;',
    '  float w = smoothstep(front + 0.55, front, d) * smoothstep(front - 2.6, front - 0.2, d);',
    '  float ring = sin(d * 7.4 - age * 15.0) * exp(-d * 0.30);',
    '  return ring * w * strength * exp(-age * 0.42) / (1.0 + d * 0.55);',
    '}'
  ].join('\n');

  /* ── shading model ───────────────────────────────────────────
     GGX specular, Lambert base, plus two additions that the food
     needs and a strict metal/rough model will not give it:

       · wrapped diffuse, so a shrimp lit from behind still has a
         readable belly instead of a black one
       · a translucency term that carries the *light's* colour
         through thin shell, which is why the tail fans glow
         orange when the boil is behind them

     A clearcoat lobe sits on top for anything wet. Everything on
     this page is wet. */

  var SHADE = [
    'const float PI = 3.14159265;',

    'float D_GGX(float NoH, float a){',
    '  float a2 = a*a; float d = NoH*NoH*(a2-1.0)+1.0;',
    '  return a2 / max(PI*d*d, 1e-7);',
    '}',
    /* Height-correlated Smith. The clamp matters more than it
        looks: at grazing angles both terms go to zero together,
        and with a 1e-7 floor the ratio reaches 5e6 before anything
        multiplies it back down. Every caller must also multiply by
        NoL — the ocean is seen at grazing incidence across the
        whole frame, and forgetting that factor there turns the sea
        into a sheet of white. */
    'float V_Smith(float NoV, float NoL, float a){',
    '  float a2=a*a;',
    '  float gv = NoL*sqrt(NoV*NoV*(1.0-a2)+a2);',
    '  float gl = NoV*sqrt(NoL*NoL*(1.0-a2)+a2);',
    '  return 0.5/max(gv+gl, 1e-4);',
    '}',
    'vec3 F_Schlick(vec3 f0, float u){ return f0 + (1.0-f0)*pow(1.0-u,5.0); }',

    /* one light, evaluated */
    'vec3 lobe(vec3 N, vec3 V, vec3 L, vec3 lc, vec3 albedo, float rough,',
    '          float metal, float coat, float translucency, float thickness){',
    '  vec3 Hv = normalize(V+L);',
    '  float NoL = dot(N,L);',
    '  float NoV = max(dot(N,V), 1e-4);',
    '  float NoH = max(dot(N,Hv), 0.0);',
    '  float VoH = max(dot(V,Hv), 0.0);',

    /* Wrapped diffuse — the wrap width is the softness of the
       terminator. 0.35 lights the shadow side all the way down to
       N·L = -0.35, which leaves every object evenly lit and
       therefore shapeless. Food has a soft terminator, not an
       absent one. */
    '  float w = 0.13;',
    '  float diff = max((NoL + w) / ((1.0+w)*(1.0+w)), 0.0);',

    '  float a = max(rough*rough, 0.0016);',
    '  vec3 f0 = mix(vec3(0.045), albedo, metal);',
    '  float spec = D_GGX(NoH,a) * V_Smith(NoV, max(NoL,0.0), a);',
    '  vec3 F = F_Schlick(f0, VoH);',

    /* clearcoat: a second, much tighter lobe with a fixed IOR.
       This is the difference between "shrimp" and "wet shrimp",
       and it is almost the whole read on the hero object. */
    /* 0.105, not the 0.055 a lacquer would have. A film of water
       on a lumpy pile of shell is not a mirror, and at 0.055 the
       boil overhead lands on every up-facing facet at the same
       instant and caps the whole pail in white. */
    '  float ca = max(0.105*0.105, 1e-4);',
    '  float cspec = D_GGX(NoH, ca) * V_Smith(NoV, max(NoL,0.0), ca);',
    '  float cF = 0.04 + 0.96*pow(1.0-VoH, 5.0);',

    /* light coming through the object from behind */
    '  float back = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 3.0);',
    /* Tinted by the albedo, because light that goes *through*
       shrimp comes out the colour of shrimp. Un-tinted, every
       translucent thing glows with the raw colour of the lamp and
       a wet pile of shell reads as a pile of ice. */
    '  vec3 trans = lc * albedo * translucency * back * exp(-thickness*2.2);',

    '  vec3 kd = albedo * (1.0-metal) * diff;',
    '  vec3 ks = F * spec * max(NoL,0.0);',
    /* What the coat reflects, the layers under it never receive.
       Adding the coat on top instead of over the base is what
       turns wet shrimp white: at wet=1 the food keeps its full
       diffuse *and* gains a mirror, so the albedo stops showing
       through the water at all. */
    '  float kcAmt = cF * coat;',
    /* The coat lobe peaks in the tens of thousands. ACES maps that
       to the same white as 30 does, but bloom runs before the
       tonemap and would smear the spike across the whole dish, so
       it is clamped to a highlight rather than a floodlight. */
    '  vec3 kc = vec3(min(cF * cspec * max(NoL,0.0) * coat, 12.0));',
    '  return lc * ((kd + ks) * (1.0 - kcAmt) + kc) + trans;',
    '}'
  ].join('\n');

  /* ── object pass ─────────────────────────────────────────────
     One shader for every solid thing in the film. Material comes
     in as uniforms for the singletons and as instance attributes
     for the crowds; INSTANCED is a compile-time switch rather
     than a branch, because the two paths differ in their vertex
     inputs, not just their values. */

  var OBJ_VS_HEAD = [
    'layout(location=0) in vec3 aPos;',
    'layout(location=1) in vec3 aNrm;',
    'layout(location=2) in vec2 aUv;',
    '#ifdef INSTANCED',
    'layout(location=3) in vec4 iPos;',   /* xyz + uniform scale */
    'layout(location=4) in vec4 iQuat;',
    'layout(location=5) in vec4 iTint;',  /* rgb + material blend */
    'layout(location=6) in vec4 iExtra;', /* wet, emissive, dissolve, seed */
    '#endif',

    'uniform mat4 uViewProj;',
    'uniform mat4 uModel;',
    'uniform mat3 uNormalMat;',
    'uniform mat4 uLightViewProj;',
    'uniform float uTime;',

    'out vec3 vWorld;',
    'out vec3 vNormal;',
    'out vec2 vUv;',
    'out vec4 vShadow;',
    'out vec4 vTint;',
    'out vec4 vExtra;',
    'out float vDepthFade;',

    'vec3 qrot(vec4 q, vec3 v){',
    '  return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v);',
    '}'
  ].join('\n');

  var OBJ_VS_BODY = [
    'void main(){',
    '  vec3 p = aPos;',
    '  vec3 n = aNrm;',
    '#ifdef INSTANCED',
    '  p = qrot(iQuat, p * iPos.w) + iPos.xyz;',
    '  n = qrot(iQuat, n);',
    '  vTint = iTint;',
    '  vExtra = iExtra;',
    '#else',
    '  vec4 wp = uModel * vec4(p,1.0);',
    '  p = wp.xyz;',
    '  n = uNormalMat * n;',
    '  vTint = uTint;',
    '  vExtra = uExtra;',
    '#endif',
    '  vWorld = p;',
    '  vNormal = normalize(n);',
    '  vUv = aUv;',
    '  vShadow = uLightViewProj * vec4(p, 1.0);',
    '  vDepthFade = 1.0;',
    '  gl_Position = uViewProj * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var OBJ_VS_UNIFORMS = [
    'uniform vec4 uTint;',
    'uniform vec4 uExtra;'
  ].join('\n');

  var OBJ_FS = [
    'in vec3 vWorld;',
    'in vec3 vNormal;',
    'in vec2 vUv;',
    'in vec4 vShadow;',
    'in vec4 vTint;',
    'in vec4 vExtra;',
    'in float vDepthFade;',

    'uniform vec3 uCamera;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunColor;',
    'uniform vec3 uBoilPos;',
    'uniform vec3 uBoilColor;',
    'uniform float uBoilPower;',
    'uniform vec3 uFogColor;',
    'uniform vec3 uDeepColor;',
    'uniform float uFogDensity;',
    'uniform float uTime;',
    'uniform float uRough;',
    'uniform float uMetal;',
    'uniform float uCoat;',
    'uniform float uTranslucency;',
    'uniform float uRelief;',
    'uniform float uWaterLine;',   /* world Y of the surface; below it, tint */
    'uniform sampler2D uShadowMap;',
    'uniform float uShadowStrength;',

    'out vec4 outColor;',

    /* 3×3 PCF. Anything less and the shrimp's own shadow crawls
       across it in visible steps as it turns. */
    'float shadow(vec4 sc, float NoL){',
    '  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;',
    '  if(p.z > 1.0 || p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 1.0;',
    /* Slope-scaled and sized off the actual map, not a constant.
       The 3×3 taps are offset in XY, so on a surface tilted away
       from the light they land at depths the centre bias never
       covers, and a curved surface stipples itself. Both terms
       are in texels, so raising the shadow resolution tightens
       the bias instead of turning it into acne. */
    '  float texel = 1.0 / float(textureSize(uShadowMap, 0).x);',
    '  float slope = min(sqrt(max(0.0, 1.0 - NoL*NoL)) / max(NoL, 0.10), 6.0);',
    '  float bias = texel * (1.8 + 3.4 * slope);',
    '  float s = 0.0;',
    '  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){',
    '    float d = texture(uShadowMap, p.xy + vec2(float(x),float(y))*texel).r;',
    '    s += (p.z - bias) > d ? 0.0 : 1.0;',
    '  }',
    '  return s / 9.0;',
    '}',

    'void main(){',
    '  vec3 N = normalize(vNormal);',
    '  vec3 V = normalize(uCamera - vWorld);',
    '  if(dot(N,V) < 0.0) N = -N;',              /* leaves and fans are two-sided */

    '  vec3 albedo = vTint.rgb;',
    '  float mat = vTint.a;',
    '  float wet = vExtra.x;',
    '  float emissive = vExtra.y;',
    '  float dissolve = vExtra.z;',
    '  float seed = vExtra.w;',

    /* Shell grain. Two scales: a fine speckle that reads as the
       pigment in a shell, and a broad mottle so no two shrimp in
       a crowd of four hundred are the same object. */
    '  float grain = fbm3(vWorld*26.0 + seed*13.0, 3);',
    '  float mottle = fbm3(vWorld*3.1 + seed*7.0, 2);',
    '  albedo *= 0.86 + 0.28*mottle;',
    '  albedo = mix(albedo, albedo*vec3(1.10,0.94,0.90), grain*0.35);',

    /* Shell banding. The spare channel in the tint says how much
       of it to apply, so one shader serves a banded shrimp and an
       unbanded potato without a second program. uv.y runs along
       the swept body, so the six bands land on the six plates the
       geometry already built — the shading and the silhouette
       agree, which is the only reason this reads as one shell
       rather than as a striped tube. */
    '  float band = vTint.a;',
    '  if(band > 0.001){',
    '    float sgm = fract(vUv.y * 6.0);',
    '    float seam = exp(-pow((sgm - 0.03)/0.10, 2.0));',
    '    albedo = mix(albedo, albedo*vec3(0.46,0.26,0.30), seam*band*0.85);',
    '    albedo = mix(albedo, albedo*vec3(1.22,0.90,0.82), pow(sgm,2.4)*band*0.60);',
    '  }',

    /* ── micro-relief ──
       The grain above tints the albedo and roughens the surface,
       but it does not move the *normal* — and a surface whose
       colour varies while its normal stays perfectly smooth reads
       as painted plastic no matter how good the colour is. Shell
       is not smooth; it is pitted, and the pits are what catch
       the boil.

       The gradient comes from screen-space derivatives of a
       height field rather than from a tangent-space normal map,
       because none of these meshes have a tangent frame or a UV
       unwrap worth sampling — they are swept and revolved
       surfaces. This is the surface-gradient formulation, which
       needs neither. */
    '  if(uRelief > 0.001){',
    '    float hgt = fbm3(vWorld*44.0 + seed*5.0, 3);',
    '    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);',
    '    float dhx = dFdx(hgt), dhy = dFdy(hgt);',
    /* One pixel covers this much of the noise. Past about a
       quarter period the height field is undersampled and the
       gradient turns into per-pixel confetti that no amount of
       FXAA will settle, so it is faded out rather than aliased —
       the same reason a texture gets mipped. */
    '    float foot = max(length(dpx), length(dpy)) * 44.0;',
    '    float fade = 1.0 - smoothstep(0.16, 0.55, foot);',
    '    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);',
    '    float det = dot(dpx, r1);',
    '    vec3 grad = (r1*dhx + r2*dhy) * (abs(det) > 1e-9 ? sign(det)/abs(det) : 0.0);',
    /* wet shell fills its own pits, so the relief eases off as
       the water sheets over it */
    '    N = normalize(N - grad * uRelief * fade * 0.055 * (1.0 - wet*0.30));',
    '  }',

    '  float rough = clamp(uRough * (0.86 + grain*0.30) - wet*0.34, 0.030, 1.0);',
    /* The clearcoat lobe is a GGX at roughness 0.055, which peaks
       near 35000. Letting `coat` past 1 multiplies that, and in a
       close shot with the boil a hand-span from the food the
       whole dish goes to white lace. Wetness raises the coat; it
       does not get to exceed a full coat. */
    '  float coat = min(uCoat + wet*0.85, 1.0);',

    /* Sheeting water: a thin film that runs *down* the object and
       leaves the top drier. Act four is nothing but this. */
    '  float sheet = wet * smoothstep(0.55, -0.15, N.y);',
    '  rough = max(rough - sheet*0.10, 0.028);',

    '  vec3 col = vec3(0.0);',

    /* the sun */
    '  vec3 L1 = normalize(uSunDir);',
    '  float sh = mix(1.0, shadow(vShadow, max(dot(N,L1),0.0)), uShadowStrength);',
    '  col += lobe(N,V,L1, uSunColor, albedo, rough, uMetal, coat, uTranslucency, 0.35) * sh;',

    /* the boil — a point light with inverse-square falloff and a
       slow flicker, because a still flame is a lamp */
    '  vec3 dL = uBoilPos - vWorld;',
    '  float dist = length(dL);',
    '  vec3 L2 = dL / max(dist, 1e-4);',
    '  float flick = 0.86 + 0.14*fbm3(vec3(uTime*1.35, 0.0, 0.0), 3);',
    '  float atten = uBoilPower * flick / (1.0 + dist*dist*0.62);',
    '  col += lobe(N,V,L2, uBoilColor*atten, albedo, rough, uMetal, coat, uTranslucency, 0.22);',

    /* Ambient: sky above, a bounce of the boil below, and nothing
       else. No constant fill — a constant fill is what makes CG
       food look like plastic. */
    '  float up = N.y*0.5+0.5;',
    /* Outdoors in daylight the fill is the sky, and the sky is a
       hemisphere the size of the world — far larger and far
       stronger than the two point lights. Up-facing surfaces see
       haze; down-facing ones see the sea, which is why the
       undersides here go green rather than simply dark. Getting
       this wrong is what makes an outdoor render look like a
       studio render of the same objects. */
    '  vec3 amb = mix(uDeepColor*0.90 + uBoilColor*0.045, uFogColor*0.62, up);',
    '  col += albedo * amb * (1.0 - uMetal*0.85);',

    /* The environment along the reflection vector. Metal lit by
       two point lights and nothing else is a black object with two
       dots on it — the pail needs something to reflect, and
       outdoors that something is the actual sky, evaluated by the
       same function the sky pass draws and the ocean mirrors. It
       is not an IBL, but it is the real sky rather than a ramp
       that approximates one, which is what lets galvanised steel
       read as galvanised steel instead of as grey plastic.

       Downward reflections see the sea, not the sky, or the
       underside of every object reflects a sky that is not there. */
    '  vec3 R = reflect(-V, N);',
    '  vec3 env = R.y > 0.0',
    '    ? skyColor(R, normalize(uSunDir), uSunColor, uFogColor)',
    '    : mix(uDeepColor*1.6, uFogColor*0.70, smoothstep(-0.75, 0.0, R.y));',
    '  env += uBoilColor * 0.045 * smoothstep(0.25, -0.55, R.y);',
    '  float envF = 0.045 + 0.955*pow(1.0 - max(dot(N,V),0.0), 5.0);',
    /* Non-metals take a much smaller share of this: they already
       have a fresnel rim below, and letting both run washes the
       colour out of every shell in the frame. */
    '  col += env * mix(vec3(envF*0.42), albedo, uMetal) * mix(0.34, 1.25, uMetal) * (1.0 - rough*0.55);',

    /* Rim: the sun catching the wet edge. The red in the palette
       lives here and nowhere else. Scaled well down from the night
       cut — the key is roughly an order of magnitude brighter now,
       and a rim tuned against a moon becomes a white outline
       around every object under a sun. */
    '  float fres = pow(1.0 - max(dot(N,V),0.0), 4.0);',
    '  col += fres * (uSunColor*0.075 + vec3(0.40,0.042,0.028)*wet*0.55);',

    '  col += albedo * emissive;',

    /* underwater: everything below the line loses its warm end and
       picks up the ocean. One line of code, and it is what makes
       the rise in act four look like it is coming *out* of
       something. */
    '  float sub = smoothstep(0.10, -0.35, vWorld.y - uWaterLine);',
    '  col = mix(col, mix(col, uFogColor*1.7, 0.78) * vec3(0.42,0.72,1.0), sub);',

    /* distance fog, exponential-squared */
    '  float d = length(uCamera - vWorld);',
    '  float fog = 1.0 - exp(-pow(d*uFogDensity, 2.0));',
    '  col = mix(col, uFogColor, clamp(fog, 0.0, 0.94));',

    /* dissolve: a noise-thresholded erase with a hot edge, used
       when the bucket comes apart in act six */
    '  if(dissolve > 0.001){',
    '    float n = fbm3(vWorld*5.5 + seed*3.0, 3);',
    '    float edge = n - dissolve*1.25;',
    '    if(edge < 0.0) discard;',
    '    col += uBoilColor * smoothstep(0.07, 0.0, edge) * 1.5;',
    '  }',

    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* depth-only, deforming identically to the colour pass */
  var DEPTH_VS = [
    'layout(location=0) in vec3 aPos;',
    '#ifdef INSTANCED',
    'layout(location=3) in vec4 iPos;',
    'layout(location=4) in vec4 iQuat;',
    '#endif',
    'uniform mat4 uViewProj;',
    'uniform mat4 uModel;',
    'vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }',
    'void main(){',
    '#ifdef INSTANCED',
    '  vec3 p = qrot(iQuat, aPos * iPos.w) + iPos.xyz;',
    '#else',
    '  vec3 p = (uModel * vec4(aPos,1.0)).xyz;',
    '#endif',
    '  gl_Position = uViewProj * vec4(p,1.0);',
    '}'
  ].join('\n');

  var DEPTH_FS = 'void main(){}';

  /* ── the ocean ───────────────────────────────────────────────
     A displaced grid, densest near the camera. What sells it is
     not the waves — it is the sun path, and the path is a
     GGX lobe on a *disc* light rather than a point, so it
     stretches down the swell in a wedge instead of sitting on the
     water as a dot. */

  var OCEAN_VS = [
    'layout(location=0) in vec3 aPos;',
    'uniform mat4 uViewProj;',
    'uniform vec3 uCamera;',
    'uniform float uTime;',
    'uniform float uAmp;',
    'uniform vec2 uRippleAt;',
    'uniform vec2 uRipple;',      /* age, strength */
    'out vec3 vWorld;',
    'out vec2 vGrid;',
    NOISE,
    SWELL,
    'void main(){',
    /* The grid is a radially-graded polar disc built on the CPU,
       and it is re-centred on the camera every frame — so the sea
       has no edge, and the vertices are spent where they are
       seen. The wave field is sampled in *world* space, which is
       what stops the swell sliding along with the camera. */
    '  vec2 p = aPos.xz + uCamera.xz;',
    '  vec3 d = swell(p, uTime, uAmp);',
    '  vec3 w = vec3(p.x, 0.0, p.y) + d;',
    '  w.y += ripple(p, uRippleAt, uRipple.x, uRipple.y);',
    '  vWorld = w;',
    '  vGrid = p;',
    '  gl_Position = uViewProj * vec4(w, 1.0);',
    '}'
  ].join('\n');

  var OCEAN_FS = [
    'in vec3 vWorld;',
    'in vec2 vGrid;',
    'uniform vec3 uCamera;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunColor;',
    'uniform vec3 uBoilPos;',
    'uniform vec3 uBoilColor;',
    'uniform float uBoilPower;',
    'uniform vec3 uFogColor;',
    'uniform vec3 uDeepColor;',
    'uniform float uFogDensity;',
    'uniform float uTime;',
    'uniform float uAmp;',
    'uniform vec2 uRippleAt;',
    'uniform vec2 uRipple;',
    'out vec4 outColor;',
    'void main(){',
    '  vec3 V = normalize(uCamera - vWorld);',
    '  vec3 N = swellNormal(vGrid, uTime, uAmp, 0.09);',

    /* the impact ring gets its own normal contribution, or the
       rings displace the surface without lighting it */
    '  float e = 0.06;',
    '  float r0 = ripple(vGrid, uRippleAt, uRipple.x, uRipple.y);',
    '  float rx = ripple(vGrid+vec2(e,0.0), uRippleAt, uRipple.x, uRipple.y);',
    '  float rz = ripple(vGrid+vec2(0.0,e), uRippleAt, uRipple.x, uRipple.y);',
    '  N = normalize(N + vec3(-(rx-r0)/e, 0.0, -(rz-r0)/e));',

    /* fine chop, high frequency, animated — this is what keeps
       the water from looking like moving glass */
    '  vec3 cp = vec3(vGrid*3.4, uTime*0.30);',
    '  float c1 = fbm3(cp, 3), c2 = fbm3(cp*2.7 + 13.0, 2);',
    '  N = normalize(N + vec3(c1-0.5, 0.0, c2-0.5) * 0.52);',

    /* Detail normals, three scales, each fading out as its own
       period drops under a couple of pixels. Without the fade the
       far water boils with per-pixel noise; without the detail the
       near water is moving glass. The fade is why the horizon
       stays calm while the foreground stays sharp. */
    '  float dist0 = length(uCamera - vWorld);',
    '  float lodF = 1.0 / (1.0 + dist0 * dist0 * 0.0016);',
    '  vec3 dp = vec3(vGrid * 11.0, uTime * 0.55);',
    '  float d1 = fbm3(dp, 3), d2 = fbm3(dp * 3.1 + 27.0, 2);',
    '  N = normalize(N + vec3(d1 - 0.5, 0.0, d2 - 0.5) * 0.42 * lodF);',

    '  float NoV = max(dot(N,V), 1e-4);',
    /* Water's real index of refraction, not a made-up f0. It is
       what makes the sea mirror-bright at the horizon and nearly
       transparent underfoot, which is most of a sea's depth cue. */
    '  float fres = 0.02 + 0.98*pow(1.0-NoV, 5.0);',

    '  vec3 L = normalize(uSunDir);',
    '  vec3 Hv = normalize(V+L);',
    '  float NoH = max(dot(N,Hv),0.0);',
    '  float NoL = max(dot(N,L), 0.0);',

    /* Two specular lobes, not one. The tight lobe is the hard
       glitter — the individual sparks that only exist where a
       wavelet happens to face the sun exactly. The wide lobe is
       the sheet of light down the swell that joins them up. A
       single medium lobe gives neither: it is a smear. */
    '  float aT = 0.018, aW = 0.115;',
    '  float sT = D_GGX(NoH, aT) * V_Smith(NoV, NoL, aT) * NoL;',
    '  float sW = D_GGX(NoH, aW) * V_Smith(NoV, NoL, aW) * NoL;',
    '  vec3 col = uSunColor * (sT * 1.35 + sW * 0.55) * fres;',

    /* The sky it is actually standing under, evaluated along the
       reflected ray. Same function the sky pass draws, so the
       horizon line is a change of texture and not a change of
       world. */
    '  vec3 R = reflect(-V, N);',
    '  R.y = abs(R.y);',
    '  col += skyColor(R, L, uSunColor, uFogColor) * fres;',

    /* What comes back up through the surface: the deep colour,
       plus the sub-surface glow in the backs of waves that are
       between the eye and the sun. That glow is the green-teal in
       a lifted wave and it is most of what says "water" rather
       than "blue floor". */
    '  float thin = smoothstep(0.02, 0.22, max(N.y, 0.0) * 0.30 + max(0.0, dot(-V, L)) * 0.55);',
    '  vec3 through = uDeepColor + uSunColor * uDeepColor * thin * 1.30;',
    '  col += through * (1.0 - fres);',

    /* the boil throwing warm light onto the water under the pail */
    '  vec3 dL = uBoilPos - vWorld;',
    '  float dist = length(dL);',
    '  vec3 L2 = dL/max(dist,1e-4);',
    '  vec3 H2 = normalize(V+L2);',
    '  float NoL2 = max(dot(N,L2), 0.0);',
    '  float s2 = D_GGX(max(dot(N,H2),0.0), 0.22) * V_Smith(NoV, NoL2, 0.22) * NoL2;',
    '  float at = uBoilPower / (1.0 + dist*dist*0.22);',
    '  col += uBoilColor * at * (s2*fres*2.6 + NoL2*0.055);',

    /* foam where the surface is steep — crests only, and only
       where the chop agrees, so it does not stripe the swell */
    '  float steep = smoothstep(0.965, 0.80, N.y);',
    '  float foam = steep * smoothstep(0.58, 0.90, c1) * 0.30;',
    '  foam += smoothstep(0.02, 0.16, abs(r0)) * 0.34;',
    /* Foam is a diffuse white sitting in the same light as
       everything else, not a fixed colour — lit foam under a low
       sun is warm, and foam in the trough is sky-blue. */
    '  vec3 foamCol = uSunColor * (0.30 + NoL * 0.55) + uFogColor * 0.30;',
    '  col = mix(col, foamCol, clamp(foam, 0.0, 0.55));',

    '  float d = dist0;',
    '  float fog = 1.0 - exp(-pow(d*uFogDensity, 2.0));',
    '  col = mix(col, uFogColor, clamp(fog,0.0,0.99));',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ── sky ─────────────────────────────────────────────────────
     Drawn on the fullscreen triangle with the inverse view-proj,
     so it is a real direction per pixel and the sun stays put when
     the camera rolls.

     A daylight sky is not a gradient with a dot on it. Three
     things have to be there or the water below has nothing
     convincing to reflect:

       · Rayleigh — the blue is strongest at the zenith and washes
         to near-white at the horizon, because the horizon is
         kilometres more air.
       · Mie — a broad forward-scattering halo tens of degrees wide
         around the sun. This is most of what makes a low sun look
         hot, and it is the part a plain sun disc misses.
       · Ground haze — the bottom of the sky is lit from below by
         the sea, so it never goes to the same blue as the top.

     `skyColor` is factored out because the ocean reflects this
     exact function rather than an approximation of it. Two
     different skies — one drawn, one reflected — is the single
     fastest way to make water look pasted on. */

  var SKY_FN = [
    'vec3 skyColor(vec3 D, vec3 sunDir, vec3 sunCol, vec3 haze){',
    '  float h = D.y;',
    /* Rayleigh: deep at the top, thin and bright at the horizon */
    '  float t = pow(clamp(1.0 - max(h, 0.0), 0.0, 1.0), 2.6);',
    '  vec3 zenith = vec3(0.115, 0.265, 0.520);',
    '  vec3 col = mix(zenith, haze, t);',
    /* below the horizon the sky is really the sea's own light */
    '  col = mix(haze * 0.72, col, smoothstep(-0.14, 0.02, h));',
    /* Mie forward scatter — wide, warm, and centred on the sun */
    '  float md = max(dot(D, sunDir), 0.0);',
    '  col += sunCol * pow(md, 11.0) * 0.055;',
    '  col += sunCol * pow(md, 46.0) * 0.135;',
    /* The disc lives in here rather than in the sky pass, because
       a metal pail with no sun in its reflection is a grey object,
       and the specular highlight on wet shell outdoors *is* the
       reflected sun. Putting it in the shared function is what
       gives every surface the same one. */
    '  col += sunCol * smoothstep(0.99965, 0.99988, md) * 30.0;',
    '  return col;',
    '}'
  ].join('\n');

  var SKY_FS = [
    'in vec2 vUv;',
    'uniform mat4 uInvViewProj;',
    'uniform vec3 uCamera;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunColor;',
    'uniform vec3 uFogColor;',
    'uniform vec3 uDeepColor;',
    'uniform float uTime;',
    'uniform float uSunSize;',
    'uniform float uStars;',
    /* How bright the sky *draws*, independent of how brightly it
       lights. The dish pages want a daylight key and fill but a
       dark backdrop to stand a plate against — the same thing a
       photographer gets by putting a black flag behind the subject
       without touching the lights. Coupling the two forces a
       choice between correctly lit food and a readable page. */
    'uniform float uSkyDim;',
    'out vec4 outColor;',
    NOISE,
    SKY_FN,
    'void main(){',
    '  vec4 ndc = vec4(vUv*2.0-1.0, 1.0, 1.0);',
    '  vec4 wp = uInvViewProj * ndc;',
    '  vec3 D = normalize(wp.xyz/wp.w - uCamera);',

    '  float h = D.y;',
    '  vec3 S = normalize(uSunDir);',
    '  vec3 col = skyColor(D, S, uSunColor, uFogColor);',

    /* The disc itself comes from skyColor, so the sky, the water's
       reflection and every metal surface agree on where the sun is
       and how bright it is. uSunSize survives as a widener for the
       acts that want a hazier sun. */
    '  float md = dot(D, S);',
    '  col += uSunColor * smoothstep(1.0 - uSunSize, 1.0 - uSunSize*0.35, md) * 3.0;',

    /* Cloud band, lit from the sun side and shadowed away from it.
       The second noise sample offset toward the sun is the whole
       trick: the difference between the two is a cheap stand-in
       for how deep the cloud is along the light, which gives it a
       bright edge and a grey underside instead of reading as a
       flat stain. Kept thin — the subject is the water. */
    '  float ch = max(h, 0.035);',
    '  vec2 cuv = D.xz / ch * 1.5;',
    '  float cl = fbm3(vec3(cuv + uTime*0.010, uTime*0.008), 4);',
    '  float cs = fbm3(vec3(cuv + S.xz*0.60 + uTime*0.010, uTime*0.008), 4);',
    '  float cd = smoothstep(0.50, 0.88, cl) * smoothstep(0.015, 0.28, h);',
    '  vec3 lit = mix(uFogColor*0.80, uSunColor*1.25, clamp((cl-cs)*2.6+0.5, 0.0, 1.0));',
    '  col = mix(col, lit, cd * 0.60);',

    /* Stars survive for whatever runs at night — uStars is zero in
       daylight and the whole block folds away. */
    '  if(uStars > 0.001){',
    '    vec3 sd = D * 340.0;',
    '    vec3 sc = floor(sd), sf = fract(sd) - 0.5;',
    '    float st = pow(hash13(sc), 78.0) * 1.5;',
    '    st *= smoothstep(0.40, 0.02, length(sf));',
    '    st *= smoothstep(0.02, 0.42, h) * uStars;',
    '    col += vec3(0.70,0.80,1.0) * st;',
    '  }',

    '  outColor = vec4(col * uSkyDim, 1.0);',
    '}'
  ].join('\n');

  /* ── steam ───────────────────────────────────────────────────
     Raymarched at half resolution against the scene's depth
     buffer, so it goes *behind* the shrimp it is rising off
     rather than over them. Sixteen steps with a blue-noise
     offset; more steps look no better and the offset is what
     turns banding into grain.

     The density field is a curl-warped fbm advected upward, with
     the plume widening and cooling as it goes — cooling meaning
     it loses the boil's colour and takes the sky's. */

  var STEAM_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uDepth;',
    'uniform mat4 uInvViewProj;',
    'uniform vec3 uCamera;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunColor;',
    'uniform vec3 uBoilColor;',
    'uniform vec3 uOrigin;',
    'uniform float uTime;',
    'uniform float uStrength;',
    'uniform float uRadius;',
    'uniform float uHeight;',
    'uniform vec2 uNearFar;',
    'out vec4 outColor;',
    NOISE,

    'float linearDepth(float d){',
    '  float n = uNearFar.x, f = uNearFar.y;',
    '  float z = d*2.0-1.0;',
    '  return (2.0*n*f)/(f+n-z*(f-n));',
    '}',

    'float density(vec3 p){',
    '  vec3 q = p - uOrigin;',
    '  float hgt = q.y / max(uHeight,1e-3);',
    '  if(hgt < -0.10 || hgt > 1.20) return 0.0;',

    /* rise, and swirl faster as it goes */
    '  vec3 w = q;',
    '  w.y -= uTime*0.52;',
    '  w.xz += vec2(sin(q.y*1.6 + uTime*0.7), cos(q.y*1.35 - uTime*0.55)) * (0.16 + hgt*0.42);',

    '  float n = fbm3(w*1.28, 4);',
    /* plume: narrow at the source, wide and ragged at the top */
    '  float rad = uRadius * (0.42 + hgt*1.55);',
    '  float radial = 1.0 - clamp(length(q.xz)/max(rad,1e-3), 0.0, 1.0);',
    '  float top = smoothstep(1.15, 0.42, hgt);',
    '  float base = smoothstep(-0.08, 0.16, hgt);',
    '  float d = radial*radial * top * base * (n - 0.36);',
    '  return max(d, 0.0) * 2.4;',
    '}',

    'void main(){',
    '  vec4 ndc = vec4(vUv*2.0-1.0, 1.0, 1.0);',
    '  vec4 wp = uInvViewProj * ndc;',
    '  vec3 D = normalize(wp.xyz/wp.w - uCamera);',

    '  float sceneZ = linearDepth(texture(uDepth, vUv).r);',

    /* Start the march at the plume, not the camera. The bounding
       sphere is generous and the entry point is where it is hit;
       marching from the near plane spends fifteen of sixteen
       steps in empty air. */
    '  vec3 oc = uCamera - (uOrigin + vec3(0.0, uHeight*0.5, 0.0));',
    '  float R = max(uRadius*2.0, uHeight*0.75);',
    '  float b = dot(oc, D);',
    '  float c = dot(oc,oc) - R*R;',
    '  float disc = b*b - c;',
    '  if(disc < 0.0 || uStrength <= 0.001){ outColor = vec4(0.0); return; }',
    '  float sq = sqrt(disc);',
    '  float t0 = max(-b - sq, 0.0), t1 = -b + sq;',
    '  if(t1 <= t0){ outColor = vec4(0.0); return; }',

    '  const int STEPS = 16;',
    '  float dt = (t1-t0)/float(STEPS);',
    '  float jitter = hash12(gl_FragCoord.xy + fract(uTime)*97.0);',
    '  float t = t0 + dt*jitter;',

    '  vec3 acc = vec3(0.0);',
    '  float trans = 1.0;',
    '  for(int i=0;i<STEPS;i++){',
    '    if(trans < 0.02) break;',
    '    if(t > sceneZ) break;',
    '    vec3 p = uCamera + D*t;',
    '    float d = density(p);',
    '    if(d > 0.001){',
    '      float hgt = clamp((p.y - uOrigin.y)/max(uHeight,1e-3), 0.0, 1.0);',
    /* the plume cools as it rises: boil-lit at the base, sky-lit
       at the top, and never both at once in the same voxel */
    '      vec3 lit = mix(uBoilColor*1.25, uSunColor*0.72, smoothstep(0.05, 0.72, hgt));',
    /* Cheap single scatter: a Henyey-Greenstein-ish forward lobe
       on the angle between the view ray and the moon. Looking
       into the light through the plume is where steam is
       brightest, and a constant term misses exactly that. */
    '      float cosT = dot(D, normalize(uSunDir));',
    '      lit *= 0.42 + 0.90*pow(max(cosT,0.0), 2.6) + 0.22*max(-cosT,0.0);',
    '      float ai = d * dt * uStrength * 1.35;',
    '      acc += lit * ai * trans;',
    '      trans *= exp(-ai*1.10);',
    '    }',
    '    t += dt;',
    '  }',
    '  outColor = vec4(acc, 1.0 - trans);',
    '}'
  ].join('\n');

  /* ── particles ───────────────────────────────────────────────
     Spray, embers, plankton and the fog motes, all one instanced
     quad billboarded in the vertex shader. Soft-particle fade
     against scene depth, or every mote cuts a hard disc into the
     object behind it. */

  var PART_VS = [
    'layout(location=0) in vec2 aCorner;',
    'layout(location=1) in vec4 iPos;',    /* xyz + size */
    'layout(location=2) in vec4 iColor;',  /* rgb + alpha */
    'layout(location=3) in vec4 iMisc;',   /* spin, streak, kind, seed */
    'uniform mat4 uViewProj;',
    'uniform vec3 uRight;',
    'uniform vec3 uUp;',
    'out vec2 vC;',
    'out vec4 vColor;',
    'out vec4 vMisc;',
    'out float vViewZ;',
    'uniform mat4 uView;',
    'void main(){',
    '  float s = sin(iMisc.x), c = cos(iMisc.x);',
    '  vec2 q = vec2(aCorner.x*c - aCorner.y*s, aCorner.x*s + aCorner.y*c);',
    /* streaked along the velocity direction for spray */
    '  q.y *= 1.0 + iMisc.y;',
    '  vec3 w = iPos.xyz + (uRight*q.x + uUp*q.y) * iPos.w;',
    '  vC = aCorner;',
    '  vColor = iColor;',
    '  vMisc = iMisc;',
    '  vViewZ = -(uView * vec4(w,1.0)).z;',
    '  gl_Position = uViewProj * vec4(w,1.0);',
    '}'
  ].join('\n');

  var PART_FS = [
    'in vec2 vC;',
    'in vec4 vColor;',
    'in vec4 vMisc;',
    'in float vViewZ;',
    'uniform sampler2D uDepth;',
    'uniform vec2 uNearFar;',
    'uniform vec2 uResolution;',
    'out vec4 outColor;',
    'float linearDepth(float d){',
    '  float n=uNearFar.x, f=uNearFar.y; float z=d*2.0-1.0;',
    '  return (2.0*n*f)/(f+n-z*(f-n));',
    '}',
    'void main(){',
    '  float r = length(vC);',
    '  if(r > 1.0) discard;',
    '  float a = pow(1.0 - r, 1.9);',
    /* kind 1 = a droplet: a bright core with a lens highlight */
    '  if(vMisc.z > 0.5){',
    '    a = pow(1.0-r, 3.2) + smoothstep(0.42,0.0,length(vC-vec2(-0.22,0.26)))*0.55;',
    '  }',
    '  float sceneZ = linearDepth(texture(uDepth, gl_FragCoord.xy/uResolution).r);',
    '  float soft = clamp((sceneZ - vViewZ)*2.2, 0.0, 1.0);',
    '  outColor = vec4(vColor.rgb * a * vColor.a * soft, 0.0);',
    '}'
  ].join('\n');

  /* ── post ────────────────────────────────────────────────────
     Dual-filter bloom: four downsamples with a 13-tap tent, four
     upsamples adding back in. Cheaper than a separable gaussian
     at this radius and it does not ring. */

  var FS_VS = [
    'layout(location=0) in vec2 aPos;',
    'out vec2 vUv;',
    'void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }'
  ].join('\n');

  var BRIGHT_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform float uThreshold;',
    'uniform float uKnee;',
    'out vec4 outColor;',
    'void main(){',
    '  vec3 c = texture(uTex, vUv).rgb;',
    '  float l = dot(c, vec3(0.2126,0.7152,0.0722));',
    /* soft knee, so a highlight ramps into the bloom instead of
       popping into it as it crosses the threshold */
    '  float k = uKnee;',
    '  float soft = clamp(l - uThreshold + k, 0.0, 2.0*k);',
    '  soft = soft*soft/(4.0*k + 1e-5);',
    '  float w = max(soft, l - uThreshold) / max(l, 1e-5);',
    '  outColor = vec4(c*w, 1.0);',
    '}'
  ].join('\n');

  var DOWN_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 t = uTexel;',
    '  vec3 a = texture(uTex, vUv + vec2(-t.x*2.0,  t.y*2.0)).rgb;',
    '  vec3 b = texture(uTex, vUv + vec2( 0.0,      t.y*2.0)).rgb;',
    '  vec3 c = texture(uTex, vUv + vec2( t.x*2.0,  t.y*2.0)).rgb;',
    '  vec3 d = texture(uTex, vUv + vec2(-t.x*2.0,  0.0)).rgb;',
    '  vec3 e = texture(uTex, vUv).rgb;',
    '  vec3 f = texture(uTex, vUv + vec2( t.x*2.0,  0.0)).rgb;',
    '  vec3 g = texture(uTex, vUv + vec2(-t.x*2.0, -t.y*2.0)).rgb;',
    '  vec3 h = texture(uTex, vUv + vec2( 0.0,     -t.y*2.0)).rgb;',
    '  vec3 i = texture(uTex, vUv + vec2( t.x*2.0, -t.y*2.0)).rgb;',
    '  vec3 j = texture(uTex, vUv + vec2(-t.x, t.y)).rgb;',
    '  vec3 k = texture(uTex, vUv + vec2( t.x, t.y)).rgb;',
    '  vec3 l = texture(uTex, vUv + vec2(-t.x,-t.y)).rgb;',
    '  vec3 m = texture(uTex, vUv + vec2( t.x,-t.y)).rgb;',
    '  vec3 o = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;',
    '  outColor = vec4(o, 1.0);',
    '}'
  ].join('\n');

  var UP_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',
    'uniform float uScale;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 t = uTexel*uScale;',
    '  vec3 s = texture(uTex, vUv + vec2(-t.x, 0.0)).rgb;',
    '  s += texture(uTex, vUv + vec2(-t.x*0.5,  t.y*0.5)).rgb*2.0;',
    '  s += texture(uTex, vUv + vec2( 0.0,      t.y)).rgb;',
    '  s += texture(uTex, vUv + vec2( t.x*0.5,  t.y*0.5)).rgb*2.0;',
    '  s += texture(uTex, vUv + vec2( t.x,      0.0)).rgb;',
    '  s += texture(uTex, vUv + vec2( t.x*0.5, -t.y*0.5)).rgb*2.0;',
    '  s += texture(uTex, vUv + vec2( 0.0,     -t.y)).rgb;',
    '  s += texture(uTex, vUv + vec2(-t.x*0.5, -t.y*0.5)).rgb*2.0;',
    '  outColor = vec4(s/12.0, 1.0);',
    '}'
  ].join('\n');

  /* Moon shafts: radial blur toward the moon's screen position,
     masked to the bright pass so only the moon and the specular
     off the water throw them. Twenty-four taps at quarter res. */
  var SHAFT_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uSun;',
    'uniform float uDecay;',
    'uniform float uWeight;',
    'uniform float uDensity;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 delta = (uv - uSun) * (uDensity/24.0);',
    '  float illum = 1.0;',
    '  vec3 acc = vec3(0.0);',
    '  for(int i=0;i<24;i++){',
    '    uv -= delta;',
    '    acc += texture(uTex, uv).rgb * illum * uWeight;',
    '    illum *= uDecay;',
    '  }',
    '  outColor = vec4(acc/24.0, 1.0);',
    '}'
  ].join('\n');


  /* ── FXAA ────────────────────────────────────────────────────
     The context is created with `antialias: false` because the
     scene is rendered into a float target and resolved in post —
     but the resolve was never written, so every silhouette in the
     film has been hard-aliased from the beginning. On a shrimp
     seen against black water that is the single most artificial
     thing on screen: real edges are never one pixel wide.

     This is the classic luma-based FXAA, run on the tonemapped
     image as the last thing before the screen. It has to be after
     the tonemap, because it steers on perceived luminance and HDR
     values do not have one. */

  var FXAA_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',
    'out vec4 outColor;',
    'float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }',
    'void main(){',
    '  vec3 rgbM = texture(uTex, vUv).rgb;',
    '  float lM  = luma(rgbM);',
    '  float lNW = luma(texture(uTex, vUv + vec2(-1.0,-1.0)*uTexel).rgb);',
    '  float lNE = luma(texture(uTex, vUv + vec2( 1.0,-1.0)*uTexel).rgb);',
    '  float lSW = luma(texture(uTex, vUv + vec2(-1.0, 1.0)*uTexel).rgb);',
    '  float lSE = luma(texture(uTex, vUv + vec2( 1.0, 1.0)*uTexel).rgb);',

    '  float lMin = min(lM, min(min(lNW,lNE), min(lSW,lSE)));',
    '  float lMax = max(lM, max(max(lNW,lNE), max(lSW,lSE)));',
    /* a flat neighbourhood is left exactly alone, which is what
       keeps the grain and the star field from being smeared */
    '  if(lMax - lMin < max(0.028, lMax * 0.115)){ outColor = vec4(rgbM, 1.0); return; }',

    '  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));',
    '  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);',
    '  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);',
    '  dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;',

    '  vec3 rgbA = 0.5 * (texture(uTex, vUv + dir*(1.0/3.0 - 0.5)).rgb',
    '                   + texture(uTex, vUv + dir*(2.0/3.0 - 0.5)).rgb);',
    '  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(uTex, vUv - dir*0.5).rgb',
    '                                 + texture(uTex, vUv + dir*0.5).rgb);',
    /* the wider tap is only trusted while it stays inside the
       local luma range; outside it, it is overshooting an edge */
    '  float lB = luma(rgbB);',
    '  outColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);',
    '}'
  ].join('\n');

  /* ── composite ───────────────────────────────────────────────
     Aberration, then the grade, then the tonemap, then the
     vignette and the grain. Order matters: tonemapping after the
     grade means the grade works in linear light, and grain after
     the tonemap means the grain is not itself crushed. */

  var COMP_FS = [
    'in vec2 vUv;',
    'uniform sampler2D uScene;',
    'uniform sampler2D uBloom;',
    'uniform sampler2D uShafts;',
    'uniform float uBloomAmount;',
    'uniform float uShaftAmount;',
    'uniform float uAberration;',
    'uniform float uVignette;',
    'uniform float uGrain;',
    'uniform float uExposure;',
    'uniform float uTime;',
    'uniform float uFade;',
    'uniform float uWarp;',        /* the drop-impact lens ripple */
    'uniform vec2 uWarpAt;',
    'uniform vec2 uResolution;',
    'uniform vec3 uLift;',
    'uniform vec3 uGain;',
    'uniform float uSaturation;',
    'uniform float uContrast;',
    'out vec4 outColor;',
    NOISE,

    /* ACES, the Narkowicz fit. Fast, and its shoulder is what
       keeps a specular on wet shell from clipping to a white
       blob. */
    'vec3 aces(vec3 x){',
    '  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;',
    '  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);',
    '}',

    'void main(){',
    '  vec2 uv = vUv;',
    '  float aspect = uResolution.x/uResolution.y;',

    /* the impact ripple, as a lens distortion rather than a
       texture — the whole screen is water for one second */
    '  if(uWarp > 0.0001){',
    '    vec2 d = (uv - uWarpAt) * vec2(aspect, 1.0);',
    '    float r = length(d);',
    '    float w = sin(r*38.0 - uWarp*26.0) * exp(-r*3.4) * exp(-max(uWarp-1.0,0.0)*2.2);',
    '    uv += normalize(d + 1e-6) * w * 0.022 * min(uWarp*3.0,1.0) / vec2(aspect,1.0);',
    '  }',

    /* Chromatic aberration, growing toward the corners. The 0.18
       is what keeps it lens-like: without it the strongest act
       splits the channels by nearly thirty pixels at the corner,
       which stops reading as glass and starts reading as a fault
       in the display. */
    '  vec2 ctr = uv - 0.5;',
    '  float rr = dot(ctr,ctr);',
    '  vec2 off = ctr * rr * uAberration * 0.18;',
    '  vec3 col;',
    '  col.r = texture(uScene, uv + off).r;',
    '  col.g = texture(uScene, uv).g;',
    '  col.b = texture(uScene, uv - off).b;',

    '  col += texture(uBloom, uv).rgb * uBloomAmount;',
    '  col += texture(uShafts, uv).rgb * uShaftAmount;',

    '  col *= uExposure;',

    /* lift/gain grade in linear: cool the shadows toward the
       ocean, warm the highlights toward the boil */
    '  col = col*uGain + uLift*(1.0 - col);',

    '  col = aces(col);',

    /* ── saturation and contrast ──
       After the tonemap, not before. Saturating in linear light
       pushes values past the shoulder and clips them to hue-
       shifted mush; doing it here behaves the way a colourist's
       control does, and the ACES shoulder has already protected
       the highlights. Luminance is weighted, so pushing the
       saturation does not also brighten the frame. */
    '  float lum0 = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(vec3(lum0), col, uSaturation);',
    '  col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);',

    /* vignette, and a slight barrel darkening at the very corner */
    '  float vig = 1.0 - uVignette*pow(rr*2.0, 1.35);',
    '  col *= clamp(vig, 0.0, 1.0);',

    /* Grain in *tonemapped* space and scaled by luminance, so the
       blacks stay clean. Grain in the shadows of a matte-black
       page is the fastest way to make it look cheap. */
    '  float g = hash12(gl_FragCoord.xy + fract(uTime)*311.0) - 0.5;',
    '  float lum = dot(col, vec3(0.2126,0.7152,0.0722));',
    '  col += g * uGrain * (0.25 + lum*0.75);',

    '  col *= uFade;',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  SHRIMP.SH = {
    head: H,
    noise: NOISE,
    swell: SWELL,

    objVert: function (instanced) {
      return H + (instanced ? '#define INSTANCED\n' : '') +
        OBJ_VS_HEAD + '\n' + (instanced ? '' : OBJ_VS_UNIFORMS + '\n') + OBJ_VS_BODY;
    },
    /* Objects carry SKY_FN for the same reason the ocean does:
       what a wet shell reflects has to be the sky the scene is
       actually standing under. */
    objFrag: function () {
      return H + NOISE + '\n' + SHADE + '\n' + SKY_FN + '\n' + OBJ_FS;
    },
    depthVert: function (instanced) {
      return H + (instanced ? '#define INSTANCED\n' : '') + DEPTH_VS;
    },
    depthFrag: H + DEPTH_FS,

    oceanVert: H + OCEAN_VS,
    /* The ocean carries SKY_FN because it reflects the same sky the
       sky pass draws, rather than an approximation of it. */
    oceanFrag: H + NOISE + '\n' + SHADE + '\n' + SWELL + '\n' + SKY_FN + '\n' + OCEAN_FS,

    fsVert: H + FS_VS,
    skyFrag: H + SKY_FS,
    steamFrag: H + STEAM_FS,

    partVert: H + PART_VS,
    partFrag: H + PART_FS,

    brightFrag: H + BRIGHT_FS,
    downFrag: H + DOWN_FS,
    upFrag: H + UP_FS,
    shaftFrag: H + SHAFT_FS,
    compFrag: H + COMP_FS,
    fxaaFrag: H + FXAA_FS
  };

})(window);
