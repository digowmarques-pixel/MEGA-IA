// Diretor 3D: o Claude monta (ou ajusta) uma cena de blocking a partir de uma descrição em texto
// e devolve um relatório de verificação. Todo número que volta é validado e limitado aqui antes de ir para a cena.
import { z } from "zod";
import { COLORS, OBJ_LABEL, type BlockingData, type BlockObj, type CamKey, type ObjType } from "./blocking";

const TYPES = Object.keys(OBJ_LABEL) as [ObjType, ...ObjType[]];
const ASPECTS = ["16:9", "9:16", "1:1", "21:9"] as const;

export const DirectorSchema = z.object({
  duration: z.number().describe("Duração total do plano em segundos (3 a 15)"),
  aspect: z.enum(ASPECTS),
  ground: z.string().describe("Cor do chão em hex"),
  sky: z.string().describe("Cor do fundo/céu em hex"),
  objects: z.array(z.object({
    name: z.string().describe("Nome curto em português do que o elemento representa (vai para a legenda do prompt)"),
    type: z.enum(TYPES),
    color: z.string().describe("Cor hex da paleta"),
    count: z.number().nullable().describe("Só para crowd/scatter: quantidade"),
    spread: z.number().nullable().describe("Só para crowd/scatter: raio de espalhamento em metros"),
    keys: z.array(z.object({
      t: z.number(), x: z.number(), y: z.number(), z: z.number(),
      yaw_deg: z.number().describe("Rotação em torno do eixo vertical; 0 = olhando para +Z, 90 = olhando para +X"),
      scale: z.number().describe("Escala uniforme (1 = tamanho padrão)"),
    })).describe("Keyframes ordenados por t. Um só keyframe = elemento parado"),
  })),
  camera: z.array(z.object({
    t: z.number(), x: z.number(), y: z.number(), z: z.number(),
    look_x: z.number(), look_y: z.number(), look_z: z.number(),
    lens: z.number().describe("Lente em mm (14, 18, 24, 35, 50, 85 ou 135)"),
  })).describe("Keyframes da câmera, ordenados por t, cobrindo de 0 até a duração"),
  brief: z.object({
    scene: z.string().describe("Cenário real em inglês (para o prompt do vídeo final)"),
    light: z.string().describe("Luz em inglês"),
    style: z.string().describe("Estilo/look em inglês"),
    avoid: z.string().describe("Itens extras a evitar, em inglês (pode ser vazio)"),
  }),
  report: z.object({
    summary: z.string().describe("O que foi montado, em português, 2-3 frases"),
    shot: z.array(z.string()).describe("Decupagem segundo a segundo, em português: o que a câmera e cada elemento fazem"),
    checks: z.array(z.object({ item: z.string(), ok: z.boolean(), note: z.string() })).describe("Verificações: escala, colisões, enquadramento, cores distintas, regras de câmera"),
  }),
});
export type DirectorOutput = z.infer<typeof DirectorSchema>;

export const DIRECTOR_RULES = `Você é o diretor de previs (blocking 3D) da produtora. Monte cenas simples com formas básicas que servem de referência de movimento para o Seedance.

Sistema de coordenadas: metros, Y para cima, chão em y = 0. Todo objeto com rotação 0 está virado para +Z.
Tamanhos padrão (escala 1): person 1,8 m de altura; car 4,2 m de comprimento × 1,8 m; wall 4 × 2,6 m; table 2 × 0,9 m (altura 0,75); building 6 × 8 × 5 m;
tree 4 m; mountain 10 m de altura e 24 m de base; road 7 m de largura × 20 m de comprimento (ao longo de Z); screen 1,6 × 1 m (centro na altura y informada);
box 1 m; cylinder 1,5 m; sphere 1 m; crowd e scatter espalham "count" itens num raio "spread"; arrow é só indicação de direção (não aparece no vídeo final).
Objetos ficam no chão (y = 0), exceto screen (y = altura do centro) e algo que esteja em cima de outro (ex.: pessoa no teto do carro, y ≈ 1,6).

Regras de blocking (aprendidas com os fluxos de previs que funcionam no Seedance):
- Um único plano contínuo, 3 a 15 s. Sem cortes.
- Cada personagem/elemento importante com uma cor forte e diferente dos outros; cenário em tons neutros (cinza, bege, branco). Cores da paleta: ${COLORS.map((c) => `${c.hex} (${c.name})`).join(", ")}.
- A câmera só gira enquanto também se desloca (nada de pan parado no meio do movimento); começa e termina com suavidade (ease in/out).
- Câmera em altura humana (1,4–1,7 m) salvo pedido de grua, drone ou plongée. Distâncias realistas para a lente: 24 mm abre o espaço, 50 mm conversa, 85 mm detalhe.
- Personagens andam a ~1,4 m/s, correm a ~4 m/s; carros urbanos 8–14 m/s. Gire o personagem (yaw) para olhar na direção em que anda.
- Nada atravessa nada: confira distâncias entre objetos em cada keyframe.
- O assunto principal precisa estar enquadrado do início ao fim (calcule o ângulo de visão da lente: 35 mm ≈ 54° horizontais em 16:9).
- Keyframes só onde o movimento muda; o sistema interpola com suavidade entre eles.
No relatório, seja honesto: marque ok = false no que não conseguiu respeitar e explique.`;

const clamp = (n: number, a: number, b: number) => (Number.isFinite(n) ? Math.min(Math.max(n, a), b) : a);
const hex = (s: string, fb: string) => (/^#[0-9a-f]{6}$/i.test(s.trim()) ? s.trim().toLowerCase() : fb);
const LENSES = [14, 18, 24, 35, 50, 85, 135];
const nearestLens = (l: number) => LENSES.reduce((b, x) => (Math.abs(x - l) < Math.abs(b - l) ? x : b), 35);

/** Converte a resposta do Claude em BlockingData válido (ordena, limita e corrige o que vier fora do padrão). */
export function toBlocking(o: DirectorOutput, prev?: BlockingData): { data: BlockingData; fixes: string[] } {
  const fixes: string[] = [];
  const duration = Math.round(clamp(o.duration, 1, 30) * 10) / 10;
  if (duration !== o.duration) fixes.push(`duração ajustada para ${duration}s`);
  const T = (t: number) => clamp(t, 0, duration);
  const P = (n: number) => clamp(n, -200, 200);
  const objects: BlockObj[] = o.objects.slice(0, 60).map((x, i) => {
    const keys = [...x.keys].sort((a, b) => a.t - b.t).filter((k, j, arr) => j === 0 || k.t !== arr[j - 1].t).slice(0, 60)
      .map((k) => { const s = clamp(k.scale, 0.05, 50); return { t: T(k.t), p: [P(k.x), clamp(k.y, -5, 100), P(k.z)] as [number, number, number], r: [0, (k.yaw_deg * Math.PI) / 180, 0] as [number, number, number], s: [s, s, s] as [number, number, number] }; });
    if (!keys.length) { keys.push({ t: 0, p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }); fixes.push(`${x.name}: sem keyframes, colocado na origem`); }
    const params = x.type === "crowd" || x.type === "scatter"
      ? { count: Math.round(clamp(x.count ?? (x.type === "crowd" ? 30 : 300), 1, x.type === "crowd" ? 400 : 3000)), spread: clamp(x.spread ?? 6, 0.5, 100), seed: i + 1 } : undefined;
    const color = hex(x.color, COLORS[i % COLORS.length].hex);
    if (color !== x.color.trim().toLowerCase()) fixes.push(`${x.name}: cor inválida "${x.color}", usada ${color}`);
    return { id: `d${i + 1}`, type: x.type, name: x.name.slice(0, 60) || OBJ_LABEL[x.type], color, keys, ...(params ? { params } : {}) };
  });
  let camera: CamKey[] = [...o.camera].sort((a, b) => a.t - b.t).slice(0, 60).map((c) => ({
    t: T(c.t), p: [P(c.x), clamp(c.y, 0.1, 300), P(c.z)], target: [P(c.look_x), clamp(c.look_y, -5, 300), P(c.look_z)], lens: nearestLens(c.lens),
  }));
  camera = camera.filter((c, j, arr) => j === 0 || c.t !== arr[j - 1].t);
  if (!camera.length) { camera = prev?.camera.length ? prev.camera : [{ t: 0, p: [0, 1.6, 8], target: [0, 1, 0], lens: 35 }]; fixes.push("câmera ausente: mantida a anterior"); }
  return {
    data: {
      version: 1, duration, fps: prev?.fps ?? 24, aspect: o.aspect, ground: hex(o.ground, "#3a3a3a"), sky: hex(o.sky, "#9aa4ad"), objects, camera,
      brief: { scene: o.brief.scene, light: o.brief.light, style: o.brief.style, avoid: o.brief.avoid },
    },
    fixes,
  };
}

/** A cena atual em texto compacto, para o Claude ajustar em vez de recriar. */
export function sceneForPrompt(d: BlockingData) {
  const r = (n: number) => Math.round(n * 100) / 100;
  return JSON.stringify({
    duration: d.duration, aspect: d.aspect, ground: d.ground, sky: d.sky, brief: d.brief ?? null,
    objects: d.objects.map((o) => ({ name: o.name, type: o.type, color: o.color, count: o.params?.count ?? null, spread: o.params?.spread ?? null,
      keys: o.keys.map((k) => ({ t: r(k.t), x: r(k.p[0]), y: r(k.p[1]), z: r(k.p[2]), yaw_deg: Math.round((k.r[1] * 180) / Math.PI), scale: r(k.s[0]) })) })),
    // takes do celular têm uma key por quadro: manda uma amostra
    camera: (d.camera.length > 16 ? d.camera.filter((_, i) => i % Math.ceil(d.camera.length / 16) === 0) : d.camera)
      .map((c) => ({ t: r(c.t), x: r(c.p[0]), y: r(c.p[1]), z: r(c.p[2]), look_x: r(c.target[0]), look_y: r(c.target[1]), look_z: r(c.target[2]), lens: c.lens })),
  });
}
