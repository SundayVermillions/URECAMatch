"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const DEG = Math.PI / 180;
const FOV = 45;
const CAM_Z = 3.2; // with a unit sphere this fills about 79% of the canvas, which is what the lens in auth-shell is sized to

/** Lat/lng to a point on a sphere, east to the right when seen from outside. */
function ll(lat: number, lng: number, r = 1) {
  const phi = (90 - lat) * DEG;
  const th = (lng + 180) * DEG;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}

/** Points on the great circle between a and b, lifted off the surface in the middle. */
function arc(a: THREE.Vector3, b: THREE.Vector3, n = 40) {
  const ang = a.angleTo(b);
  const lift = 0.04 + 0.2 * (ang / Math.PI);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = Math.sin(ang) || 1;
    const p = a.clone().multiplyScalar(Math.sin((1 - t) * ang) / s).add(b.clone().multiplyScalar(Math.sin(t * ang) / s));
    out.push(p.normalize().multiplyScalar(1 + lift * Math.sin(Math.PI * t)));
  }
  return out;
}

// The shaders write colours straight to the screen, so keep the hex values as they are instead of converting them to linear.
const raw = (hex: string) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);

// Things behind the sphere fade out, so the front reads clearly and the back only hints at depth.
const FACE = "clamp((mv.z - c.z) * 0.5 + 0.5, 0.0, 1.0)";

function pointMat(color: string, size: number, scale: number, alpha = 1, fade = true) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: raw(color) }, uSize: { value: size }, uScale: { value: scale }, uAlpha: { value: alpha }, uFade: { value: fade ? 1 : 0 } },
    vertexShader: `uniform float uSize; uniform float uScale; uniform float uFade; varying float vF;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vF = mix(1.0, ${FACE}, uFade);
        gl_PointSize = uSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vF;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor, uAlpha * smoothstep(0.5, 0.2, d) * mix(0.14, 1.0, smoothstep(0.35, 0.6, vF)));
      }`,
    transparent: true,
    depthWrite: false,
  });
}

function lineMat(color: string, alpha: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: raw(color) }, uAlpha: { value: alpha } },
    vertexShader: `varying float vF;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vF = ${FACE};
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vF;
      void main() { gl_FragColor = vec4(uColor, uAlpha * mix(0.1, 1.0, smoothstep(0.35, 0.6, vF))); }`,
    transparent: true,
    depthWrite: false,
  });
}

/** Soft glass rim: bright at the silhouette, clear in the middle. */
function rimMat(color: string, alpha: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: raw(color) }, uAlpha: { value: alpha } },
    vertexShader: `varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vN;
      void main() { gl_FragColor = vec4(uColor, pow(1.0 - abs(vN.z), 2.4) * uAlpha); }`,
    transparent: true,
    depthWrite: false,
  });
}

/** The ball itself: a luminous core that deepens toward the edge, with a soft highlight from the upper left. */
function bodyMat(edge: string, core: string, alpha: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uEdge: { value: raw(edge) }, uCore: { value: raw(core) }, uAlpha: { value: alpha } },
    vertexShader: `varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uEdge; uniform vec3 uCore; uniform float uAlpha; varying vec3 vN;
      void main() {
        vec3 n = normalize(vN);
        float limb = pow(1.0 - abs(n.z), 1.05);
        vec3 c = mix(uCore, uEdge, limb);
        c += 0.14 * smoothstep(0.3, 1.0, dot(n, normalize(vec3(-0.45, 0.55, 0.75))));
        gl_FragColor = vec4(c, uAlpha);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

function segments(pairs: [THREE.Vector3, THREE.Vector3][]) {
  const pos: number[] = [];
  for (const [a, b] of pairs) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
function pointsGeo(pts: THREE.Vector3[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  return g;
}

/** Samples the earth land mask into dots on a sphere. Land is whichever side of the mask Africa falls on. */
async function landDots(step: number) {
  const img = new Image();
  img.src = "/globe/earth-water.png";
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const cx = cv.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(img, 0, 0);
  const lum = (lat: number, lng: number) => {
    const x = Math.min(cv.width - 1, Math.floor(((lng + 180) / 360) * cv.width));
    const y = Math.min(cv.height - 1, Math.floor(((90 - lat) / 180) * cv.height));
    const d = cx.getImageData(x, y, 1, 1).data;
    return (d[0] + d[1] + d[2]) / 3;
  };
  const landL = lum(8, 20);
  const seaL = lum(0, -150);
  const out: THREE.Vector3[] = [];
  for (let lat = -78; lat <= 82; lat += step) {
    const stepLng = step / Math.max(0.2, Math.cos(lat * DEG));
    for (let lng = -180; lng < 180; lng += stepLng) {
      const l = lum(lat, lng);
      if (Math.abs(l - landL) < Math.abs(l - seaL)) out.push(ll(lat, lng));
    }
  }
  return out;
}

/** Even spread of n points picked from candidates, starting from the given ones. */
function spread(candidates: THREE.Vector3[], start: THREE.Vector3[], n: number) {
  const chosen = [...start];
  while (chosen.length < n) {
    let best = candidates[0];
    let bestD = -1;
    for (const c of candidates) {
      let min = Infinity;
      for (const s of chosen) min = Math.min(min, c.angleTo(s));
      if (min > bestD) { bestD = min; best = c; }
    }
    chosen.push(best);
  }
  return chosen;
}

/**
 * The globe: a frosted blue glass ball, dotted continents, glowing city nodes joined by arcs,
 * and pulses travelling along the links. Drawn straight in three.js (no earth photo).
 */
export default function AuthOrb({ size, dots, links: linkColors, nodes: nodeColors, accent, body, core }: { size: number; dots: string[]; links: string[]; nodes: string[]; accent: string; body: string; core: string }) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20);
    camera.position.z = CAM_Z;
    const scale = (size * dpr) / (2 * Math.tan((FOV * DEG) / 2)); // world size to pixels at distance 1
    const world = new THREE.Group();
    scene.add(world);

    let disposed = false;
    const updaters: ((t: number, dt: number) => void)[] = [];

    // Glass: a frosted blue body and a bright rim
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.99, 48, 48), bodyMat(body, core, 0.94));
    ball.renderOrder = -10; // three sorts transparent objects by their bounds, so pin the ball behind everything on it
    world.add(ball);
    world.add(new THREE.Mesh(new THREE.SphereGeometry(1.0, 64, 64), rimMat(accent, 0.7)));

    landDots(1.7).then((land) => {
      if (disposed) return;
      // Continents in a few light blues, picked by a fixed hash so they do not shimmer
      const dotGroups = dots.map(() => [] as THREE.Vector3[]);
      land.forEach((p, i) => dotGroups[((i * 2654435761) >>> 0) % dots.length].push(p));
      dotGroups.forEach((g, i) => world.add(new THREE.Points(pointsGeo(g), pointMat(dots[i], 0.02, scale, 0.95))));

      const sg = ll(1.35, 103.82);
      const nodes = spread(land.filter((_, i) => i % 6 === 0), [sg], 30);
      const key = new Set<string>();
      const links: [number, number][] = [];
      const add = (i: number, j: number) => {
        const k = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (i !== j && !key.has(k)) { key.add(k); links.push([i, j]); }
      };
      nodes.forEach((n, i) => {
        nodes.map((m, j) => ({ j, d: n.angleTo(m) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2).forEach((o) => add(i, o.j));
      });
      for (const j of [6, 11, 15, 20, 25]) add(0, j); // Singapore as the hub
      const curves = links.map(([i, j]) => arc(nodes[i], nodes[j]));

      // Each link gets one of the link blues, so the network reads as several routes
      const linkGroups = linkColors.map(() => [] as [THREE.Vector3, THREE.Vector3][]);
      curves.forEach((c, k) => {
        for (let i = 0; i < c.length - 1; i++) linkGroups[k % linkColors.length].push([c[i], c[i + 1]]);
      });
      linkGroups.forEach((g, i) => world.add(new THREE.LineSegments(segments(g), lineMat(linkColors[i], 1))));

      const nodeGroups = nodeColors.map(() => [] as THREE.Vector3[]);
      nodes.forEach((n, i) => nodeGroups[i % nodeColors.length].push(n));
      const halos = nodeGroups.map((g, i) => {
        world.add(new THREE.Points(pointsGeo(g), pointMat(nodeColors[i], 0.062, scale, 1)));
        const h = pointMat(nodeColors[i], 0.17, scale, 0.32);
        world.add(new THREE.Points(pointsGeo(g), h));
        return h;
      });

      const pulseCurves = curves.slice(0, 18);
      const pulseGeo = pointsGeo(pulseCurves.map((c) => c[0]));
      const pulseMat = pointMat(accent, 0.055, scale, 1);
      world.add(new THREE.Points(pulseGeo, pulseMat));
      const pos = pulseGeo.getAttribute("position") as THREE.BufferAttribute;
      updaters.push((t) => {
        pulseCurves.forEach((c, i) => {
          const f = ((t * 0.22 + i * 0.137) % 1) * (c.length - 1);
          const a = c[Math.floor(f)];
          const b = c[Math.min(c.length - 1, Math.floor(f) + 1)];
          const k = f % 1;
          pos.setXYZ(i, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
        });
        pos.needsUpdate = true;
        halos.forEach((h) => { h.uniforms.uAlpha.value = 0.3 + 0.14 * Math.sin(t * 2); });
      });
      if (reduced) renderer.render(scene, camera);
    }).catch(() => { /* texture failed to load: the glass sphere alone still renders */ });
    // Spin fast and settle, drift with the pointer
    const tilt = { x: 0.35, y: 0 };
    const onMove = (e: PointerEvent) => {
      tilt.y = (e.clientX / window.innerWidth - 0.5) * 0.5;
      tilt.x = 0.35 + (e.clientY / window.innerHeight - 0.5) * 0.4;
    };
    window.addEventListener("pointermove", onMove);

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      const dt = clock.getDelta();
      const t = clock.elapsedTime;
      world.rotation.y += dt * (0.14 + 1.4 * Math.exp(-t / 1.5));
      world.rotation.x += (tilt.x - world.rotation.x) * 0.04;
      world.position.x += (tilt.y * 0.12 - world.position.x) * 0.04;
      const s = 0.82 + 0.18 * (1 - Math.exp(-t / 1.1));
      world.scale.setScalar(s);
      updaters.forEach((u) => u(t, dt));
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    world.rotation.x = 0.35;
    if (reduced) {
      updaters.forEach((u) => u(0, 0));
      renderer.render(scene, camera);
    } else {
      tick();
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [size, dots, linkColors, nodeColors, accent, body, core]);

  return <div ref={mount} style={{ width: size, height: size }} />;
}
