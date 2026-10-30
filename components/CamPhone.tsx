"use client";

import { ChevronDown, ChevronUp, Crosshair, Minus, Pause, Play, Plus, RotateCcw, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ASPECTS, LENSES, lensToFov, sampleCam, sampleObj, type BlockingData } from "@/lib/blocking";
import { buildMesh, meshSig, setupStage } from "@/lib/blocking-three";
import { Logo } from "./Logo";

type Mode = "ar" | "gyro" | "touch";
type Sync = { t: number; playing: boolean; recording: boolean; duration: number; at: number };
const MODE_LABEL: Record<Mode, string> = { ar: "AR · 6DoF", gyro: "Giroscópio", touch: "Toque" };
const SCALES = [1, 2, 5, 10];

const yawOf = (q: THREE.Quaternion) => { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); return Math.atan2(-f.x, -f.z); };

/** Pose da câmera do shot no tempo t (posição + orientação), a partir dos keyframes. */
function shotPose(d: BlockingData, t: number) {
  const c = sampleCam(d.camera, t);
  const p = new THREE.Vector3(...c.p);
  let q: THREE.Quaternion;
  if (c.q) q = new THREE.Quaternion(...c.q);
  else { const m = new THREE.Matrix4().lookAt(p, new THREE.Vector3(...c.target), new THREE.Vector3(0, 1, 0)); q = new THREE.Quaternion().setFromRotationMatrix(m); }
  return { p, q, lens: c.lens };
}

export function CamPhone({ code }: { code: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [data, setData] = useState<BlockingData | null>(null);
  const dataRef = useRef<BlockingData | null>(null);
  dataRef.current = data;
  const sync = useRef<Sync>({ t: 0, playing: false, recording: false, duration: 5, at: performance.now() });
  const [ui, setUi] = useState({ t: 0, playing: false, recording: false, duration: 5 });
  const [mode, setMode] = useState<Mode | null>(null);
  const modeRef = useRef<Mode | null>(null);
  const [arOk, setArOk] = useState(false);
  const [lens, setLens] = useState(35);
  const lensRef = useRef(35); lensRef.current = lens;
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const stick = useRef({ x: 0, y: 0 });
  const lift = useRef(0);
  const sent = useRef(0);
  const shownT = useRef(-1);
  const lastFrameRef = useRef(performance.now());
  const g = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; world: THREE.Group; cam: THREE.PerspectiveCamera; meshes: Map<string, THREE.Group>; floor: THREE.Mesh;
    pos: THREE.Vector3; yawOffset: number; devQ: THREE.Quaternion; touch: { yaw: number; pitch: number }; viewer: THREE.Matrix4 | null; refSpace: XRReferenceSpace | null;
  } | null>(null);

  const now = () => { const s = sync.current; return Math.min(s.duration, s.playing ? s.t + (performance.now() - s.at) / 1000 : s.t); };
  const post = (event: string, d: unknown) => fetch(`/api/cam/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: "phone", event, data: d }), keepalive: true }).catch(() => {});

  // ---------- carrega a cena e escuta o computador ----------
  useEffect(() => {
    fetch(`/api/cam/${code}/scene`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Pareamento inválido");
      setData(j.scene as BlockingData);
      const st = j.state ?? {};
      sync.current = { t: st.t ?? 0, playing: !!st.playing, recording: !!st.recording, duration: (j.scene as BlockingData).duration, at: performance.now() };
      setUi({ t: st.t ?? 0, playing: !!st.playing, recording: !!st.recording, duration: (j.scene as BlockingData).duration });
    }).catch((e) => setError(e.message));
    const es = new EventSource(`/api/cam/${code}/stream?role=phone`);
    es.addEventListener("state", (e) => {
      const st = JSON.parse((e as MessageEvent).data);
      sync.current = { t: st.t, playing: st.playing, recording: st.recording, duration: st.duration, at: performance.now() };
      setUi({ t: st.t, playing: st.playing, recording: st.recording, duration: st.duration });
    });
    es.addEventListener("scene", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as BlockingData;
      setData(d);
      // a duração da cena pode ter mudado no computador
      sync.current = { ...sync.current, duration: d.duration };
      setUi((u) => ({ ...u, duration: d.duration }));
    });
    es.addEventListener("closed", () => setError("O computador encerrou o pareamento."));
    es.onerror = () => {};
    navigator.xr?.isSessionSupported?.("immersive-ar").then(setArOk).catch(() => setArOk(false));
    return () => es.close();
  }, [code]);

  // ---------- três.js ----------
  useEffect(() => {
    if (!data || g.current) return;
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.autoClear = false;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    scene.add(world);
    const floor = setupStage(world as unknown as THREE.Scene, data.ground);
    const cam = new THREE.PerspectiveCamera(lensToFov(35), 16 / 9, 0.05, 800);
    const start = shotPose(data, sync.current.t);
    g.current = { renderer, scene, world, cam, meshes: new Map(), floor, pos: start.p.clone(), yawOffset: 0, devQ: new THREE.Quaternion(), touch: { yaw: yawOf(start.q), pitch: 0 }, viewer: null, refSpace: null };
    const resize = () => renderer.setSize(el.clientWidth, el.clientHeight);
    resize();
    window.addEventListener("resize", resize);
    renderer.setAnimationLoop(frame);
    return () => { renderer.setAnimationLoop(null); window.removeEventListener("resize", resize); renderer.dispose(); el.innerHTML = ""; g.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data]);

  // malhas acompanham as mudanças da cena
  useEffect(() => {
    const G = g.current;
    if (!G || !data) return;
    const keep = new Set(data.objects.map((o) => o.id));
    for (const [id, m] of G.meshes) if (!keep.has(id)) { G.world.remove(m); G.meshes.delete(id); }
    for (const o of data.objects) {
      let m = G.meshes.get(o.id);
      if (!m || m.userData.sig !== meshSig(o)) { if (m) G.world.remove(m); m = buildMesh(o); m.userData.sig = meshSig(o); G.world.add(m); G.meshes.set(o.id, m); }
    }
    (G.floor.material as THREE.MeshStandardMaterial).color.set(data.ground);
  }, [data]);

  function frame(_t: number, xrFrame?: XRFrame) {
    const G = g.current, d = dataRef.current;
    if (!G || !d) return;
    const tnow = performance.now(), dt = Math.min(0.1, (tnow - lastFrameRef.current) / 1000); lastFrameRef.current = tnow;
    const t = now();
    for (const o of d.objects) { const m = G.meshes.get(o.id); if (!m) continue; const s = sampleObj(o, t); m.position.set(...s.p); m.rotation.set(...s.r); m.scale.set(...s.s); }
    G.scene.background = new THREE.Color(d.sky);
    const m = modeRef.current;
    let poseP: THREE.Vector3, poseQ: THREE.Quaternion;

    if (m === "ar" && xrFrame && G.refSpace) {
      const vp = xrFrame.getViewerPose(G.refSpace);
      if (vp) G.viewer = new THREE.Matrix4().fromArray(vp.transform.matrix);
      if (!G.viewer) return;
      // joystick também funciona no AR (deslocamentos maiores sem andar)
      if (stick.current.x || stick.current.y || lift.current) {
        const V = new THREE.Vector3(), Q = new THREE.Quaternion(); G.viewer.decompose(V, Q, new THREE.Vector3());
        const yaw = yawOf(Q); // direção do olhar no espaço real
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const mv = fwd.multiplyScalar(stick.current.y).add(right.multiplyScalar(stick.current.x)).multiplyScalar(1.5 * dt);
        mv.y = lift.current * dt;
        G.world.position.sub(mv); // mover o mundo ao contrário = mover a câmera
      }
      const inv = G.world.matrixWorld.clone().invert().multiply(G.viewer);
      poseP = new THREE.Vector3(); poseQ = new THREE.Quaternion(); inv.decompose(poseP, poseQ, new THREE.Vector3());
      G.renderer.render(G.scene, G.cam);
    } else {
      // giroscópio / toque: orientação do aparelho ou do dedo + joystick para andar
      if (m === "gyro") poseQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.yawOffset).multiply(G.devQ);
      else poseQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(G.touch.pitch, G.touch.yaw, 0, "YXZ"));
      const yaw = yawOf(poseQ);
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const speed = 2 * scaleRef.current * dt;
      G.pos.addScaledVector(fwd, stick.current.y * speed).addScaledVector(right, stick.current.x * speed);
      G.pos.y = Math.max(0.1, G.pos.y + lift.current * scaleRef.current * dt);
      poseP = G.pos.clone();
      G.cam.position.copy(poseP); G.cam.quaternion.copy(poseQ);
      // visor no formato do vídeo final (tarjas pretas)
      const w = G.renderer.domElement.clientWidth, h = G.renderer.domElement.clientHeight, ar = ASPECTS[d.aspect];
      let vw = w, vh = w / ar; if (vh > h) { vh = h; vw = h * ar; }
      G.cam.aspect = ar; G.cam.fov = lensToFov(lensRef.current); G.cam.updateProjectionMatrix();
      G.renderer.setScissorTest(false); G.renderer.setClearColor("#000"); G.renderer.clear();
      G.renderer.setViewport((w - vw) / 2, (h - vh) / 2, vw, vh); G.renderer.setScissor((w - vw) / 2, (h - vh) / 2, vw, vh); G.renderer.setScissorTest(true);
      G.renderer.render(G.scene, G.cam);
    }
    // envia a pose ~30x por segundo
    if (m && tnow - sent.current > 33) {
      sent.current = tnow;
      post("pose", { p: poseP.toArray().map((x) => Math.round(x * 1000) / 1000), q: poseQ.normalize().toArray().map((x) => Math.round(x * 10000) / 10000), lens: lensRef.current, mode: MODE_LABEL[m] });
    }
    if (Math.round(t * 10) !== shownT.current) { shownT.current = Math.round(t * 10); setUi((u) => ({ ...u, t })); }
  }

  // ---------- calibração: o celular "vira" a câmera do shot no tempo atual ----------
  function calibrate() {
    const G = g.current, d = dataRef.current;
    if (!G || !d) return;
    const S = shotPose(d, now());
    setLens(Math.round(S.lens));
    const k = scaleRef.current;
    if (modeRef.current === "ar" && G.viewer) {
      const V = new THREE.Vector3(), Q = new THREE.Quaternion(); G.viewer.decompose(V, Q, new THREE.Vector3());
      const dy = yawOf(Q) - yawOf(S.q);
      G.world.scale.setScalar(1 / k);
      G.world.rotation.set(0, dy, 0);
      G.world.position.copy(V).sub(S.p.clone().multiplyScalar(1 / k).applyAxisAngle(new THREE.Vector3(0, 1, 0), dy));
      G.world.updateMatrixWorld(true);
    } else {
      G.pos.copy(S.p);
      if (modeRef.current === "gyro") G.yawOffset = yawOf(S.q) - yawOf(G.devQ);
      else { const e = new THREE.Euler().setFromQuaternion(S.q, "YXZ"); G.touch = { yaw: e.y, pitch: e.x }; }
    }
    navigator.vibrate?.(30);
  }

  // ---------- início de cada modo ----------
  async function start(m: Mode) {
    const G = g.current;
    if (!G) return;
    try {
      if (m === "ar") {
        const session = await navigator.xr!.requestSession("immersive-ar", { requiredFeatures: ["local-floor"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlay.current! } } as XRSessionInit);
        G.renderer.xr.enabled = true;
        G.renderer.autoClear = true;
        G.renderer.xr.setReferenceSpaceType("local-floor");
        await G.renderer.xr.setSession(session);
        G.refSpace = await session.requestReferenceSpace("local-floor");
        session.addEventListener("end", () => { G.renderer.xr.enabled = false; G.renderer.autoClear = false; modeRef.current = null; setMode(null); });
        modeRef.current = "ar"; setMode("ar");
        setTimeout(calibrate, 600); // espera a primeira pose
        return;
      }
      if (m === "gyro") {
        const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
        if (DOE.requestPermission && (await DOE.requestPermission()) !== "granted") throw new Error("Permissão do giroscópio negada");
        const zee = new THREE.Vector3(0, 0, 1), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), euler = new THREE.Euler(), q0 = new THREE.Quaternion();
        let got = false;
        window.addEventListener("deviceorientation", (e) => {
          if (e.alpha === null) return;
          got = true;
          const deg = Math.PI / 180, orient = ((screen.orientation?.angle ?? 0) as number) * deg;
          euler.set((e.beta ?? 0) * deg, (e.alpha ?? 0) * deg, -(e.gamma ?? 0) * deg, "YXZ");
          G.devQ.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
        });
        await new Promise((r) => setTimeout(r, 400));
        if (!got) throw new Error("Este aparelho/navegador não enviou dados do giroscópio. Use o modo Toque ou abra pelo endereço HTTPS.");
      }
      modeRef.current = m; setMode(m);
      calibrate();
      try { await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.("landscape"); } catch {}
      try { await document.documentElement.requestFullscreen?.(); } catch {}
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível iniciar"); }
  }

  // arrastar com o dedo (modo toque)
  const drag = useRef<{ x: number; y: number } | null>(null);

  if (error) return <Screen><p className="text-center text-red-300">{error}</p></Screen>;
  if (!data) return <Screen><p className="text-muted">Carregando cena…</p></Screen>;

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black text-white" style={{ touchAction: "none" }}>
      <div ref={mount} className="absolute inset-0"
        onPointerDown={(e) => { if (mode === "touch") drag.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={(e) => { const G = g.current; if (!drag.current || !G) return; G.touch.yaw -= (e.clientX - drag.current.x) * 0.005; G.touch.pitch = Math.max(-1.4, Math.min(1.4, G.touch.pitch - (e.clientY - drag.current.y) * 0.005)); drag.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={() => (drag.current = null)} />
      <div ref={overlay} className="pointer-events-none absolute inset-0" style={{ padding: "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)" }}>
        {!mode ? (
          <div className="pointer-events-auto flex h-full flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
            <Logo />
            <div className="text-sm text-soft">Câmera virtual · código <b className="font-mono text-mega-yellow">{code}</b></div>
            <div className="flex w-full max-w-sm flex-col gap-2">
              {arOk && <button className="btn-primary py-3" onClick={() => start("ar")}><Smartphone className="h-4 w-4" />Câmera AR — andar com o celular</button>}
              <button className={arOk ? "btn-outline py-3" : "btn-primary py-3"} onClick={() => start("gyro")}>Giroscópio + joystick</button>
              <button className="btn-ghost py-2 text-xs" onClick={() => start("touch")}>Sem sensores: arrastar + joystick</button>
            </div>
            <p className="max-w-sm text-[11px] text-muted">
              {arOk ? "AR: a posição e a rotação do celular movem a câmera (Android com ARCore). " : "Para andar com o celular (AR) use Chrome no Android. "}
              Gire o celular na horizontal. {typeof window !== "undefined" && !window.isSecureContext ? "Atenção: sensores só funcionam pelo endereço HTTPS do hub." : ""}
            </p>
          </div>
        ) : (
          <>
            {/* topo */}
            <div className="pointer-events-auto absolute left-3 right-3 top-3 flex items-center gap-2 text-xs">
              <span className="rounded-md bg-black/70 px-2 py-1 font-semibold">{MODE_LABEL[mode]}</span>
              <span className="rounded-md bg-black/70 px-2 py-1 font-mono tabular-nums">{ui.t.toFixed(1)} / {ui.duration}s</span>
              {ui.recording && <span className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 font-bold"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />GRAVANDO</span>}
              <span className="ml-auto flex items-center gap-1 rounded-md bg-black/70 p-0.5">
                {SCALES.map((s) => <button key={s} onClick={() => { setScale(s); scaleRef.current = s; calibrate(); }} className={`rounded px-2 py-1 font-bold ${scale === s ? "bg-mega-yellow text-black" : ""}`}>{s}×</button>)}
              </span>
            </div>
            {/* lente + altura */}
            <div className="pointer-events-auto absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2">
              <button className="rounded-full bg-black/70 p-2" onClick={() => setLens(LENSES[Math.min(LENSES.length - 1, LENSES.findIndex((l) => l >= lens) + 1)] ?? lens)}><Plus className="h-5 w-5" /></button>
              <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs">{lens}mm</span>
              <button className="rounded-full bg-black/70 p-2" onClick={() => setLens([...LENSES].reverse().find((l) => l < lens) ?? lens)}><Minus className="h-5 w-5" /></button>
              <div className="h-3" />
              <button className="rounded-full bg-black/70 p-2" onPointerDown={() => (lift.current = 1)} onPointerUp={() => (lift.current = 0)} onPointerLeave={() => (lift.current = 0)}><ChevronUp className="h-5 w-5" /></button>
              <button className="rounded-full bg-black/70 p-2" onPointerDown={() => (lift.current = -1)} onPointerUp={() => (lift.current = 0)} onPointerLeave={() => (lift.current = 0)}><ChevronDown className="h-5 w-5" /></button>
            </div>
            {/* joystick */}
            <Joystick onMove={(x, y) => (stick.current = { x, y })} />
            {/* transporte */}
            <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3">
              <button className="rounded-full bg-black/70 p-3" title="Voltar ao início" onClick={() => post("cmd", { action: "stop" })}><RotateCcw className="h-5 w-5" /></button>
              <button className="rounded-full bg-black/70 p-3" onClick={() => post("cmd", { action: ui.playing ? "pause" : "play" })}>{ui.playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
              <button className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-white ${ui.recording ? "bg-red-600" : "bg-red-500/80"}`} title="Gravar take" onClick={() => post("cmd", { action: ui.recording ? "pause" : "rec" })}>
                <span className={ui.recording ? "h-5 w-5 rounded-sm bg-white" : "h-8 w-8 rounded-full bg-red-600"} />
              </button>
              <button className="rounded-full bg-black/70 p-3" title="Zerar: o celular vira a câmera do shot" onClick={calibrate}><Crosshair className="h-5 w-5" /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6"><Logo />{children}</div>;
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
    setKnob({ x, y }); onMove(x, -y);
  };
  const end = () => { setKnob({ x: 0, y: 0 }); onMove(0, 0); };
  return (
    <div ref={base} className="pointer-events-auto absolute bottom-6 left-6 h-32 w-32 rounded-full border-2 border-white/40 bg-black/40"
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); update(e); }} onPointerMove={(e) => e.buttons && update(e)} onPointerUp={end} onPointerCancel={end}>
      <div className="absolute h-12 w-12 rounded-full bg-mega-yellow/90" style={{ left: `calc(50% - 24px + ${knob.x * 40}px)`, top: `calc(50% - 24px + ${knob.y * 40}px)` }} />
    </div>
  );
}
