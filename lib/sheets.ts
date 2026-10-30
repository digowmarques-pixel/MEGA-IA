// Folhas de referência (método de previs): fundo cinza liso, vistas fixas, sem texto.
// Cada folha vira uma referência nomeada no projeto (ex.: LucyRosto, LucyFigurino) e entra no Seedance junto com o blockout.

export type SheetPreset = { id: string; label: string; hint: string; aspect: string; template: string };

const BASE = "plain flat mid-grey seamless background, even soft studio lighting, no cast shadows, no text, no labels, no watermark, high detail, consistent proportions across views";

export const SHEET_PRESETS: SheetPreset[] = [
  { id: "personagem", label: "Personagem 3 vistas", aspect: "16:9", hint: "Corpo inteiro de frente, 3/4 e costas. O rosto vai numa folha separada.",
    template: `Character reference sheet of {s}. Three full-body views side by side, evenly spaced: front, three-quarter side, back. Same relaxed A-pose and same outfit in every view, feet fully visible, face kept neutral and simple (identity comes from a separate face sheet). ${BASE}.` },
  { id: "rosto", label: "Rosto", aspect: "16:9", hint: "Frente e perfil 3/4, expressão neutra, textura de pele real.",
    template: `Face reference sheet of {s}. Two head-and-shoulders portraits side by side: straight front and three-quarter profile. Neutral expression, eyes open, hair pulled away from the face, realistic skin texture with pores, no makeup change between views. ${BASE}.` },
  { id: "figurino", label: "Figurino / textura", aspect: "1:1", hint: "Detalhes de tecido, joias, cabelo e pele para manter consistência.",
    template: `Costume and texture reference board of {s}: four macro close-ups in a 2x2 grid — fabric weave, stitching and buttons, jewelry or accessories, hair texture. True-to-life materials and colors. ${BASE}.` },
  { id: "objeto", label: "Objeto / veículo", aspect: "16:9", hint: "Frente, lateral e traseira na mesma escala.",
    template: `Object reference sheet of {s}. Three orthographic-style views side by side at the same scale: front, side profile, rear. Accurate materials, logos and proportions, no perspective distortion. ${BASE}.` },
  { id: "locacao", label: "Locação 2 ângulos", aspect: "16:9", hint: "Vista 3/4 e o contraplano, para o modelo entender o espaço.",
    template: `Location reference of {s}. Two wide frames side by side of the same place: a three-quarter establishing view and the reverse angle looking back the other way. Empty of people, eye-level camera at 1.6 m, 24mm lens, natural light matching the scene's time of day, consistent architecture and props between both frames, no text.` },
  { id: "elenco", label: "Figurantes", aspect: "16:9", hint: "Grupo de extras com o figurino da cena, para multidões consistentes.",
    template: `Group reference of background extras for {s}: eight full-body people standing in a loose line, varied ages, body types and ethnicities, all dressed for the scene, neutral poses, faces natural. ${BASE}.` },
];

export function applySheet(p: SheetPreset, subject: string) {
  return p.template.replace("{s}", subject.trim() || "[describe the character / object / place]");
}
