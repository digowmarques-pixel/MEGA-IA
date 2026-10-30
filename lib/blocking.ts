// Modelo de dados do estúdio de blocking 3D (previs). Tudo serializável em JSON.

export type Vec3 = [number, number, number];
export type ObjType =
  | "person" | "crowd" | "car" | "box" | "cylinder" | "sphere" | "wall" | "arrow"
  | "table" | "chair" | "bed" | "building" | "tree" | "mountain" | "road" | "scatter" | "screen";
export type ObjKey = { t: number; p: Vec3; r: Vec3; s: Vec3 };
/** params: multidão (count, spread, seed) · espalhar (count, spread, seed, size) */
export type ObjParams = { count?: number; spread?: number; seed?: number; size?: number };
export type BlockObj = { id: string; type: ObjType; name: string; color: string; keys: ObjKey[]; params?: ObjParams };
/** q (quaternion x,y,z,w) é opcional: vem da câmera do celular e preserva inclinação (dutch/handheld). */
export type CamKey = { t: number; p: Vec3; target: Vec3; lens: number; q?: [number, number, number, number] };
export type BlockingData = {
  version: 1;
  duration: number; // segundos
  fps: number;
  aspect: "16:9" | "9:16" | "1:1" | "21:9";
  ground: string;
  sky: string;
  objects: BlockObj[];
  camera: CamKey[];
  /** Direção de arte do prompt (o blocking define movimento; isto define o visual). */
  brief?: SceneBrief;
};
export type SceneBrief = { scene?: string; light?: string; style?: string; avoid?: string };

// Cores bem distintas entre si: o vídeo de referência usa a cor para identificar cada elemento.
export const COLORS = [
  { hex: "#e53935", name: "vermelho", en: "red" },
  { hex: "#1e88e5", name: "azul", en: "blue" },
  { hex: "#43a047", name: "verde", en: "green" },
  { hex: "#fdd835", name: "amarelo", en: "yellow" },
  { hex: "#8e24aa", name: "roxo", en: "purple" },
  { hex: "#fb8c00", name: "laranja", en: "orange" },
  { hex: "#00acc1", name: "ciano", en: "cyan" },
  { hex: "#f06292", name: "rosa", en: "pink" },
  { hex: "#ffffff", name: "branco", en: "white" },
  { hex: "#6d4c41", name: "marrom", en: "brown" },
  { hex: "#111111", name: "preto", en: "black" },
  { hex: "#e8a87c", name: "cor de pele", en: "skin-toned" },
  { hex: "#555555", name: "cinza", en: "grey" },
  { hex: "#c62828", name: "vermelho escuro", en: "dark red" },
];
export const colorName = (hex: string, lang: "pt" | "en" = "pt") => { const c = COLORS.find((x) => x.hex.toLowerCase() === hex.toLowerCase()); return c ? (lang === "en" ? c.en : c.name) : hex; };

export const OBJ_LABEL: Record<ObjType, string> = {
  person: "Personagem", crowd: "Multidão", car: "Carro", box: "Caixa", cylinder: "Cilindro", sphere: "Esfera", wall: "Parede", arrow: "Seta (direção)",
  table: "Mesa", chair: "Cadeira", bed: "Cama", building: "Prédio", tree: "Árvore", mountain: "Montanha", road: "Estrada", scatter: "Espalhar (flores/pontos)", screen: "Janela / tela",
};
export const OBJ_GROUPS: { label: string; types: ObjType[] }[] = [
  { label: "Personagens", types: ["person", "crowd"] },
  { label: "Objetos", types: ["car", "table", "chair", "bed", "box", "cylinder", "sphere", "arrow"] },
  { label: "Cenário", types: ["wall", "screen", "building", "tree", "mountain", "road", "scatter"] },
];
const OBJ_EN: Record<ObjType, string> = {
  person: "mannequin", crowd: "crowd of mannequins", car: "car", box: "box", cylinder: "cylinder", sphere: "sphere", wall: "wall", arrow: "arrow",
  table: "table", chair: "chair", bed: "bed", building: "building block", tree: "tree", mountain: "low-poly mountain", road: "road", scatter: "scattered dots", screen: "window/screen panel",
};
export const DEFAULT_PARAMS: Partial<Record<ObjType, ObjParams>> = { crowd: { count: 30, spread: 6, seed: 1 }, scatter: { count: 300, spread: 12, seed: 1, size: 0.25 } };

export const LENSES = [14, 18, 24, 35, 50, 85, 135];
/** FOV vertical (graus) de uma lente em sensor full-frame (24 mm de altura). */
export const lensToFov = (mm: number) => (2 * Math.atan(24 / (2 * mm)) * 180) / Math.PI;

export const ASPECTS: Record<BlockingData["aspect"], number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "21:9": 21 / 9 };
export function renderSize(aspect: BlockingData["aspect"], quality: "480p" | "720p") {
  const short = quality === "720p" ? 720 : 480;
  const r = ASPECTS[aspect];
  const even = (n: number) => Math.round(n / 2) * 2;
  return r >= 1 ? { width: even(short * r), height: short } : { width: short, height: even(short / r) };
}

const K = (p: Vec3, ry = 0, s: Vec3 = [1, 1, 1], t = 0) => ({ t, p, r: [0, ry, 0] as Vec3, s });
let tid = 0;
const O = (type: ObjType, name: string, color: string, keys: ObjKey[], params?: ObjParams): BlockObj => ({ id: `t${++tid}`, type, name, color, keys, ...(params ? { params } : {}) });

/** Mini cenas prontas (inspiradas no fluxo de previs com formas simples). */
export const TEMPLATES: { id: string; name: string; build: () => BlockingData }[] = [
  { id: "vazio", name: "Cena básica (2 personagens)", build: () => emptyScene() },
  { id: "estrada", name: "Estrada com montanhas", build: () => ({
    version: 1, duration: 8, fps: 24, aspect: "16:9", ground: "#4b5d3a", sky: "#bcd3e3",
    objects: [
      O("road", "Estrada", "#3a3a3a", [K([0, 0, 0], 0, [1, 1, 3])]),
      O("mountain", "Montanha grande", "#43a047", [K([-25, 0, -60], 0, [3, 3, 3])]), O("mountain", "Montanha", "#43a047", [K([30, 0, -50], 0.6, [2.2, 2.6, 2.2])]),
      O("person", "Skatista vermelha", "#e53935", [K([0.8, 0, -30], 0), K([0.8, 0, -2], 0, [1, 1, 1], 8)]),
      O("person", "Skatista amarelo", "#fdd835", [K([-1.2, 0, -34], 0), K([-1.2, 0, -8], 0, [1, 1, 1], 8)]),
    ],
    camera: [{ t: 0, p: [0, 1.4, 2], target: [0, 1.2, -20], lens: 24 }, { t: 8, p: [0.4, 1.4, 4], target: [0.6, 1.2, -5], lens: 24 }],
  }) },
  { id: "salao", name: "Salão com mesa longa", build: () => ({
    version: 1, duration: 6, fps: 24, aspect: "16:9", ground: "#7a6a58", sky: "#2b2b2b",
    objects: [
      O("wall", "Parede do fundo", "#e9dcc3", [K([0, 0, -5], 0, [3, 1.3, 1])]), O("screen", "Janela", "#1e3a5f", [K([0, 1.9, -4.9])]),
      O("table", "Mesa longa", "#ffffff", [K([0, 0, -2], 0, [4, 1, 1])]),
      O("crowd", "Convidados", "#e8a87c", [K([0, 0, -2.9], 0, [1, 1, 1])], { count: 13, spread: 7, seed: 3 }),
      O("person", "Protagonista", "#111111", [K([0, 0, -2.9], 0)]),
    ],
    camera: [{ t: 0, p: [0, 1.5, 5], target: [0, 1.2, -2], lens: 35 }, { t: 6, p: [0, 1.4, 2.5], target: [0, 1.3, -2.5], lens: 35 }],
  }) },
  { id: "multidao", name: "Corredor com multidão", build: () => ({
    version: 1, duration: 6, fps: 24, aspect: "16:9", ground: "#8a8a8a", sky: "#9aa4ad",
    objects: [
      O("crowd", "Multidão", "#e8a87c", [K([0, 0, -3])], { count: 60, spread: 8, seed: 7 }),
      O("person", "Líder (de preto)", "#111111", [K([0, 0, 2], Math.PI), K([0, 0, -1], Math.PI, [1, 1, 1], 6)]),
      O("screen", "Placa", "#1e3a5f", [K([2, 2.4, -8])]),
    ],
    camera: [{ t: 0, p: [0, 1.7, 5], target: [0, 1.5, 0], lens: 35 }, { t: 6, p: [0, 1.7, 1.5], target: [0, 1.6, -2], lens: 35 }],
  }) },
  { id: "carro", name: "Carro dentro da sala", build: () => ({
    version: 1, duration: 5, fps: 24, aspect: "16:9", ground: "#b71c1c", sky: "#f0e6d2",
    objects: [
      O("wall", "Parede (tapete)", "#c62828", [K([0, 0, -4], 0, [2.2, 1.2, 1])]), O("wall", "Parede lateral", "#f0e6d2", [K([-4.4, 0, 0], Math.PI / 2, [2, 1.2, 1])]),
      O("car", "Carro branco", "#ffffff", [K([0, 0, -1], Math.PI / 2)]),
      O("person", "Homem no teto do carro", "#fdd835", [K([0, 1.6, -1])]), O("person", "Homem à esquerda", "#fdd835", [K([-2.6, 0, -2.5])]),
    ],
    camera: [{ t: 0, p: [0, 1.4, 5], target: [0, 1, -1], lens: 24 }, { t: 5, p: [1.5, 1.6, 4], target: [0, 1.2, -1], lens: 24 }],
  }) },
  { id: "flores", name: "Campo de flores à noite", build: () => ({
    version: 1, duration: 6, fps: 24, aspect: "16:9", ground: "#2e7d32", sky: "#2a2f3a",
    objects: [
      O("scatter", "Papoulas", "#e53935", [K([0, 0.01, -3])], { count: 500, spread: 14, seed: 4, size: 0.3 }),
      O("person", "Homem de capuz", "#111111", [K([0, 0, -4])]),
      O("building", "Prédios ao fundo", "#555555", [K([-6, 0, -20], 0, [3, 1.5, 1])]), O("building", "Prédios ao fundo 2", "#555555", [K([7, 0, -22], 0, [3, 2, 1])]),
    ],
    camera: [{ t: 0, p: [0, 1.6, 4], target: [0, 1.3, -4], lens: 35 }, { t: 6, p: [0, 1.6, 0], target: [0, 1.4, -4], lens: 50 }],
  }) },
];

export function emptyScene(): BlockingData {
  return {
    version: 1, duration: 5, fps: 24, aspect: "16:9", ground: "#3a3a3a", sky: "#9aa4ad",
    objects: [
      { id: "p1", type: "person", name: "Protagonista", color: "#e53935", keys: [{ t: 0, p: [-2, 0, 0], r: [0, Math.PI / 2, 0], s: [1, 1, 1] }, { t: 5, p: [1.5, 0, 0], r: [0, Math.PI / 2, 0], s: [1, 1, 1] }] },
      { id: "p2", type: "person", name: "Coadjuvante", color: "#1e88e5", keys: [{ t: 0, p: [3, 0, 0.5], r: [0, -Math.PI / 2, 0], s: [1, 1, 1] }] },
      { id: "w1", type: "wall", name: "Parede do fundo", color: "#ffffff", keys: [{ t: 0, p: [0, 0, -3], r: [0, 0, 0], s: [3, 1, 1] }] },
    ],
    camera: [
      { t: 0, p: [0, 1.6, 7], target: [0, 1.1, 0], lens: 35 },
      { t: 5, p: [0.5, 1.5, 4.5], target: [0.5, 1.2, 0], lens: 35 },
    ],
  };
}

const ease = (x: number) => x * x * (3 - 2 * x); // smoothstep
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

function around<T extends { t: number }>(keys: T[], t: number): [T, T, number] {
  const ks = [...keys].sort((a, b) => a.t - b.t);
  if (t <= ks[0].t) return [ks[0], ks[0], 0];
  const last = ks[ks.length - 1];
  if (t >= last.t) return [last, last, 0];
  for (let i = 0; i < ks.length - 1; i++) {
    if (t >= ks[i].t && t <= ks[i + 1].t) return [ks[i], ks[i + 1], ease((t - ks[i].t) / (ks[i + 1].t - ks[i].t || 1))];
  }
  return [last, last, 0];
}

export function sampleObj(o: BlockObj, t: number) {
  const [a, b, k] = around(o.keys, t);
  return { p: lerp3(a.p, b.p, k), r: lerp3(a.r, b.r, k), s: lerp3(a.s, b.s, k) };
}

type Quat = [number, number, number, number];
function slerp(a: Quat, b: Quat, k: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (cos > 0.9995) {
    const r: Quat = [lerp(a[0], bx, k), lerp(a[1], by, k), lerp(a[2], bz, k), lerp(a[3], bw, k)];
    const n = Math.hypot(...r) || 1;
    return r.map((x) => x / n) as Quat;
  }
  const th = Math.acos(cos), s = Math.sin(th), wa = Math.sin((1 - k) * th) / s, wb = Math.sin(k * th) / s;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

export function sampleCam(keys: CamKey[], t: number) {
  // takes do celular têm uma key por quadro: interpolação linear (sem easing) para não "travar" o movimento
  const dense = keys.length > 12;
  const ks = [...keys].sort((x, y) => x.t - y.t);
  let a = ks[0], b = ks[0], k = 0;
  if (t > ks[0].t) {
    if (t >= ks[ks.length - 1].t) { a = b = ks[ks.length - 1]; }
    else for (let i = 0; i < ks.length - 1; i++) if (t >= ks[i].t && t <= ks[i + 1].t) { a = ks[i]; b = ks[i + 1]; const x = (t - a.t) / (b.t - a.t || 1); k = dense ? x : ease(x); break; }
  }
  const q = a.q && b.q ? slerp(a.q, b.q, k) : undefined;
  return { p: lerp3(a.p, b.p, k), target: lerp3(a.target, b.target, k), lens: lerp(a.lens, b.lens, k), q };
}

/** Insere ou atualiza o keyframe no tempo t (mesmo tempo = atualiza). */
export function upsertKey<T extends { t: number }>(keys: T[], key: T): T[] {
  const i = keys.findIndex((k) => Math.abs(k.t - key.t) < 0.04);
  const next = i >= 0 ? keys.map((k, j) => (j === i ? key : k)) : [...keys, key];
  return next.sort((a, b) => a.t - b.t);
}

/** Texto para colar no prompt: diz ao modelo o que cada cor representa e como usar o vídeo. */
export function legendFor(d: BlockingData) {
  const lines = d.objects.map((o) => `- ${colorName(o.color, "en")} ${OBJ_EN[o.type]} = ${o.name}`);
  return `Use the reference video ONLY as blocking/previs: follow its character positions, movement paths, timing and camera movement exactly, but replace the grey-box shapes with the real scene described below. Color key:\n${lines.join("\n")}`;
}

// ---------------- Prompt Blocking → Seedance ----------------
// Método: o blockout define composição, movimento, tempo e câmera; o texto só descreve o visual.
// O prompt descreve o que o blockout faz (sem inventar câmera) e termina com uma lista do que evitar.

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

// Cores livres (seletor de cor) viram o nome em inglês mais próximo: o modelo entende "navy", não "#1e3a5f".
const EXTRA_EN = [
  { hex: "#3a3a3a", en: "dark grey" }, { hex: "#9e9e9e", en: "light grey" }, { hex: "#e9dcc3", en: "beige" }, { hex: "#f0e6d2", en: "cream" },
  { hex: "#1e3a5f", en: "navy blue" }, { hex: "#4b5d3a", en: "olive green" }, { hex: "#90caf9", en: "light blue" }, { hex: "#1b5e20", en: "dark green" },
];
const rgb = (h: string) => { const n = parseInt(h.replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function colorEn(hex: string) {
  const exact = COLORS.find((x) => x.hex.toLowerCase() === hex.toLowerCase());
  if (exact) return exact.en;
  const [r, g, b] = rgb(hex);
  let best = "grey", bd = Infinity;
  for (const c of [...COLORS, ...EXTRA_EN]) {
    const [r2, g2, b2] = rgb(c.hex);
    const dist = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (dist < bd) { bd = dist; best = c.en; }
  }
  return best;
}

/** Eixos da câmera no início do plano (direita e frente no chão) para descrever movimentos "em relação ao quadro". */
function camAxes(c: CamKey) {
  const fwd = sub(c.target, c.p);
  const fl = Math.hypot(fwd[0], fwd[2]) || 1;
  const f: Vec3 = [fwd[0] / fl, 0, fwd[2] / fl];
  return { fwd: f, right: [-f[2], 0, f[0]] as Vec3 };
}

export function describeCamera(d: BlockingData): string {
  const ks = [...d.camera].sort((a, b) => a.t - b.t);
  if (!ks.length) return "Locked-off static camera.";
  const a = ks[0], b = ks[ks.length - 1];
  const lens = a.lens === b.lens ? `${a.lens}mm lens` : `zooms from ${a.lens}mm to ${b.lens}mm`;
  if (ks.length === 1 || (len(sub(b.p, a.p)) < 0.15 && len(sub(b.target, a.target)) < 0.15 && a.lens === b.lens))
    return `Locked-off static camera, ${lens}, height ${f1(a.p[1])} m.`;
  const { fwd, right } = camAxes(a);
  const dp = sub(b.p, a.p);
  const along = dp[0] * fwd[0] + dp[2] * fwd[2];
  const lat = dp[0] * right[0] + dp[2] * right[2];
  // giro do olhar no plano do chão (positivo = para a direita do quadro)
  const yaw = (c: CamKey) => Math.atan2(c.target[0] - c.p[0], c.target[2] - c.p[2]);
  let turn = ((yaw(a) - yaw(b)) * 180) / Math.PI;
  turn = ((turn + 540) % 360) - 180;
  const targetMoved = len(sub(b.target, a.target));
  const moves: string[] = [];
  if (Math.abs(lat) > 0.4 && Math.abs(turn) > 15 && targetMoved < 0.6 && Math.sign(lat) === -Math.sign(turn))
    moves.push(`orbits ${lat > 0 ? "right" : "left"} about ${Math.round(Math.abs(turn))}° around the subject`);
  else {
    if (Math.abs(along) > 0.4) moves.push(along > 0 ? `dollies in ${f1(along)} m` : `pulls back ${f1(-along)} m`);
    if (Math.abs(lat) > 0.4) moves.push(`trucks ${lat > 0 ? "right" : "left"} ${f1(Math.abs(lat))} m`);
    if (Math.abs(turn) > 15) moves.push(`pans ${turn > 0 ? "right" : "left"} about ${Math.round(Math.abs(turn))}°${moves.length ? " while moving" : ""}`);
  }
  if (Math.abs(dp[1]) > 0.4) moves.push(`${dp[1] > 0 ? "cranes up" : "cranes down"} ${f1(Math.abs(dp[1]))} m`);
  const tilt = (c: CamKey) => Math.atan2(c.target[1] - c.p[1], Math.hypot(c.target[0] - c.p[0], c.target[2] - c.p[2]));
  const dTilt = ((tilt(b) - tilt(a)) * 180) / Math.PI;
  if (Math.abs(dTilt) > 10) moves.push(`tilts ${dTilt > 0 ? "up" : "down"} about ${Math.round(Math.abs(dTilt))}°`);
  if (!moves.length) moves.push("drifts subtly");
  const dense = ks.length > 12;
  const how = dense ? "organic handheld movement captured from a real operator (keep its exact path and micro-movements)" : "smooth, with ease-in and ease-out";
  return `Camera ${moves.join(", ")} over ${f1(b.t - a.t)} s, ${how}; ${lens}, starting at ${f1(a.p[1])} m height.`;
}

export function describeAction(d: BlockingData): string[] {
  const cam = [...d.camera].sort((a, b) => a.t - b.t)[0];
  const ax = cam ? camAxes(cam) : { fwd: [0, 0, -1] as Vec3, right: [1, 0, 0] as Vec3 };
  const out: string[] = [];
  for (const o of d.objects) {
    if (o.type === "arrow" || o.keys.length < 2) continue;
    const ks = [...o.keys].sort((a, b) => a.t - b.t);
    const a = ks[0], b = ks[ks.length - 1];
    const v = sub(b.p, a.p);
    const dist = Math.hypot(v[0], v[2]);
    const rot = Math.abs(b.r[1] - a.r[1]) * (180 / Math.PI);
    if (dist < 0.3 && rot < 20) continue;
    const parts: string[] = [];
    if (dist >= 0.3) {
      const r = v[0] * ax.right[0] + v[2] * ax.right[2];
      const f = v[0] * ax.fwd[0] + v[2] * ax.fwd[2];
      const dirs = [Math.abs(f) > 0.3 ? (f < 0 ? "toward camera" : "away from camera") : "", Math.abs(r) > 0.3 ? (r > 0 ? "to frame right" : "to frame left") : ""].filter(Boolean);
      const speed = dist / Math.max(b.t - a.t, 0.1);
      const verb = o.type === "car" ? (speed > 6 ? "drives fast" : "drives") : o.type === "person" || o.type === "crowd" ? (speed > 3 ? "runs" : "walks") : "moves";
      parts.push(`${verb} ${dirs.join(" and ") || "across the frame"} (${f1(dist)} m)`);
    }
    if (rot >= 20) parts.push(`turns ${Math.round(rot)}°`);
    out.push(`${o.name} (${colorEn(o.color)} ${OBJ_EN[o.type]}) ${parts.join(" and ")} from ${f1(a.t)} s to ${f1(b.t)} s.`);
  }
  return out;
}

export const DEFAULT_AVOID = "mannequins, grey-box or flat colored placeholder shapes, visible arrows or helpers, extra cuts, camera moves not in the reference, warped anatomy, text, watermark";

export function seedancePromptFor(d: BlockingData): string {
  const shown = d.objects.filter((o) => o.type !== "arrow");
  const arrows = d.objects.filter((o) => o.type === "arrow");
  const action = describeAction(d);
  const br = d.brief ?? {};
  return [
    "Use the reference video ONLY as a 3D blockout: copy its composition, character positions, movement paths, timing and camera movement exactly. Do not invent new camera moves or cuts. Replace every blockout shape with the real element below.",
    `Color key:\n${shown.map((o) => `- ${colorEn(o.color)} ${OBJ_EN[o.type]} = ${o.name}`).join("\n")}${arrows.length ? `\n- ${arrows.map((o) => colorEn(o.color)).join("/")} arrows only show direction of travel (do not render them)` : ""}`,
    action.length ? `Action (follow the blockout):\n${action.map((x) => `- ${x}`).join("\n")}` : "",
    `Camera (follow the blockout): ${describeCamera(d)}`,
    `Scene: ${br.scene?.trim() || "[describe the location, time of day and set dressing]"}`,
    `Lighting: ${br.light?.trim() || "[key light direction, quality and color temperature]"}`,
    `Style: ${br.style?.trim() || "photorealistic live-action, cinematic, natural motion blur, fine film grain"}`,
    `Avoid: ${[DEFAULT_AVOID, br.avoid?.trim()].filter(Boolean).join(", ")}.`,
  ].filter(Boolean).join("\n\n");
}
