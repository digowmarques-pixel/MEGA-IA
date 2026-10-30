"use client";

import { Armchair, BedDouble, Box, Building2, Camera, Car, Circle, Circle as RecIcon, Clapperboard, Copy, Cylinder, Diamond, Film, FolderOpen, LayoutTemplate, Monitor, Mountain, Move, Pause, Play, Plus, RotateCw, Route, Save, Scaling, Smartphone, Sparkles, Square, Table, Trash2, TreePine, User, Users, Video, Wand2, X } from "lucide-react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { AssetView } from "@/lib/assets";
import { ASPECTS, COLORS, colorName, DEFAULT_PARAMS, emptyScene, LENSES, lensToFov, OBJ_GROUPS, seedancePromptFor, type SceneBrief, OBJ_LABEL, renderSize, sampleCam, sampleObj, TEMPLATES, upsertKey, type BlockingData, type BlockObj, type CamKey, type ObjType, type Vec3 } from "@/lib/blocking";
import { buildMesh, meshSig, setupStage } from "@/lib/blocking-three";
import { api } from "@/lib/client";
import { DestinationPicker, type Destination } from "./DestinationPicker";
import { ResizablePanels } from "./Resizable";
import { Modal, Spinner, useToast } from "./ui";

const TYPE_ICON: Record<ObjType, React.ElementType> = {
  person: User, crowd: Users, car: Car, box: Box, cylinder: Cylinder, sphere: Circle, wall: Square, arrow: Diamond,
  table: Table, chair: Armchair, bed: BedDouble, building: Building2, tree: TreePine, mountain: Mountain, road: Route, scatter: Sparkles, screen: Monitor,
};
type Quat = [number, number, number, number];

let idSeq = 0;
const newId = () => `o${Date.now().toString(36)}${idSeq++}`;
const r2 = (n: number) => Math.round(n * 1000) / 1000;
const v3 = (v: THREE.Vector3 | THREE.Euler): Vec3 => [r2(v.x), r2(v.y), r2(v.z)];

export function BlockingStudio() {
  const toast = useToast();
  const router = useRouter();
  const mount = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<BlockingData>(emptyScene);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [selected, setSelected] = useState<string | null>("p1");
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  timeRef.current = time;
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [view, setView] = useState<"edit" | "shot">("edit");
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [name, setName] = useState("Blocking 01");
  const [dest, setDest] = useState<Destination>({ projectId: null, scenarioId: null, sceneId: null });
  const [quality, setQuality] = useState<"480p" | "720p">("720p");
  const [rendering, setRendering] = useState<number | null>(null);
  const [rendered, setRendered] = useState<AssetView | null>(null);
  const [director, setDirector] = useState<{ open: boolean; text: string; adjust: boolean; busy: boolean }>({ open: false, text: "", adjust: false, busy: false });
  type Report = { summary: string; shot: string[]; checks: { item: string; ok: boolean; note: string }[] };
  const [report, setReport] = useState<{ report: Report; fixes: string[]; prev: BlockingData; stills: { t: number; url: string }[] } | null>(null);
  const [library, setLibrary] = useState<{ id: number; name: string; project_name: string | null; updated_at: string; thumb: string | null }[] | null>(null);

  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; editCam: THREE.PerspectiveCamera; shotCam: THREE.PerspectiveCamera;
    orbit: OrbitControls; gizmo: TransformControls; helper: THREE.CameraHelper; grid: THREE.GridHelper; ground: THREE.Mesh;
    meshes: Map<string, THREE.Group>; path: THREE.Line;
  } | null>(null);

  // ---------- inicialização da cena 3D ----------
  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.autoClear = false;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const ground = setupStage(scene, dataRef.current.ground);
    const grid = new THREE.GridHelper(60, 60, "#777", "#555");
    (grid.material as THREE.Material).opacity = 0.35; (grid.material as THREE.Material).transparent = true; grid.position.y = 0.002;
    scene.add(grid);
    const editCam = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    editCam.position.set(8, 7, 11);
    const shotCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 500);
    const helper = new THREE.CameraHelper(shotCam);
    scene.add(helper);
    const orbit = new OrbitControls(editCam, renderer.domElement);
    orbit.target.set(0, 1, 0); orbit.enableDamping = true;
    const gizmo = new TransformControls(editCam, renderer.domElement);
    gizmo.addEventListener("dragging-changed", (e) => { orbit.enabled = !(e as unknown as { value: boolean }).value; });
    scene.add(gizmo.getHelper());
    const path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: "#FDC010", dashSize: 0.25, gapSize: 0.15 }));
    scene.add(path);
    three.current = { renderer, scene, editCam, shotCam, orbit, gizmo, helper, grid, ground, meshes: new Map(), path };

    // clique para selecionar objeto
    const ray = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || gizmo.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), editCam);
      const hits = ray.intersectObjects([...three.current!.meshes.values()], true);
      let o: THREE.Object3D | null = hits[0]?.object ?? null;
      while (o && !o.userData.id) o = o.parent;
      setSelected(o ? (o.userData.id as string) : null);
    });

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); editCam.aspect = w / h; editCam.updateProjectionMatrix();
    });
    ro.observe(el);
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); orbit.update(); draw(); };
    loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); gizmo.dispose(); orbit.dispose(); renderer.dispose(); el.innerHTML = ""; three.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewRef = useRef(view);
  viewRef.current = view;
  /** Durante a gravação a vista de edição para de desenhar: assim gizmo, grade e câmera-guia nunca entram no vídeo. */
  const recording = useRef(false);
  /** Desenha: vista de edição + quadro da câmera do shot no canto (ou só a câmera do shot). */
  function draw() {
    const t = three.current;
    if (!t || recording.current) return;
    const { renderer, scene, editCam, shotCam } = t;
    applyPhonePose(t);
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const ar = ASPECTS[dataRef.current.aspect];
    renderer.setScissorTest(false);
    renderer.setClearColor(dataRef.current.sky);
    renderer.clear();
    if (viewRef.current === "shot") {
      // enquadramento exato do vídeo, com tarjas
      let vw = w, vh = w / ar;
      if (vh > h) { vh = h; vw = h * ar; }
      const x = (w - vw) / 2, y = (h - vh) / 2;
      renderer.setClearColor("#000"); renderer.clear();
      renderer.setViewport(x, y, vw, vh); renderer.setScissor(x, y, vw, vh); renderer.setScissorTest(true);
      renderer.setClearColor(dataRef.current.sky); renderer.clear();
      setHelpers(false);
      renderer.render(scene, shotCam);
      setHelpers(true);
      return;
    }
    renderer.setViewport(0, 0, w, h);
    renderer.render(scene, editCam);
    // picture-in-picture da câmera do shot
    const pw = Math.min(w * 0.3, 360), ph = pw / ar;
    const px = w - pw - 12, py = 12;
    renderer.setViewport(px, py, pw, ph); renderer.setScissor(px, py, pw, ph); renderer.setScissorTest(true);
    renderer.clear();
    setHelpers(false);
    renderer.render(scene, shotCam);
    setHelpers(true);
    renderer.setScissorTest(false);
  }
  function setHelpers(v: boolean) {
    const t = three.current!;
    t.grid.visible = v; t.helper.visible = v; t.path.visible = v; t.gizmo.getHelper().visible = v && !!t.gizmo.object;
  }

  // ---------- sincroniza objetos 3D com os dados ----------
  const syncMeshes = useCallback(() => {
    const t = three.current;
    if (!t) return;
    const d = dataRef.current;
    const keep = new Set(d.objects.map((o) => o.id));
    for (const [id, m] of t.meshes) if (!keep.has(id)) { if (t.gizmo.object === m) t.gizmo.detach(); t.scene.remove(m); t.meshes.delete(id); }
    for (const o of d.objects) {
      let m = t.meshes.get(o.id);
      const sig = meshSig(o);
      if (!m || m.userData.sig !== sig) {
        const wasAttached = !!m && t.gizmo.object === m;
        if (m) { if (wasAttached) t.gizmo.detach(); t.scene.remove(m); }
        m = buildMesh(o); m.userData.sig = sig;
        if (wasAttached) t.gizmo.attach(m);
        t.scene.add(m); t.meshes.set(o.id, m);
      }
      if (!t.gizmo.dragging || t.gizmo.object !== m) {
        const s = sampleObj(o, timeRef.current);
        m.position.set(...s.p); m.rotation.set(...s.r); m.scale.set(...s.s);
      }
    }
    const c = sampleCam(d.camera, timeRef.current);
    t.shotCam.position.set(...c.p);
    if (c.q) t.shotCam.quaternion.set(...c.q); else t.shotCam.lookAt(new THREE.Vector3(...c.target));
    t.shotCam.fov = lensToFov(c.lens); t.shotCam.aspect = ASPECTS[d.aspect]; t.shotCam.updateProjectionMatrix(); t.helper.update();
    (t.ground.material as THREE.MeshStandardMaterial).color.set(d.ground);
    // trajetória do objeto selecionado
    const sel = d.objects.find((o) => o.id === selected);
    if (sel && sel.keys.length > 1) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) pts.push(new THREE.Vector3(...sampleObj(sel, (d.duration * i) / 60).p).setY(0.05));
      t.path.geometry.dispose(); t.path.geometry = new THREE.BufferGeometry().setFromPoints(pts); t.path.computeLineDistances(); t.path.visible = true;
    } else t.path.visible = false;
  }, [selected]);
  useEffect(syncMeshes, [data, time, syncMeshes]);

  // ---------- gizmo: anexar ao selecionado e gravar keyframe ao soltar ----------
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const m = selected ? t.meshes.get(selected) : undefined;
    if (m && view === "edit" && !playing) t.gizmo.attach(m); else t.gizmo.detach();
    t.gizmo.setMode(mode);
    const onUp = () => {
      const obj = t.gizmo.object;
      if (!obj) return;
      const id = obj.userData.id as string;
      setData((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? { ...o, keys: upsertKey(o.keys, { t: r2(timeRef.current), p: v3(obj.position), r: v3(obj.rotation), s: v3(obj.scale) }) } : o)) }));
    };
    t.gizmo.addEventListener("mouseUp", onUp);
    return () => t.gizmo.removeEventListener("mouseUp", onUp);
  }, [selected, mode, view, playing, data.objects.length]);

  // ---------- reprodução ----------
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setTime((x) => { const n = x + dt; if (n >= dataRef.current.duration) { setPlaying(false); return dataRef.current.duration; } return n; });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // atalhos: G/R/S, espaço, Delete
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "g" || e.key === "w") setMode("translate");
      if (e.key === "r" || e.key === "e") setMode("rotate");
      if (e.key === "s") setMode("scale");
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => { if (!p && timeRef.current >= dataRef.current.duration) setTime(0); return !p; }); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) removeObj(selected);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- celular como câmera virtual ----------
  const [phone, setPhone] = useState<{ code: string; qr: string; url: string } | null>(null);
  const [phoneOnline, setPhoneOnline] = useState(false);
  const [follow, setFollow] = useState(true);
  const [smooth, setSmooth] = useState(0.5);
  const [takeOn, setTakeOn] = useState(false);
  const live = useRef<{ p: Vec3; q: Quat; lens: number; mode?: string } | null>(null);
  const smoothed = useRef<{ p: THREE.Vector3; q: THREE.Quaternion; lens: number } | null>(null);
  /** amostras cruas do take (tempo da cena + pose estabilizada), reamostradas no fps exato ao terminar */
  const take = useRef<{ t: number; p: THREE.Vector3; q: THREE.Quaternion; lens: number }[] | null>(null);
  const followRef = useRef(follow); followRef.current = follow;
  const smoothRef = useRef(smooth); smoothRef.current = smooth;
  const playingRef = useRef(playing); playingRef.current = playing;
  const onlineRef = useRef(phoneOnline); onlineRef.current = phoneOnline;

  /** Recebe a pose do celular: estabiliza (filtro por tempo) e, durante o take, guarda a amostra. */
  const lastPoseAt = useRef(0);
  function onPose(L: { p: Vec3; q: Quat; lens: number; mode?: string }) {
    live.current = L;
    const nowMs = performance.now(), dt = Math.min(0.2, (nowMs - (lastPoseAt.current || nowMs)) / 1000); lastPoseAt.current = nowMs;
    const p = new THREE.Vector3(...L.p), q = new THREE.Quaternion(...L.q);
    const s = smoothed.current;
    if (!s) smoothed.current = { p, q, lens: L.lens };
    else {
      // constante de tempo de 0 a ~0,5 s conforme a estabilização escolhida
      const tau = smoothRef.current * 0.5, a = tau ? 1 - Math.exp(-dt / tau) : 1;
      s.p.lerp(p, a); s.q.slerp(q, a); s.lens += (L.lens - s.lens) * a;
    }
    if (take.current && playingRef.current) {
      const c = smoothed.current!;
      take.current.push({ t: timeRef.current, p: c.p.clone(), q: c.q.clone(), lens: c.lens });
    }
  }

  /** Aplica a pose estabilizada do celular na câmera do shot (vista ao vivo). */
  function applyPhonePose(t: NonNullable<typeof three.current>) {
    const c = smoothed.current;
    if (!c || !onlineRef.current || !(followRef.current || take.current)) return;
    t.shotCam.position.copy(c.p); t.shotCam.quaternion.copy(c.q);
    t.shotCam.fov = lensToFov(c.lens); t.shotCam.updateProjectionMatrix(); t.helper.update();
  }

  /** Converte as amostras do take em uma key por quadro (fps exato). */
  function resampleTake(raw: NonNullable<typeof take.current>, duration: number, fps: number): CamKey[] {
    const pts = [...raw].sort((a, b) => a.t - b.t);
    if (pts.length < 2) return [];
    const out: CamKey[] = [];
    const frames = Math.round(duration * fps);
    let j = 0;
    for (let i = 0; i <= frames; i++) {
      const t = (i / frames) * duration;
      while (j < pts.length - 2 && pts[j + 1].t < t) j++;
      const a = pts[j], b = pts[Math.min(j + 1, pts.length - 1)];
      const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
      const p = a.p.clone().lerp(b.p, k), q = a.q.clone().slerp(b.q, k), lens = a.lens + (b.lens - a.lens) * k;
      const target = new THREE.Vector3(0, 0, -5).applyQuaternion(q).add(p);
      out.push({ t: r2(t), p: v3(p), target: v3(target), lens: Math.round(lens), q: [r2(q.x), r2(q.y), r2(q.z), r2(q.w)] });
    }
    return out;
  }

  async function connectPhone() {
    try {
      const r = await api<{ code: string }>("/api/cam", { method: "POST", json: { scene: data, state: { t: time, playing, duration: data.duration } } });
      const url = `${window.location.origin}/cam/${r.code}`;
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
      setPhone({ code: r.code, qr, url });
    } catch (e) { toast("err", e instanceof Error ? e.message : "Falha ao gerar o pareamento"); }
  }
  function disconnectPhone() {
    if (phone) api(`/api/cam?code=${phone.code}`, { method: "DELETE" }).catch(() => {});
    setPhone(null); setPhoneOnline(false); live.current = null; smoothed.current = null;
  }
  const post = (event: string, d: unknown) => phone && fetch(`/api/cam/${phone.code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: "desktop", event, data: d }) }).catch(() => {});

  function startTake() {
    if (!onlineRef.current) return toast("err", "Conecte o celular primeiro");
    setTime(0); take.current = []; setTakeOn(true); setPlaying(true);
  }
  const cmdRef = useRef<(a: string) => void>(() => {});
  cmdRef.current = (a: string) => {
    if (a === "rec") startTake();
    else if (a === "play") { if (timeRef.current >= data.duration) setTime(0); setPlaying(true); }
    else if (a === "pause") setPlaying(false);
    else if (a === "stop") { setPlaying(false); setTime(0); }
  };

  // fim do take: as poses gravadas viram os keyframes da câmera
  useEffect(() => {
    if (playing || !take.current) return;
    const raw = take.current;
    take.current = null; setTakeOn(false); setFollow(false);
    const keys = resampleTake(raw, Math.min(data.duration, Math.max(...raw.map((r) => r.t), 0)), data.fps);
    if (keys.length > 2) { setData((d) => ({ ...d, camera: keys })); toast("ok", `Take gravado: ${keys.length} quadros de câmera (${raw.length} poses do celular). Dê play para conferir.`); }
    else toast("err", "Take muito curto — nada foi gravado");
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // eventos do celular
  useEffect(() => {
    if (!phone) return;
    const es = new EventSource(`/api/cam/${phone.code}/stream?role=desktop`);
    es.addEventListener("hello", (e) => setPhoneOnline(JSON.parse((e as MessageEvent).data).phones > 0));
    es.addEventListener("phone-connected", () => { setPhoneOnline(true); toast("ok", "Celular conectado como câmera"); });
    es.addEventListener("phone-disconnected", () => { setPhoneOnline(false); live.current = null; });
    es.addEventListener("pose", (e) => { onPose(JSON.parse((e as MessageEvent).data)); if (!onlineRef.current) setPhoneOnline(true); });
    es.addEventListener("cmd", (e) => cmdRef.current(JSON.parse((e as MessageEvent).data).action));
    es.addEventListener("closed", () => { setPhone(null); setPhoneOnline(false); });
    return () => es.close();
  }, [phone?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // estado da linha do tempo → celular (no máx. ~12x por segundo)
  const lastState = useRef(0);
  useEffect(() => {
    if (!phone) return;
    const now = performance.now();
    if (playing && now - lastState.current < 80) return;
    lastState.current = now;
    post("state", { t: time, playing, recording: takeOn, duration: data.duration, aspect: data.aspect });
  }, [time, playing, takeOn, phone?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  // cena → celular (debounce)
  useEffect(() => {
    if (!phone) return;
    const id = setTimeout(() => post("scene", data), 400);
    return () => clearTimeout(id);
  }, [data, phone?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- ações ----------
  function addObj(type: ObjType) {
    const used = new Set(data.objects.map((o) => o.color));
    const color = COLORS.find((c) => !used.has(c.hex))?.hex ?? COLORS[0].hex;
    const count = data.objects.filter((o) => o.type === type).length + 1;
    const big = ["mountain", "building", "road", "scatter", "crowd"].includes(type);
    const o: BlockObj = {
      id: newId(), type, name: `${OBJ_LABEL[type]} ${count}`, color,
      keys: [{ t: r2(time), p: big ? [0, 0, type === "mountain" ? -40 : type === "building" ? -15 : 0] : [Math.random() * 2 - 1, type === "screen" ? 1.6 : 0, Math.random() * 2 - 1], r: [0, 0, 0], s: [1, 1, 1] }],
      ...(DEFAULT_PARAMS[type] ? { params: { ...DEFAULT_PARAMS[type] } } : {}),
    };
    setData((d) => ({ ...d, objects: [...d.objects, o] }));
    setSelected(o.id);
  }
  function removeObj(id: string) {
    setData((d) => ({ ...d, objects: d.objects.filter((o) => o.id !== id) }));
    setSelected(null);
  }
  const patchObj = (id: string, p: Partial<BlockObj>) => setData((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? { ...o, ...p } : o)) }));

  function captureCamera() {
    const t = three.current!;
    const lens = sampleCam(data.camera, time).lens;
    setData((d) => ({ ...d, camera: upsertKey(d.camera, { t: r2(time), p: v3(t.editCam.position), target: v3(t.orbit.target), lens }) }));
    toast("ok", `Câmera do shot gravada em ${time.toFixed(1)}s`);
  }
  function setLensAtTime(lens: number) {
    const c = sampleCam(data.camera, time);
    setData((d) => ({ ...d, camera: upsertKey(d.camera, { t: r2(time), p: c.p, target: c.target, lens }) }));
  }
  function lookThroughShot() {
    const t = three.current!;
    const c = sampleCam(data.camera, time);
    t.editCam.position.set(...c.p); t.orbit.target.set(...c.target); t.orbit.update();
  }

  // ---------- salvar / abrir ----------
  // ---------- Diretor 3D (Claude monta a cena por texto) ----------
  async function runDirector() {
    setDirector((d) => ({ ...d, busy: true }));
    try {
      const r = await api<{ data: BlockingData; report: Report; fixes: string[] }>("/api/blocking/director", {
        method: "POST", json: { description: director.text, current: director.adjust ? data : null, aspect: data.aspect },
      });
      const prev = data;
      setData(r.data); setSelected(null); setTime(0); setRendered(null);
      setReport({ report: r.report, fixes: r.fixes, prev, stills: [] });
      setDirector((d) => ({ ...d, open: false, busy: false, adjust: true }));
      setTimeout(captureStills, 400); // espera os objetos novos entrarem na cena
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "Falha no Diretor 3D");
      setDirector((d) => ({ ...d, busy: false }));
    }
  }
  /** Quadros de verificação pela câmera do shot: início, keyframes da câmera e fim. */
  function captureStills() {
    const t = three.current;
    if (!t) return;
    const d = dataRef.current;
    const keyTimes = d.camera.length <= 12 ? d.camera.map((c) => c.t) : [];
    const times = [...new Set([0, ...keyTimes, d.duration / 2, d.duration].map((x) => Math.round(x * 10) / 10))].sort((a, b) => a - b).slice(0, 6);
    const w = 320, h = Math.round(320 / ASPECTS[d.aspect]);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const rr = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    rr.setPixelRatio(1); rr.setSize(w, h, false);
    const cam = t.shotCam.clone();
    recording.current = true;
    setHelpers(false);
    const stills = times.map((ti) => {
      for (const o of d.objects) {
        const m = t.meshes.get(o.id);
        if (!m) continue;
        const sp = sampleObj(o, ti);
        m.position.set(...sp.p); m.rotation.set(...sp.r); m.scale.set(...sp.s);
      }
      const c = sampleCam(d.camera, ti);
      cam.position.set(...c.p);
      if (c.q) cam.quaternion.set(...c.q); else cam.lookAt(new THREE.Vector3(...c.target));
      cam.fov = lensToFov(c.lens); cam.aspect = w / h; cam.updateProjectionMatrix();
      rr.setClearColor(d.sky); rr.render(t.scene, cam);
      return { t: ti, url: canvas.toDataURL("image/jpeg", 0.8) };
    });
    rr.dispose();
    recording.current = false;
    setHelpers(true);
    syncMeshes();
    setReport((r) => r && { ...r, stills });
  }

  async function save(): Promise<number | null> {
    try {
      const body = { name, data, ...dest };
      if (sceneId) { await api(`/api/blocking/${sceneId}`, { method: "PUT", json: body }); toast("ok", "Cena 3D salva"); return sceneId; }
      const r = await api<{ id: number }>("/api/blocking", { method: "POST", json: body });
      setSceneId(r.id); toast("ok", "Cena 3D salva"); return r.id;
    } catch (e) { toast("err", e instanceof Error ? e.message : "Falha ao salvar"); return null; }
  }
  async function openScene(id: number) {
    const r = await api<{ scene: { id: number; name: string; data: BlockingData; project_id: number | null; scenario_id: number | null; scene_id: number | null } }>(`/api/blocking/${id}`);
    setData(r.scene.data); setName(r.scene.name); setSceneId(r.scene.id);
    setDest({ projectId: r.scene.project_id, scenarioId: r.scene.scenario_id, sceneId: r.scene.scene_id });
    setTime(0); setSelected(null); setLibrary(null); setRendered(null);
  }

  // ---------- renderizar o vídeo de referência ----------
  async function render() {
    const id = await save();
    if (!id || !three.current) return;
    const t = three.current;
    const size = renderSize(data.aspect, quality);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const rr = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    rr.setPixelRatio(1); rr.setSize(size.width, size.height, false); rr.shadowMap.enabled = true;
    const cam = t.shotCam.clone();
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: quality === "720p" ? 6_000_000 : 3_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((res) => (rec.onstop = res));
    setPlaying(false);
    recording.current = true;
    t.gizmo.detach();
    setHelpers(false);
    rec.start();
    const frames = Math.round(data.duration * data.fps);
    for (let i = 0; i <= frames; i++) {
      const ti = (i / frames) * data.duration;
      for (const o of data.objects) {
        const m = t.meshes.get(o.id);
        if (!m) continue;
        const s = sampleObj(o, ti);
        m.position.set(...s.p); m.rotation.set(...s.r); m.scale.set(...s.s);
      }
      const c = sampleCam(data.camera, ti);
      cam.position.set(...c.p);
      if (c.q) cam.quaternion.set(...c.q); else cam.lookAt(new THREE.Vector3(...c.target));
      cam.fov = lensToFov(c.lens); cam.aspect = size.width / size.height; cam.updateProjectionMatrix();
      rr.setClearColor(data.sky); rr.render(t.scene, cam);
      track.requestFrame?.();
      setRendering(Math.round((i / frames) * 100));
      await new Promise((r) => setTimeout(r, 1000 / data.fps)); // tempo real: o gravador usa o relógio
    }
    rec.stop();
    await stopped;
    recording.current = false;
    setHelpers(true);
    rr.dispose();
    syncMeshes();
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    const fd = new FormData();
    fd.append("file", blob, `${name}.${mime.includes("mp4") ? "mp4" : "webm"}`);
    fd.append("fps", String(data.fps)); fd.append("width", String(size.width)); fd.append("height", String(size.height)); fd.append("duration", String(data.duration));
    fd.append("legend", seedancePromptFor(data));
    try {
      const r = await api<{ asset: AssetView }>(`/api/blocking/${id}/render`, { method: "POST", body: fd });
      setRendered(r.asset);
      toast("ok", `Vídeo de referência salvo: ${r.asset.filename}`);
    } catch (e) { toast("err", e instanceof Error ? e.message : "Falha ao salvar o vídeo"); }
    finally { setRendering(null); }
  }

  const sel = data.objects.find((o) => o.id === selected);
  const selKeys = sel?.keys ?? [];
  const cam = sampleCam(data.camera, time);

  return (
    <div className="flex h-full flex-col">
      {/* barra superior */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Clapperboard className="h-4 w-4 text-mega-yellow" />
        <input className="input !w-48 !py-1 text-sm font-semibold" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="w-[360px] max-w-full"><DestinationPicker value={dest} onChange={setDest} /></div>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="btn-primary !py-1.5 text-xs" onClick={() => setDirector((d) => ({ ...d, open: true }))}><Wand2 className="h-4 w-4" />Diretor 3D</button>
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => api<{ scenes: NonNullable<typeof library> }>("/api/blocking").then((r) => setLibrary(r.scenes))}><FolderOpen className="h-4 w-4" />Abrir</button>
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => { setData(emptyScene()); setSceneId(null); setName("Blocking novo"); setTime(0); setRendered(null); }}><Plus className="h-4 w-4" />Nova</button>
          <button className="btn-outline !py-1.5 text-xs" onClick={save}><Save className="h-4 w-4" />Salvar</button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ResizablePanels id="blocking" defaults={[20, 58, 22]} mins={[14, 35, 16]}>
          {/* objetos */}
          <div className="flex h-full flex-col overflow-y-auto border-r border-line bg-base p-3">
            <div className="label flex items-center gap-1"><LayoutTemplate className="h-3 w-3" />Cena pronta</div>
            <select className="input mb-4 !py-1.5 text-xs" value="" onChange={(e) => { const tp = TEMPLATES.find((x) => x.id === e.target.value); if (tp) { setData(tp.build()); setSelected(null); setTime(0); setSceneId(null); setName(tp.name); } }}>
              <option value="">Começar de uma cena pronta…</option>
              {TEMPLATES.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            </select>
            {OBJ_GROUPS.map((grp) => (
              <div key={grp.label} className="mb-3">
                <div className="label">{grp.label}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {grp.types.map((t) => { const I = TYPE_ICON[t]; return <button key={t} onClick={() => addObj(t)} className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1.5 text-left text-[11.5px] leading-tight hover:border-mega-amber"><I className="h-3.5 w-3.5 shrink-0 text-mega-amber" />{OBJ_LABEL[t]}</button>; })}
                </div>
              </div>
            ))}
            <div className="label">Na cena</div>
            <div className="space-y-0.5">
              {data.objects.map((o) => { const I = TYPE_ICON[o.type]; return (
                <button key={o.id} onClick={() => setSelected(o.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${selected === o.id ? "bg-raised text-white" : "text-soft hover:bg-card"}`}>
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-white/30" style={{ background: o.color }} /><I className="h-3.5 w-3.5 shrink-0 text-muted" /><span className="truncate">{o.name}</span>
                  <span className="ml-auto text-[10px] text-muted">{o.keys.length > 1 ? `${o.keys.length} keys` : ""}</span>
                </button>
              ); })}
            </div>
            {sel && (
              <div className="mt-4 space-y-3 border-t border-line pt-3">
                <div><div className="label">Nome (vai para a legenda do prompt)</div><input className="input !py-1.5 text-xs" value={sel.name} onChange={(e) => patchObj(sel.id, { name: e.target.value })} /></div>
                <div>
                  <div className="label">Cor</div>
                  <div className="flex flex-wrap gap-1.5">{COLORS.map((c) => <button key={c.hex} title={c.name} onClick={() => patchObj(sel.id, { color: c.hex })} className={`h-6 w-6 rounded-md border-2 ${sel.color === c.hex ? "border-mega-yellow" : "border-transparent"}`} style={{ background: c.hex }} />)}</div>
                </div>
                {(sel.type === "crowd" || sel.type === "scatter") && (
                  <div className="space-y-2">
                    <label className="block text-[11px] text-muted">Quantidade: <b className="text-white">{sel.params?.count}</b>
                      <input type="range" min={sel.type === "crowd" ? 2 : 20} max={sel.type === "crowd" ? 200 : 2000} value={sel.params?.count ?? 10} onChange={(e) => patchObj(sel.id, { params: { ...sel.params, count: Number(e.target.value) } })} className="w-full accent-[#FDC010]" /></label>
                    <label className="block text-[11px] text-muted">Área: <b className="text-white">{sel.params?.spread} m</b>
                      <input type="range" min={1} max={60} value={sel.params?.spread ?? 6} onChange={(e) => patchObj(sel.id, { params: { ...sel.params, spread: Number(e.target.value) } })} className="w-full accent-[#FDC010]" /></label>
                    <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => patchObj(sel.id, { params: { ...sel.params, seed: Math.floor(Math.random() * 1e6) } })}>Embaralhar posições</button>
                  </div>
                )}
                <div>
                  <div className="label">Keyframes</div>
                  <div className="flex flex-wrap gap-1">{selKeys.map((k, i) => (
                    <span key={i} className="chip">
                      <button onClick={() => setTime(k.t)}>{k.t.toFixed(1)}s</button>
                      {selKeys.length > 1 && <button className="hover:text-red-400" onClick={() => patchObj(sel.id, { keys: selKeys.filter((_, j) => j !== i) })}>×</button>}
                    </span>
                  ))}</div>
                </div>
                <div className="flex gap-1.5">
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { const o = { ...sel, id: newId(), name: `${sel.name} (cópia)`, keys: sel.keys.map((k) => ({ ...k, p: [k.p[0] + 1, k.p[1], k.p[2]] as Vec3 })) }; setData((d) => ({ ...d, objects: [...d.objects, o] })); setSelected(o.id); }}><Copy className="h-3.5 w-3.5" />Duplicar</button>
                  <button className="btn-danger !px-2 !py-1 text-xs" onClick={() => removeObj(sel.id)}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
                </div>
              </div>
            )}
          </div>

          {/* viewport + timeline */}
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
              {([["translate", Move, "Mover (G)"], ["rotate", RotateCw, "Girar (R)"], ["scale", Scaling, "Escala (S)"]] as const).map(([m, I, l]) => (
                <button key={m} title={l} onClick={() => setMode(m)} className={`rounded-md p-1.5 ${mode === m ? "bg-mega-yellow text-black" : "text-soft hover:bg-card"}`}><I className="h-4 w-4" /></button>
              ))}
              <div className="mx-2 h-5 w-px bg-line" />
              <button onClick={() => setView("edit")} className={`chip ${view === "edit" ? "chip-active" : ""}`}>Vista livre</button>
              <button onClick={() => setView("shot")} className={`chip ${view === "shot" ? "chip-active" : ""}`}><Camera className="h-3 w-3" />Câmera do shot</button>
              <span className="ml-auto text-[10.5px] text-muted">Clique para selecionar · arraste o gizmo · ao soltar grava keyframe em {time.toFixed(1)}s</span>
            </div>
            <div ref={mount} className="relative min-h-0 flex-1 bg-black">
              {rendering !== null && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70">
                  <Spinner className="h-6 w-6 text-mega-yellow" /><div className="text-sm font-semibold">Gravando vídeo de referência… {rendering}%</div>
                  <div className="h-1.5 w-64 overflow-hidden rounded bg-line"><div className="mega-stripes h-full" style={{ width: `${rendering}%` }} /></div>
                </div>
              )}
            </div>
            <div className="border-t border-line bg-panel px-3 py-2">
              <div className="flex items-center gap-3">
                <button className="btn-primary !p-1.5" onClick={() => { if (time >= data.duration) setTime(0); setPlaying((p) => !p); }}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                <span className="w-20 font-mono text-xs tabular-nums">{time.toFixed(2)}s</span>
                <div className="relative flex-1">
                  <input type="range" min={0} max={data.duration} step={0.01} value={time} onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }} className="w-full accent-[#FDC010]" />
                  <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-2">
                    {selKeys.map((k, i) => <span key={i} className="absolute h-2 w-1 -translate-x-1/2 rounded-sm bg-mega-yellow" style={{ left: `${(k.t / data.duration) * 100}%` }} />)}
                    {data.camera.map((k, i) => <span key={`c${i}`} className="absolute top-0 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-400" style={{ left: `${(k.t / data.duration) * 100}%` }} />)}
                  </div>
                </div>
                <label className="flex items-center gap-1 text-xs text-muted">Duração
                  <input type="number" min={2} max={15} value={data.duration} onChange={(e) => setData((d) => ({ ...d, duration: Math.min(15, Math.max(2, Number(e.target.value) || 5)) }))} className="input !w-14 !px-1.5 !py-0.5 text-xs" />s
                </label>
              </div>
              <div className="mt-1 text-[10px] text-muted">Barras amarelas: keyframes do objeto selecionado · pontos azuis: keyframes da câmera · espaço = play/pause</div>
            </div>
          </div>

          {/* câmera e render */}
          <div className="flex h-full flex-col overflow-y-auto border-l border-line bg-panel p-3">
            <div className={`mb-4 rounded-xl border p-2.5 ${phoneOnline ? "border-mega-amber/60 bg-mega-yellow/5" : "border-line"}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold"><Smartphone className="h-4 w-4 text-mega-yellow" />Celular como câmera</span>
                {phone && <button className="btn-ghost !p-1" title="Desconectar" onClick={disconnectPhone}><X className="h-3.5 w-3.5" /></button>}
              </div>
              {!phone ? (
                <>
                  <p className="mb-2 text-[11px] text-muted">Use o celular como câmera de mão: ele mostra a cena e, enquanto ela roda, cada movimento vira o movimento da câmera.</p>
                  <button className="btn-outline w-full !py-1.5 text-xs" onClick={connectPhone}><Smartphone className="h-3.5 w-3.5" />Conectar celular</button>
                </>
              ) : (
                <div className="space-y-2">
                  {!phoneOnline && (
                    <div className="flex flex-col items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={phone.qr} alt="QR code para abrir no celular" className="h-36 w-36 rounded-md bg-white p-1" />
                      <div className="font-mono text-lg font-black tracking-[0.25em] text-mega-yellow">{phone.code}</div>
                      <p className="text-center text-[10.5px] text-muted">Aponte a câmera do celular para o QR ou abra <span className="break-all text-soft">{phone.url}</span></p>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px]"><span className={`h-2 w-2 rounded-full ${phoneOnline ? "bg-mega-yellow" : "bg-line-strong"}`} />{phoneOnline ? `Conectado${live.current?.mode ? ` · ${live.current.mode}` : ""}` : "Aguardando o celular…"}</div>
                  {phoneOnline && (
                    <>
                      <label className="flex items-center justify-between text-[11px]">Câmera segue o celular ao vivo<input type="checkbox" checked={follow} onChange={(e) => { setFollow(e.target.checked); smoothed.current = null; }} className="accent-[#FDC010]" /></label>
                      <label className="block text-[11px] text-muted">Estabilização: <b className="text-white">{Math.round(smooth * 100)}%</b>
                        <input type="range" min={0} max={1} step={0.05} value={smooth} onChange={(e) => setSmooth(Number(e.target.value))} className="w-full accent-[#FDC010]" /></label>
                      <button className={`w-full ${takeOn ? "btn-danger border border-red-500/40" : "btn-primary"} !py-1.5 text-xs`} onClick={() => (takeOn ? setPlaying(false) : startTake())}>
                        <RecIcon className={`h-3.5 w-3.5 ${takeOn ? "animate-pulse fill-red-500 text-red-500" : "fill-black"}`} />{takeOn ? "Parar take" : `Gravar take (${data.duration}s)`}
                      </button>
                      <p className="text-[10.5px] text-muted">O take começa do 0s com a cena rodando; ao terminar, o movimento do celular substitui os keyframes da câmera. Também dá para gravar pelo botão REC no celular.</p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="label">Câmera do shot</div>
            <p className="mb-2 text-[11px] text-muted">Posicione a vista livre como quer o enquadramento e grave. Grave em tempos diferentes para criar o movimento (dolly, travelling, grua).</p>
            <button className="btn-primary mb-1.5 w-full !py-1.5 text-xs" onClick={captureCamera}><Camera className="h-3.5 w-3.5" />Gravar câmera em {time.toFixed(1)}s</button>
            <button className="btn-ghost mb-3 w-full !py-1 text-xs" onClick={lookThroughShot}>Levar a vista livre até a câmera</button>
            <div className="label">Lente (em {time.toFixed(1)}s)</div>
            <div className="mb-3 flex flex-wrap gap-1">{LENSES.map((l) => <button key={l} onClick={() => setLensAtTime(l)} className={`chip ${Math.round(cam.lens) === l ? "chip-active" : ""}`}>{l}mm</button>)}</div>
            <div className="label">Keyframes da câmera</div>
            <div className="mb-4 flex flex-wrap gap-1">{data.camera.map((k, i) => (
              <span key={i} className="chip"><button onClick={() => setTime(k.t)}>{k.t.toFixed(1)}s · {k.lens}mm</button>{data.camera.length > 1 && <button className="hover:text-red-400" onClick={() => setData((d) => ({ ...d, camera: d.camera.filter((_, j) => j !== i) }))}>×</button>}</span>
            ))}</div>

            <div className="label">Cenário</div>
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center justify-between gap-2 rounded-lg border border-line px-2 py-1">Chão<input type="color" value={data.ground} onChange={(e) => setData((d) => ({ ...d, ground: e.target.value }))} className="h-5 w-7 bg-transparent" /></label>
              <label className="flex items-center justify-between gap-2 rounded-lg border border-line px-2 py-1">Céu<input type="color" value={data.sky} onChange={(e) => setData((d) => ({ ...d, sky: e.target.value }))} className="h-5 w-7 bg-transparent" /></label>
            </div>

            <div className="label">Vídeo de referência</div>
            <div className="mb-2 flex flex-wrap gap-1">{(Object.keys(ASPECTS) as BlockingData["aspect"][]).map((a) => <button key={a} onClick={() => setData((d) => ({ ...d, aspect: a }))} className={`chip ${data.aspect === a ? "chip-active" : ""}`}>{a}</button>)}</div>
            <div className="mb-2 flex gap-1">{(["480p", "720p"] as const).map((q) => <button key={q} onClick={() => setQuality(q)} className={`chip flex-1 justify-center ${quality === q ? "chip-active" : ""}`}>{q} · {renderSize(data.aspect, q).width}×{renderSize(data.aspect, q).height}</button>)}</div>
            <div className="mb-2 flex gap-1">{[24, 30].map((f) => <button key={f} onClick={() => setData((d) => ({ ...d, fps: f }))} className={`chip flex-1 justify-center ${data.fps === f ? "chip-active" : ""}`}>{f} fps</button>)}</div>
            <button className="btn-primary w-full" disabled={rendering !== null} onClick={render}><Video className="h-4 w-4" />Renderizar {quality} ({data.duration}s)</button>
            <p className="mt-1 text-[10.5px] text-muted">Grava em tempo real ({data.duration}s) e salva como PREVIS na cena escolhida, em MP4.</p>

            {rendered && (
              <div className="mt-4 space-y-2 rounded-xl border border-mega-amber/40 bg-mega-yellow/5 p-2.5">
                <video src={rendered.url} controls muted className="w-full rounded-md" />
                <div className="break-all font-mono text-[10.5px] text-mega-yellow">{rendered.filename}</div>
                <button className="btn-primary w-full !py-1.5 text-xs" onClick={() => router.push(`/video?vref=${rendered.id}`)}><Film className="h-3.5 w-3.5" />Usar no Seedance 2.5</button>
              </div>
            )}

            <div className="mt-4 space-y-2 rounded-lg bg-card p-2.5">
              <div className="label">Visual do vídeo final</div>
              <p className="text-[10.5px] text-muted">O 3D define posição, movimento, tempo e câmera. Aqui você define só a aparência (em inglês funciona melhor).</p>
              {([["scene", "Cenário", "rainy neon street in São Paulo at night, wet asphalt"], ["light", "Luz", "hard sodium streetlights from above, cool blue fill"], ["style", "Estilo", "photorealistic, anamorphic 35mm, teal & orange, fine grain"], ["avoid", "Evitar (extra)", "crowds in the background"]] as [keyof SceneBrief, string, string][]).map(([k, l, ph]) => (
                <div key={k}><div className="text-[10.5px] font-semibold text-soft">{l}</div>
                  <textarea rows={k === "avoid" ? 1 : 2} className="input !py-1 text-xs" placeholder={ph} value={data.brief?.[k] ?? ""} onChange={(e) => setData((d) => ({ ...d, brief: { ...d.brief, [k]: e.target.value } }))} /></div>
              ))}
              <div className="flex items-center justify-between pt-1"><div className="label !mb-0">Prompt para o Seedance</div>
                <button className="btn-ghost !px-1.5 !py-0.5 text-[10.5px]" onClick={() => { navigator.clipboard.writeText(seedancePromptFor(data)); toast("ok", "Prompt copiado"); }}>copiar</button></div>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-[10.5px] leading-snug text-soft">{seedancePromptFor(data)}</pre>
              <p className="text-[10.5px] text-muted">Vai junto automaticamente ao usar no Seedance, com rascunho 480p ligado para testar barato. {data.objects.length ? `Ex.: ${colorName(data.objects[0].color)} = ${data.objects[0].name}.` : ""}</p>
            </div>
          </div>
        </ResizablePanels>
      </div>

      <Modal open={director.open} onClose={() => !director.busy && setDirector((d) => ({ ...d, open: false }))} title="Diretor 3D com Claude" wide
        footer={<>
          <label className="mr-auto flex items-center gap-2 text-xs text-soft"><input type="checkbox" className="accent-[#FDC010]" checked={director.adjust} onChange={(e) => setDirector((d) => ({ ...d, adjust: e.target.checked }))} />Ajustar a cena atual (em vez de criar do zero)</label>
          <button className="btn-ghost" disabled={director.busy} onClick={() => setDirector((d) => ({ ...d, open: false }))}>Cancelar</button>
          <button className="btn-primary" disabled={director.busy || director.text.trim().length < 10} onClick={runDirector}>{director.busy ? <Spinner /> : <Wand2 className="h-4 w-4" />}{director.busy ? "Montando a cena…" : "Montar cena"}</button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-soft">Descreva o plano como para um diretor de fotografia: quem está em cena, o que cada um faz e quando, e como a câmera se move. O Claude monta os objetos, as trajetórias e a câmera segundo a segundo, e devolve um relatório do que conferiu.</p>
          <textarea rows={7} className="input" autoFocus value={director.text} onChange={(e) => setDirector((d) => ({ ...d, text: e.target.value }))}
            placeholder="Ex.: 8 segundos. Rua estreita à noite. Um motoboy (vermelho) vem do fundo em direção à câmera e passa à direita dela. Uma mulher (azul) atravessa da esquerda para a direita aos 3s. Câmera baixa, 24mm, recua devagar e termina girando para seguir o motoboy." />
          <div className="flex flex-wrap gap-1">
            {["Deixe a câmera mais baixa e mais perto", "Troque para 50mm e faça um travelling lateral", "Adicione uma multidão ao fundo", "Faça durar 10 segundos"].map((x) => (
              <button key={x} className="chip !text-[10.5px]" onClick={() => setDirector((d) => ({ ...d, text: x, adjust: true }))}>{x}</button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={!!report} onClose={() => setReport(null)} title="Verificação do Diretor 3D" wide
        footer={report && <>
          <button className="btn-ghost mr-auto" onClick={() => { setData(report.prev); setReport(null); setTime(0); toast("ok", "Cena anterior restaurada"); }}>Desfazer</button>
          <button className="btn-outline" onClick={() => setDirector((d) => ({ ...d, open: true, text: "", adjust: true }))}>Pedir ajuste</button>
          <button className="btn-primary" onClick={() => setReport(null)}>Usar esta cena</button>
        </>}>
        {report && (
          <div className="space-y-4">
            <p className="text-sm">{report.report.summary}</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {report.stills.length === 0 ? <Spinner /> : report.stills.map((s) => (
                <figure key={s.t} className="overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt={`Quadro em ${s.t}s`} className="w-full" />
                  <figcaption className="px-2 py-1 text-[10.5px] text-muted">{s.t}s</figcaption>
                </figure>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div><div className="label">Decupagem</div><ul className="space-y-1 text-xs text-soft">{report.report.shot.map((x, i) => <li key={i}>• {x}</li>)}</ul></div>
              <div><div className="label">Verificações</div><ul className="space-y-1 text-xs">{report.report.checks.map((c, i) => (
                <li key={i} className={c.ok ? "text-soft" : "text-mega-orange"}>{c.ok ? "✓" : "⚠"} <b>{c.item}</b> — {c.note}</li>
              ))}{report.fixes.map((f) => <li key={f} className="text-mega-orange">⚠ Ajuste automático: {f}</li>)}</ul></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={library !== null} onClose={() => setLibrary(null)} title="Abrir cena 3D" wide>
        {library?.length === 0 ? <p className="text-sm text-muted">Nenhuma cena salva ainda.</p> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {library?.map((s) => (
              <button key={s.id} onClick={() => openScene(s.id)} className="overflow-hidden rounded-xl border border-line bg-card text-left hover:border-mega-amber">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.thumb ? <img src={s.thumb} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center text-muted"><Box className="h-6 w-6" /></div>}
                <div className="p-2"><div className="truncate text-sm font-semibold">{s.name}</div><div className="text-[11px] text-muted">{s.project_name ?? "Sem projeto"}</div></div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
