import * as THREE from "three";
import type { BlockObj, Vec3 } from "./blocking";

// Geometria de cada tipo de objeto do blocking (formas simples, só para posição e escala).
// Compartilhado entre o estúdio no computador e o visor no celular.

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function buildMesh(o: BlockObj) {
  const mat = new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.75, flatShading: o.type === "mountain" });
  const dark = new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.8 });
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos: Vec3, rot?: Vec3) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const person = (parent: THREE.Group, pos: Vec3, m: THREE.Material, scale = 1, ry = 0) => {
    const p = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 6, 12), m); body.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), m); head.position.y = 1.6;
    for (const x of [body, head]) { x.castShadow = true; p.add(x); }
    p.position.set(...pos); p.scale.setScalar(scale); p.rotation.y = ry;
    parent.add(p);
    return p;
  };
  const params = o.params ?? {};
  switch (o.type) {
    case "person": {
      person(g, [0, 0, 0], mat);
      add(new THREE.ConeGeometry(0.07, 0.18, 10), dark, [0, 1.6, 0.24], [Math.PI / 2, 0, 0]); // nariz = para onde olha
      add(new THREE.BoxGeometry(0.5, 0.06, 0.06), dark, [0, 1.1, 0.25]);
      break;
    }
    case "crowd": {
      const r = rng(params.seed ?? 1), n = Math.min(params.count ?? 30, 400), spread = params.spread ?? 6;
      for (let i = 0; i < n; i++) person(g, [(r() - 0.5) * spread, 0, (r() - 0.5) * spread * 0.6], mat, 0.9 + r() * 0.2, (r() - 0.5) * 0.6);
      break;
    }
    case "scatter": {
      const r = rng(params.seed ?? 1), n = Math.min(params.count ?? 300, 3000), spread = params.spread ?? 12, size = params.size ?? 0.25;
      const geo = new THREE.CircleGeometry(size, 8); geo.rotateX(-Math.PI / 2);
      const inst = new THREE.InstancedMesh(geo, mat, n);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) { const s = 0.6 + r() * 0.8; m4.makeScale(s, 1, s).setPosition((r() - 0.5) * spread, 0.01 + r() * 0.01, (r() - 0.5) * spread); inst.setMatrixAt(i, m4); }
      g.add(inst);
      break;
    }
    case "box": add(new THREE.BoxGeometry(1, 1, 1), mat, [0, 0.5, 0]); break;
    case "cylinder": add(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 24), mat, [0, 0.75, 0]); break;
    case "sphere": add(new THREE.SphereGeometry(0.5, 24, 16), mat, [0, 0.5, 0]); break;
    case "wall": add(new THREE.BoxGeometry(4, 2.6, 0.15), mat, [0, 1.3, 0]); break;
    case "screen": add(new THREE.BoxGeometry(1.6, 1, 0.05), mat, [0, 0, 0]); break;
    case "table": {
      add(new THREE.BoxGeometry(2, 0.08, 0.9), mat, [0, 0.75, 0]);
      for (const [x, z] of [[-0.9, 0.38], [0.9, 0.38], [-0.9, -0.38], [0.9, -0.38]]) add(new THREE.BoxGeometry(0.07, 0.75, 0.07), mat, [x, 0.375, z]);
      break;
    }
    case "chair": {
      add(new THREE.BoxGeometry(0.45, 0.06, 0.45), mat, [0, 0.45, 0]);
      add(new THREE.BoxGeometry(0.45, 0.5, 0.06), mat, [0, 0.72, -0.2]);
      for (const [x, z] of [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]]) add(new THREE.BoxGeometry(0.05, 0.45, 0.05), mat, [x, 0.225, z]);
      break;
    }
    case "bed": add(new THREE.BoxGeometry(1.6, 0.5, 2.1), mat, [0, 0.25, 0]); add(new THREE.BoxGeometry(1.6, 0.9, 0.1), mat, [0, 0.45, -1.05]); break;
    case "building": add(new THREE.BoxGeometry(6, 8, 5), mat, [0, 4, 0]); break;
    case "tree": add(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 8), new THREE.MeshStandardMaterial({ color: "#5d4037" }), [0, 0.8, 0]); add(new THREE.ConeGeometry(1, 2.6, 8), mat, [0, 2.8, 0]); break;
    case "mountain": add(new THREE.ConeGeometry(12, 10, 7, 1), mat, [0, 5, 0]); break;
    case "road": {
      add(new THREE.BoxGeometry(7, 0.02, 20), mat, [0, 0.01, 0]);
      const white = new THREE.MeshStandardMaterial({ color: "#f5f5f5" });
      for (let z = -9; z <= 9; z += 3) add(new THREE.BoxGeometry(0.15, 0.025, 1.4), white, [0, 0.015, z]);
      for (const x of [-3.3, 3.3]) add(new THREE.BoxGeometry(0.12, 0.025, 20), white, [x, 0.015, 0]);
      break;
    }
    case "car":
      add(new THREE.BoxGeometry(1.8, 0.7, 4.2), mat, [0, 0.65, 0]);
      add(new THREE.BoxGeometry(1.6, 0.6, 2), mat, [0, 1.3, -0.2]);
      for (const [x, z] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) add(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16), dark, [x, 0.35, z], [0, 0, Math.PI / 2]);
      break;
    case "arrow":
      add(new THREE.BoxGeometry(0.2, 0.05, 1.4), mat, [0, 0.03, 0]);
      add(new THREE.ConeGeometry(0.3, 0.5, 3), mat, [0, 0.03, 0.9], [Math.PI / 2, 0, 0]);
      break;
  }
  g.userData.id = o.id;
  return g;
}

/** Luz e chão padrão — iguais no computador e no celular. */
export function setupStage(scene: THREE.Scene, ground: string) {
  scene.add(new THREE.HemisphereLight("#ffffff", "#444444", 1.6));
  const sun = new THREE.DirectionalLight("#ffffff", 1.6);
  sun.position.set(6, 10, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: ground, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}

export const meshSig = (o: BlockObj) => `${o.type}|${o.color}|${JSON.stringify(o.params ?? {})}`;
