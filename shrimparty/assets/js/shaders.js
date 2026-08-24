/* ═══════════════════════════════════════════════════════════
   shaders.js — GLSL ES 3.00 for every pass.

   The whole look rests on one idea: **food is wet**. Almost
   nothing on a Shrimparty table is a dry matte surface. A boiled
   shell carries a film of sauce; fried breading is glazed with
   oil; a mussel is glossy inside and chalky outside; broth is a
   mirror with a skin on it. What separates a plate that looks
   edible from a plate that looks like plastic is not polygon
   count — it is that the specular response varies across the
   surface, and that what it reflects is a real room.

   So there is no cubemap and no image-based lighting rig here.
   The room is analytic: one hot lamp hanging over the table, a
   cool sheet of light from the window wall, and a warm bounce up
   off the board. `env()` evaluates that room for any direction
   and any roughness, which is what lets steel, wet shell, dry
   breading, ceramic, glass and liquid all read as different
   materials under one light without a single texture fetch.

   Wetness is per-instance and per-pixel: `wet` sets how much of
   the surface carries a sauce film, and a noise field decides
   where. That is the difference between "shiny" and "wet".
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});
  var S = (SP.SH = {});

  /* ══════════════════════════════════════════════════════════
     SHARED CHUNKS
     ══════════════════════════════════════════════════════════ */

  var COMMON = [
    '#define PI 3.14159265359',
    'float sat(float x){return clamp(x,0.,1.);}',
    'vec3 sat3(vec3 x){return clamp(x,0.,1.);}',

    /* value noise, matched to math.js so CPU drift and GPU
       detail agree about which way things are moving */
    'float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);}',
    'float noise3(vec3 p){',
    '  vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);',
    '  float n000=hash3(i),n100=hash3(i+vec3(1,0,0)),n010=hash3(i+vec3(0,1,0)),n110=hash3(i+vec3(1,1,0));',
    '  float n001=hash3(i+vec3(0,0,1)),n101=hash3(i+vec3(1,0,1)),n011=hash3(i+vec3(0,1,1)),n111=hash3(i+vec3(1,1,1));',
    '  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),',
    '             mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);',
    '}',
    'float fbm3(vec3 p){',
    '  float a=.5,s=0.;',
    '  for(int i=0;i<4;i++){s+=a*noise3(p);p*=2.03;a*=.5;}',
    '  return s;',
    '}'
  ].join('\n');

  /* The room, evaluated analytically.

     Three sources, in the order they matter:

     `lamp`   — the shade over the table. Small, hot, and the
                only thing in the room that makes a highlight you
                can point at. Its size in the reflection widens
                with roughness, which is the whole trick: the
                same lamp is a pinpoint on a wet shell and a soft
                sheet on a dry potato.
     `window` — a broad cool panel off to one side. It exists so
                the warm side of every object has something to be
                warm *against*; take it out and the image goes
                sepia.
     `board`  — the table bouncing warm light back up into the
                undersides. Without it, everything sits in a
                black hole and reads as a cut-out. */
  var ENV = [
    'uniform vec3 uLampDir;   // towards the lamp, from the table',
    'uniform vec3 uLampCol;',
    'uniform vec3 uWinDir;',
    'uniform vec3 uWinCol;',
    'uniform vec3 uBoardCol;',
    'uniform float uExposure;',

    'vec3 env(vec3 r, float rough){',
    /* This is the *environment*, not the key. The crisp highlight
       on a wet shell is already coming out of the direct GGX
       term; adding a normalised lamp lobe here on top of it
       double-counts the lamp, and because a normalised lobe's
       peak scales with its own tightness, the second copy landed
       at about fifty times the first and burned a hard white
       streak along every curved surface.

       So the lamp appears here only as the broad sheen its shade
       throws, at a peak of about one, and the window — which is
       big, and which the direct term treats as a weak fill — is
       the source that actually does the reflecting. */
    '  float g = mix(150., 1.6, pow(sat(rough), .45));',
    '  vec3 c = uLampCol * pow(sat(dot(r,uLampDir)), g) * mix(.95, .30, rough);',
    /* the window is broad, so it barely tightens with roughness */
    '  float win = pow(sat(dot(r,uWinDir)), mix(14., 1.6, rough));',
    '  c += uWinCol * win * .55;',
    /* the room itself: cool above, warm board below, and a
       gentle horizon band so nothing reflects pure black */
    '  float up = r.y*.5+.5;',
    '  c += mix(uBoardCol, uWinCol*.16, up) * .62;',
    '  return c;',
    '}'
  ].join('\n');

  /* Cook–Torrance, trimmed to what is on screen. */
  var BRDF = [
    'float ggx(float nh, float a){',
    '  float a2=a*a; float d=nh*nh*(a2-1.)+1.;',
    '  return a2/(PI*d*d+1e-7);',
    '}',
    'float smithG(float nv, float nl, float a){',
    '  float k=a*.5;',
    '  return (nv/(nv*(1.-k)+k))*(nl/(nl*(1.-k)+k));',
    '}',
    'vec3 fresnel(float vh, vec3 f0){',
    '  return f0 + (1.-f0)*pow(1.-vh,5.);',
    '}',

    /* One light, evaluated properly. `wrap` is how far the
       diffuse term bleeds past the terminator — 0 for a ceramic
       plate, high for shrimp meat and lemon flesh, which are
       translucent enough that the lit side leaks into the dark
       side. Without wrap, cooked shrimp reads as painted
       plastic. */
    'vec3 direct(vec3 N, vec3 V, vec3 L, vec3 col, vec3 alb, float rough, float metal, float wrap){',
    '  vec3 H=normalize(L+V);',
    '  float nl=dot(N,L);',
    '  float diffuse=sat((nl+wrap)/(1.+wrap));',
    '  float nv=sat(dot(N,V))+1e-4;',
    '  float nh=sat(dot(N,H)), vh=sat(dot(V,H));',
    '  float a=max(rough*rough,.002);',
    '  vec3 f0=mix(vec3(.038),alb,metal);',
    '  vec3 spec=fresnel(vh,f0)*ggx(nh,a)*smithG(nv,sat(nl)+1e-4,a)/(4.*nv*(sat(nl)+1e-4)+1e-4)*sat(nl);',
    '  vec3 kd=(1.-metal)*alb*(1./PI)*diffuse;',
    '  return (kd+spec)*col;',
    '}'
  ].join('\n');

  /* Percentage-closer filtering, 3×3, with a slope-scaled bias.
     A constant bias either acnes the flat table or detaches the
     contact shadow under a shrimp; scaling it by the light angle
     is what keeps both. */
  var SHADOW = [
    'uniform sampler2D uShadow;',
    'uniform mat4 uLightVP;',
    'uniform float uShadowTexel;',
    'float shadowAt(vec3 wp, float nl){',
    '  vec4 lp = uLightVP * vec4(wp,1.);',
    '  vec3 pc = lp.xyz/lp.w*.5+.5;',
    '  if(pc.z>1.||pc.x<0.||pc.x>1.||pc.y<0.||pc.y>1.) return 1.;',
    '  float bias = mix(.0025,.0005,nl);',
    '  float s=0.;',
    '  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){',
    '    float d=texture(uShadow,pc.xy+vec2(float(x),float(y))*uShadowTexel).r;',
    '    s += (pc.z-bias>d)?0.:1.;',
    '  }',
    '  return s/9.;',
    '}'
  ].join('\n');

  /* ══════════════════════════════════════════════════════════
     THE SURFACE PASS

     One program draws everything solid on the table. Instances
     carry their own transform and their own material, so a
     bucket, sixteen shrimp, five potatoes and three hundred
     flecks of seasoning are four draw calls, not three hundred
     and twenty-four.
     ══════════════════════════════════════════════════════════ */

  var SURF_ATTRS = [
    'layout(location=0) in vec3 aPos;',
    'layout(location=1) in vec3 aNrm;',
    'layout(location=2) in vec2 aUv;',
    'layout(location=3) in vec4 iM0;',
    'layout(location=4) in vec4 iM1;',
    'layout(location=5) in vec4 iM2;',
    'layout(location=6) in vec4 iM3;',
    'layout(location=7) in vec4 iAlbedo;   // rgb + roughness',
    'layout(location=8) in vec4 iSurf;     // metal, wet, subsurface, seed',
    'layout(location=9) in vec4 iExtra;    // emissive, crust, band/sauce, highlight'
  ].join('\n');

  S.surfVS = [
    '#version 300 es',
    'precision highp float;',
    SURF_ATTRS,
    'uniform mat4 uVP;',
    'uniform float uTime;',
    'out vec3 vW; out vec3 vN; out vec2 vUv;',
    'out vec4 vAlbedo; out vec4 vSurf; out vec4 vExtra;',
    'out vec3 vObj;',
    'void main(){',
    '  mat4 m = mat4(iM0,iM1,iM2,iM3);',
    '  vec4 wp = m * vec4(aPos,1.);',
    /* normals under the instance transform. Scales here are
       close enough to uniform that normalising the basis beats
       carrying an inverse-transpose per instance. */
    '  vec3 nx = normalize(iM0.xyz), ny = normalize(iM1.xyz), nz = normalize(iM2.xyz);',
    '  vN = normalize(mat3(nx,ny,nz) * aNrm);',
    '  vW = wp.xyz; vUv = aUv; vObj = aPos;',
    '  vAlbedo = iAlbedo; vSurf = iSurf; vExtra = iExtra;',
    '  gl_Position = uVP * wp;',
    '}'
  ].join('\n');

  S.surfFS = [
    '#version 300 es',
    'precision highp float;',
    COMMON, ENV, BRDF, SHADOW,
    'in vec3 vW; in vec3 vN; in vec2 vUv;',
    'in vec4 vAlbedo; in vec4 vSurf; in vec4 vExtra; in vec3 vObj;',
    'uniform vec3 uEye;',
    'uniform float uTime;',
    'layout(location=0) out vec4 oCol;',
    'layout(location=1) out vec4 oDepth;',

    'void main(){',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(uEye - vW);',
    '  float seed = vSurf.w;',
    '  vec3 alb = vAlbedo.rgb;',
    '  float rough = vAlbedo.a;',
    '  float metal = vSurf.x;',
    '  float wet   = vSurf.y;',
    '  float sss   = vSurf.z;',
    '  float crust = vExtra.y;',
    '  float band  = vExtra.z;',

    /* ── surface detail ──────────────────────────────────────
       Breading and shell both get their normal perturbed from a
       noise field in object space, so the detail sticks to the
       object rather than swimming when it moves. Two octaves:
       one for the lumps, one for the grain. */
    '  if(crust > .001){',
    '    vec3 q = vObj*46. + seed*11.;',
    '    float e = .55;',
    '    float n0 = fbm3(q);',
    '    vec3 g = vec3(fbm3(q+vec3(e,0,0))-n0, fbm3(q+vec3(0,e,0))-n0, fbm3(q+vec3(0,0,e))-n0);',
    '    N = normalize(N - g*crust*crust*7.0);',
    /* fried surfaces are not one colour: the high spots on the
       breading catch more heat and go darker */
    '    alb *= 1. + (n0-.5)*crust*1.15;',
    '    rough = clamp(rough + (n0-.5)*.25*crust, .06, 1.);',
    '  } else {',
    /* even a shell is not perfectly smooth */
    '    vec3 q = vObj*22. + seed*7.;',
    '    float n0 = fbm3(q);',
    '    N = normalize(N + vec3(0,0,0) + (vec3(n0)-.5)*.035);',
    '    alb *= 1. + (n0-.5)*.10;',
    '  }',

    /* ── the joint between two shell plates ──────────────────
       A boiled shell is not two colours in alternating stripes —
       that is a candy cane, and it is what the first pass looked
       like. The pale is the membrane at the leading lip of each
       plate, where the shell is thin enough to let light through
       it, so it is a narrow band at one end of the plate rather
       than the whole plate. `uv.y` runs along the sweep, and the
       lip is at zero. */
    '  if(band > .001){',
    '    float lip = smoothstep(.15, .012, vUv.y);',
    '    float grey = dot(alb, vec3(.30,.52,.18));',
    '    vec3 pale = mix(alb, vec3(grey), .40) * 1.55 + .02;',
    '    alb = mix(alb, pale, lip*band);',
    '    sss = mix(sss, min(1., sss + .45), lip*band);',
    '  }',

    /* ── the sauce film ──────────────────────────────────────
       `wet` is how much of the surface is under sauce; the noise
       field decides where. Where it is wet the surface gets a
       second, much smoother specular lobe over the top of the
       base material — the film, not the shell — and the base
       colour deepens, exactly the way anything looks darker when
       it is soaked. */
    '  float film = 0.;',
    '  if(wet > .001){',
    '    float w = fbm3(vObj*7.5 + seed*3.7);',
    '    film = sat((w - (1.-wet)*1.05) * 4.5);',
    /* sauce pools downwards; upward faces shed it, undersides
       hold it */
    '    film *= mix(.55, 1., sat(.5 - N.y*.5));',
    '    alb *= mix(1., .78, film);',
    '    rough = mix(rough, .085, film*.92);',
    '  }',

    '  float nl = sat(dot(N, uLampDir));',
    '  float sh = shadowAt(vW, nl);',

    '  vec3 c = vec3(0.);',
    '  c += direct(N,V,uLampDir,uLampCol,alb,rough,metal,sss) * mix(.16,1.,sh);',
    '  c += direct(N,V,uWinDir,uWinCol,alb,max(rough,.14),metal,sss*.6);',

    /* ambient: the room's own bounce, split so the underside
       picks up the board and the top picks up the ceiling */
    '  float up = N.y*.5+.5;',
    '  vec3 amb = mix(uBoardCol, uWinCol*.13, up);',
    '  c += alb*(1.-metal)*amb*mix(.42,1.,sh)*1.5;',

    /* specular reflection of the room */
    '  vec3 R = reflect(-V,N);',
    '  float nv = sat(dot(N,V));',
    '  vec3 f0 = mix(vec3(.038), alb, metal);',
    '  vec3 fr = f0 + (max(vec3(1.-rough),f0)-f0)*pow(1.-nv,5.);',
    '  c += env(R, rough) * fr * mix(.5,1.,sh);',

    /* the sauce film reflects the room a second time, at its own
       roughness, on top of whatever the shell already did */
    '  if(film > .001){',
    '    vec3 fc = vec3(.028) + (vec3(1.)-vec3(.028))*pow(1.-nv,5.);',
    '    c += env(R, .055) * fc * film * mix(.4,1.,sh) * 1.25;',
    '  }',

    /* ── translucency ────────────────────────────────────────
       Light coming through the object, not off it. Shrimp meat,
       lemon flesh, a mussel, the thin edge of a lettuce leaf.
       Cheap version: the lamp seen from behind, attenuated by
       how edge-on we are. */
    '  if(sss > .001){',
    '    float back = pow(sat(dot(V, -uLampDir)), 3.5);',
    '    float thin = pow(1.-nv, .6);',
    '    c += uLampCol * alb * back * thin * sss * .55 * sh;',
    '  }',

    /* heat: the sizzling plate, and only the sizzling plate */
    '  c += alb * vExtra.x;',

    /* hover: a rim, not a glow. It reads as the object catching
       the lamp as it turns, which is what a real object does
       when you pick it up. */
    '  if(vExtra.w > .001){',
    '    float rim = pow(1.-nv, 2.6);',
    '    c += (uLampCol*.55 + uWinCol*.35) * rim * vExtra.w * 1.7;',
    '    c *= 1. + vExtra.w*.10;',
    '  }',

    '  oCol = vec4(c*uExposure, 1.);',
    '  oDepth = vec4(length(uEye-vW), 0., 0., 1.);',
    '}'
  ].join('\n');

  /* ── shadow pass ─────────────────────────────────────────── */

  S.shadowVS = [
    '#version 300 es',
    'precision highp float;',
    SURF_ATTRS,
    'uniform mat4 uLightVP;',
    'void main(){',
    '  mat4 m = mat4(iM0,iM1,iM2,iM3);',
    '  gl_Position = uLightVP * m * vec4(aPos,1.);',
    '}'
  ].join('\n');

  S.shadowFS = [
    '#version 300 es',
    'precision highp float;',
    'void main(){}'
  ].join('\n');

  /* ══════════════════════════════════════════════════════════
     LIQUID

     Broth, sauce, juice. Same lighting as everything else, but
     the surface is displaced by a small bank of ripple sources —
     a spoon dragged through soup, a shrimp dropping back in, a
     finger on the sauce. Each source is a ring travelling
     outwards from where it started, losing height as it goes.

     The normal is taken from the analytic derivative of that sum
     rather than from finite differences, so the highlight
     travelling along a ripple crest is exact.
     ══════════════════════════════════════════════════════════ */

  var RIPPLES = [
    '#define NRIP 8',
    'uniform vec4 uRip[NRIP];   // xz = origin, z(w) = age, w = strength',
    'uniform float uRipSpeed;',
    'float ripHeight(vec2 p, out vec2 grad){',
    '  float h=0.; grad=vec2(0.);',
    '  for(int i=0;i<NRIP;i++){',
    '    float age=uRip[i].z, amp=uRip[i].w;',
    '    if(amp<=0.) continue;',
    '    vec2 d=p-uRip[i].xy;',
    '    float r=length(d)+1e-4;',
    '    float front=age*uRipSpeed;',
    '    float band=r-front;',
    '    float env=exp(-band*band*30.)*exp(-age*2.2)*exp(-r*1.1)*amp;',
    '    float ph=band*26.;',
    '    h += sin(ph)*env;',
    '    float dEnv=-60.*band*env;',
    '    grad += (d/r)*(cos(ph)*26.*env + sin(ph)*dEnv);',
    '  }',
    '  return h;',
    '}'
  ].join('\n');

  S.liquidVS = [
    '#version 300 es',
    'precision highp float;',
    SURF_ATTRS,
    COMMON, RIPPLES,
    'uniform mat4 uVP;',
    'uniform float uTime;',
    'out vec3 vW; out vec3 vN; out vec2 vUv;',
    'out vec4 vAlbedo; out vec4 vSurf; out vec4 vExtra;',
    'out float vEdge;',
    'void main(){',
    '  mat4 m = mat4(iM0,iM1,iM2,iM3);',
    '  vec4 wp = m*vec4(aPos,1.);',
    /* the idle state is not flat: a hot liquid always has a
       slow convection wander on it */
    '  vec2 g;',
    '  float h = ripHeight(wp.xz, g);',
    '  float idle = (noise3(vec3(wp.xz*3.4, uTime*.22))-.5)*.006*iExtra.z;',
    '  h = h*.016 + idle;',
    '  wp.y += h;',
    /* meniscus: the liquid climbs its container at the rim */
    '  vEdge = sat(1. - length(aPos.xz));',   // the disc is built at unit radius
    '  vN = normalize(vec3(-g.x*.016, 1., -g.y*.016));',
    '  vW = wp.xyz; vUv=aUv;',
    '  vAlbedo=iAlbedo; vSurf=iSurf; vExtra=iExtra;',
    '  gl_Position = uVP*wp;',
    '}'
  ].join('\n');

  S.liquidFS = [
    '#version 300 es',
    'precision highp float;',
    COMMON, ENV, BRDF, SHADOW,
    'in vec3 vW; in vec3 vN; in vec2 vUv;',
    'in vec4 vAlbedo; in vec4 vSurf; in vec4 vExtra; in float vEdge;',
    'uniform vec3 uEye; uniform float uTime;',
    'layout(location=0) out vec4 oCol;',
    'layout(location=1) out vec4 oDepth;',
    'void main(){',
    '  vec3 N=normalize(vN);',
    '  vec3 V=normalize(uEye-vW);',
    '  vec3 alb=vAlbedo.rgb;',
    /* a broth is not a clean fluid: fat beads on it, and the
       beads are what actually catch the lamp */
    '  float fat = fbm3(vec3(vW.xz*26., uTime*.10));',
    '  float bead = sat((fat-.55)*3.4);',
    '  float rough = mix(vAlbedo.a, .045, bead);',
    '  N = normalize(N + vec3(fat-.5, 0., fbm3(vec3(vW.zx*26.,uTime*.1))-.5)*bead*.22);',
    '  float nl=sat(dot(N,uLampDir));',
    '  float sh=shadowAt(vW,nl);',
    '  vec3 c=vec3(0.);',
    '  c += direct(N,V,uLampDir,uLampCol,alb,rough,0.,.5)*mix(.25,1.,sh);',
    '  c += direct(N,V,uWinDir,uWinCol*.8,alb,max(rough,.2),0.,.3);',
    '  float up=N.y*.5+.5;',
    '  c += alb*mix(uBoardCol,uWinCol*.13,up)*1.1;',
    '  vec3 R=reflect(-V,N);',
    '  float nv=sat(dot(N,V));',
    /* a liquid is dielectric: at grazing angles it is a mirror,
       face-on it is the colour of what is dissolved in it. This
       one Fresnel term is most of why broth reads as liquid. */
    '  float fr = .028 + .972*pow(1.-nv,5.);',
    '  c += env(R,rough)*fr*1.3*mix(.45,1.,sh);',
    '  c += env(R,.03)*bead*.5*fr;',
    /* the meniscus darkens where the liquid meets the wall */
    '  c *= mix(.72,1.,sat(vEdge*3.));',
    '  oCol=vec4(c*uExposure,1.);',
    '  oDepth=vec4(length(uEye-vW),0.,0.,1.);',
    '}'
  ].join('\n');

  /* ══════════════════════════════════════════════════════════
     SPRITES — steam, bubbles, oil mist, condensation

     Billboards, soft against the scene. The softness is the
     point: a steam puff that intersects the rim of a bowl with a
     hard edge is instantly a sprite, and the illusion is gone.
     The opaque pass writes view distance to a second attachment
     precisely so this pass can fade a puff out as it approaches
     whatever is behind it.

     Steam is lit rather than flat: it is denser away from the
     lamp and brighter where the lamp shines through it, which is
     what makes a plume read as volume instead of as fog.
     ══════════════════════════════════════════════════════════ */

  S.spriteVS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec3 aPos;',
    'layout(location=1) in vec3 aNrm;',
    'layout(location=2) in vec2 aUv;',
    'layout(location=3) in vec4 iPS;    // xyz pos, w size',
    'layout(location=4) in vec4 iCol;   // rgb, alpha',
    'layout(location=5) in vec4 iRot;   // rotation, kind, life, seed',
    'uniform mat4 uVP; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uEye;',
    'out vec2 vUv; out vec4 vCol; out vec4 vRot; out vec3 vW; out float vDist;',
    'void main(){',
    '  float s=sin(iRot.x), c=cos(iRot.x);',
    '  vec2 q = vec2(aPos.x*c - aPos.y*s, aPos.x*s + aPos.y*c) * iPS.w;',
    '  vec3 wp = iPS.xyz + uRight*q.x + uUp*q.y;',
    '  vW=wp; vUv=aUv; vCol=iCol; vRot=iRot;',
    '  vDist = length(uEye-wp);',
    '  gl_Position = uVP*vec4(wp,1.);',
    '}'
  ].join('\n');

  S.spriteFS = [
    '#version 300 es',
    'precision highp float;',
    COMMON,
    'in vec2 vUv; in vec4 vCol; in vec4 vRot; in vec3 vW; in float vDist;',
    'uniform sampler2D uSceneDepth;',
    'uniform vec2 uRes;',
    'uniform vec3 uLampDir; uniform vec3 uLampCol; uniform vec3 uWinCol;',
    'uniform float uExposure; uniform float uTime;',
    'layout(location=0) out vec4 oCol;',
    'void main(){',
    '  vec2 d = vUv*2.-1.;',
    '  float r = length(d);',
    '  if(r>1.) discard;',
    '  float kind = vRot.y;',
    '  float a;',
    '  vec3 tint;',
    '  if(kind < .5){',
    /* steam: a soft ball eaten into by noise, so the plume has
       structure instead of being a column of identical dots */
    '    float n = fbm3(vec3(d*1.7, vRot.w*4. + vRot.z*.55));',
    '    a = pow(sat(1.-r), 2.1) * sat(n*1.5-.15);',
    /* lit from the lamp side; the far side of every puff is in
       its own shadow */
    '    float lit = sat(dot(normalize(vec3(d,.55)), uLampDir))*.5+.5;',
    '    tint = mix(uWinCol*.30, uLampCol, lit*lit) * mix(.5,1.15,lit);',
    '  } else if(kind < 1.5){',
    /* a bubble: a ring, not a disc — the wall of the bubble is
       what you see, the middle is the drink behind it */
    '    float wall = smoothstep(1.,.80,r) * smoothstep(.55,.80,r);',
    '    float cap  = pow(sat(1.-length(d-vec2(-.28,.30))*2.6),3.)*.9;',
    '    a = wall*.85 + cap;',
    '    tint = mix(uWinCol*.5, uLampCol, .5)*1.3;',
    '  } else if(kind < 2.5){',
    /* a bead of condensation clinging to glass: a lens with a
       bright top edge and a dark bottom */
    '    float body = pow(sat(1.-r),1.4);',
    '    float hi = pow(sat(1.-length(d-vec2(-.30,.34))*2.2),4.);',
    '    a = body*.55 + hi*.9;',
    '    tint = mix(uWinCol*.6, uLampCol, .35)*1.1;',
    '  } else {',
    /* oil mist off the sizzling plate: hot, small, short-lived */
    '    a = pow(sat(1.-r),3.)*.8;',
    '    tint = uLampCol*1.9 + vec3(.35,.10,.0);',
    '  }',
    '  a *= vCol.a;',
    /* soft against the scene: fade as the sprite approaches
       whatever is behind it */
    '  float sceneD = texture(uSceneDepth, gl_FragCoord.xy/uRes).r;',
    '  a *= sat((sceneD - vDist) * mix(2.2, 9., step(.5,kind)));',
    '  if(a<=.002) discard;',
    '  oCol = vec4(tint*vCol.rgb*uExposure*a, a);',
    '}'
  ].join('\n');

  /* ══════════════════════════════════════════════════════════
     POST

     Down, up, composite. The blur chain is not bright-passed —
     it is the real image at low resolution — because it is doing
     two jobs at once: it is the bloom source *and* it is the
     out-of-focus image the depth of field mixes towards. Two
     chains would cost twice as much and look the same.
     ══════════════════════════════════════════════════════════ */

  S.postVS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec2 aPos;',
    'out vec2 vUv;',
    'void main(){ vUv=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }'
  ].join('\n');

  /* 13-tap box in two rings — the dual-filter downsample. Cheap,
     and it does not alias the way a naive 2×2 does. */
  S.downFS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel;',
    'out vec4 oCol;',
    'void main(){',
    '  vec4 c = texture(uTex,vUv)*.125;',
    '  c += (texture(uTex,vUv+vec2(-1,-1)*uTexel)+texture(uTex,vUv+vec2(1,-1)*uTexel)',
    '      + texture(uTex,vUv+vec2(-1,1)*uTexel)+texture(uTex,vUv+vec2(1,1)*uTexel))*.125;',
    '  c += (texture(uTex,vUv+vec2(-2,0)*uTexel)+texture(uTex,vUv+vec2(2,0)*uTexel)',
    '      + texture(uTex,vUv+vec2(0,-2)*uTexel)+texture(uTex,vUv+vec2(0,2)*uTexel))*.0625;',
    '  c += (texture(uTex,vUv+vec2(-2,-2)*uTexel)+texture(uTex,vUv+vec2(2,-2)*uTexel)',
    '      + texture(uTex,vUv+vec2(-2,2)*uTexel)+texture(uTex,vUv+vec2(2,2)*uTexel))*.03125;',
    '  oCol = c;',
    '}'
  ].join('\n');

  /* tent upsample, accumulating onto what is already there */
  S.upFS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uAmt;',
    'out vec4 oCol;',
    'void main(){',
    '  vec4 c = texture(uTex,vUv)*.25;',
    '  c += (texture(uTex,vUv+vec2(-1,0)*uTexel)+texture(uTex,vUv+vec2(1,0)*uTexel)',
    '      + texture(uTex,vUv+vec2(0,-1)*uTexel)+texture(uTex,vUv+vec2(0,1)*uTexel))*.125;',
    '  c += (texture(uTex,vUv+vec2(-1,-1)*uTexel)+texture(uTex,vUv+vec2(1,-1)*uTexel)',
    '      + texture(uTex,vUv+vec2(-1,1)*uTexel)+texture(uTex,vUv+vec2(1,1)*uTexel))*.0625;',
    '  oCol = c*uAmt;',
    '}'
  ].join('\n');

  S.compositeFS = [
    '#version 300 es',
    'precision highp float;',
    COMMON,
    'in vec2 vUv;',
    'uniform sampler2D uScene;',
    'uniform sampler2D uBlur;      // half-res, full colour',
    'uniform sampler2D uWide;      // eighth-res, full colour',
    'uniform sampler2D uDepth;     // view distance, R16F',
    'uniform vec2 uRes;',
    'uniform float uFocus;         // distance in focus',
    'uniform float uAperture;      // how fast it falls off',
    'uniform float uBloom;',
    'uniform float uGrain;',
    'uniform float uVignette;',
    'uniform float uTime;',
    'uniform float uFade;',
    'out vec4 oCol;',

    /* ACES, the RRT+ODT fit. This is what keeps a lamp highlight
       on a wet shell from clipping to a flat white blob — it
       rolls the top end off and desaturates it the way film
       does, which is the difference between "bright" and
       "blown". */
    'vec3 aces(vec3 x){',
    '  const mat3 IN = mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);',
    '  const mat3 OUT= mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);',
    '  vec3 v = IN*x;',
    '  vec3 a = v*(v+.0245786)-.000090537;',
    '  vec3 b = v*(.983729*v+.4329510)+.238081;',
    '  return sat3(OUT*(a/b));',
    '}',

    'void main(){',
    '  vec2 uv = vUv;',
    '  float dist = texture(uDepth,uv).r;',

    /* ── depth of field ──────────────────────────────────────
       Circle of confusion from real distance, not from a screen
       gradient. Two blur radii, so a shrimp four centimetres in
       front of the focal plane is softened and the far wall is
       gone. */
    '  float coc = sat(abs(dist-uFocus)/max(uAperture,.001));',
    '  coc = coc*coc*(3.-2.*coc);',
    '  vec3 sharp = texture(uScene,uv).rgb;',
    '  vec3 soft  = texture(uBlur,uv).rgb;',
    '  vec3 softer= texture(uWide,uv).rgb;',
    '  vec3 c = mix(sharp, mix(soft,softer,sat(coc*1.6-.55)), coc);',

    /* ── bloom ───────────────────────────────────────────────
       Bright-passed at composite time out of the blur chain we
       already have. A wet highlight blooms; a lit potato does
       not. */
    '  vec3 wide = texture(uWide,uv).rgb;',
    '  vec3 mid  = texture(uBlur,uv).rgb;',
    '  vec3 bloom = max(vec3(0.), wide-.86)*.52 + max(vec3(0.), mid-1.05)*.34;',
    '  c += bloom*uBloom;',

    /* ── grade ───────────────────────────────────────────────
       A gentle S: the shadows get a touch of the room's cool in
       them and the highlights keep the lamp's warmth, which is
       what stops a dark image from going flat grey. */
    '  c = aces(c);',
    '  float l = dot(c, vec3(.2126,.7152,.0722));',
    '  c = mix(c, c*vec3(.94,.97,1.06), sat(1.-l*2.4)*.5);',
    '  c = mix(c, c*vec3(1.05,1.0,.95), sat(l*1.6-.5)*.55);',
    '  c = mix(vec3(l), c, 1.10);',

    /* vignette, from the corner distance rather than from a
       radial gradient over the whole frame, so it does not eat
       into the middle */
    '  vec2 q = (uv-.5)*vec2(uRes.x/uRes.y,1.);',
    '  float vig = 1.-uVignette*sat(dot(q,q)*.85);',
    '  c *= vig;',

    /* grain, in the shadows only, at a size that survives a 4K
       panel */
    '  float g = hash3(vec3(gl_FragCoord.xy, floor(uTime*24.)))-.5;',
    '  c += g*uGrain*(1.-sat(l*1.8));',

    '  oCol = vec4(c*uFade, 1.);',
    '}'
  ].join('\n');

  /* ══════════════════════════════════════════════════════════
     THE ROOM

     Not a skybox — a room. The table is a real mesh; this is
     what is beyond it. A dark board wall, the lamp's pool on the
     ceiling, and the cool window slab. It is drawn on the
     fullscreen triangle behind everything, which keeps it free.
     ══════════════════════════════════════════════════════════ */

  S.roomFS = [
    '#version 300 es',
    'precision highp float;',
    COMMON, ENV,
    'in vec2 vUv;',
    'uniform mat4 uInvVP; uniform vec3 uEye; uniform vec2 uRes; uniform float uTime;',
    'layout(location=0) out vec4 oCol;',
    'layout(location=1) out vec4 oDepth;',
    'void main(){',
    '  vec4 p = uInvVP*vec4(vUv*2.-1., 1., 1.);',
    '  vec3 d = normalize(p.xyz/p.w - uEye);',
    /* the room falls off downwards into the board and upwards
       into the lamp's pool on the ceiling */
    '  float up = d.y*.5+.5;',
    '  vec3 c = mix(uBoardCol*.42, uWinCol*.055, sat(up*1.25));',
    '  c += uLampCol*pow(sat(dot(d,uLampDir)),9.)*.10;',
    /* the window wall: a broad slab, softened, with a mullion in
       it so it reads as a window and not as a gradient */
    '  float win = pow(sat(dot(d,uWinDir)), 7.);',
    '  float mull = smoothstep(.004,.02,abs(fract(d.y*4.2)-.5)-.10);',
    '  c += uWinCol*win*.10*mix(.35,1.,mull);',
    /* a slow drift in the darkness so a still frame is never
       perfectly dead */
    '  c *= 1.+ (fbm3(d*3.4 + uTime*.05)-.5)*.06;',
    '  oCol = vec4(c*uExposure, 1.);',
    '  oDepth = vec4(1e4,0.,0.,1.);',
    '}'
  ].join('\n');

})(window);
