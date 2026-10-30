import fs from "fs";
import path from "path";
import { mediaDir } from "../media";
import { placeholderWav } from "../placeholder";
import type { ElModel, Voice } from "./elevenlabs";

// Simulação usada enquanto ELEVENLABS_API_KEY não está configurada: mesma interface, áudio de teste.
const save = (prefix: string) => {
  const name = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`;
  fs.writeFileSync(path.join(mediaDir(), name), placeholderWav(name));
  return `/api/media/${name}`;
};
const PT = [{ language_id: "pt", name: "Portuguese" }, { language_id: "en", name: "English" }, { language_id: "es", name: "Spanish" }];

export const mockModels: ElModel[] = [
  { model_id: "eleven_v4", name: "Eleven v4", can_do_text_to_speech: true, languages: PT, description: "Simulação" },
  { model_id: "eleven_v3", name: "Eleven v3", can_do_text_to_speech: true, languages: PT },
  { model_id: "eleven_multilingual_v2", name: "Eleven Multilingual v2", can_do_text_to_speech: true, languages: PT },
  { model_id: "eleven_flash_v2_5", name: "Eleven Flash v2.5", can_do_text_to_speech: true, languages: PT },
  { model_id: "eleven_multilingual_sts_v2", name: "Eleven Multilingual STS v2", can_do_voice_conversion: true },
];
export const mockVoices: Voice[] = [
  { voice_id: "mock-otto", name: "OTTO - VOZ", category: "cloned", labels: { accent: "brasileiro", gender: "male" } },
  { voice_id: "mock-ana", name: "Ana — Narradora", category: "professional", labels: { accent: "brasileiro", gender: "female" } },
  { voice_id: "mock-leo", name: "Léo — Comercial", category: "premade", labels: { accent: "brasileiro", gender: "male" } },
];
export const mockEl = {
  textToSpeech: async () => ({ url: save("tts"), elCredits: null }),
  soundEffect: async () => ({ url: save("sfx"), elCredits: null }),
  isolateVoice: async () => ({ url: save("iso"), elCredits: null }),
  changeVoice: async () => ({ url: save("vc"), elCredits: null }),
  designVoicePreviews: async (o: { text?: string | null }) => ({ text: o.text || "Olá! Esta é uma prévia da voz criada para o seu projeto na Mega.", previews: [1, 2, 3].map((i) => ({ generatedVoiceId: `mock-gen-${Date.now()}-${i}`, duration: 2, url: save("design") })) }),
  saveDesignedVoice: async (o: { name: string }) => ({ voice_id: `mock-${Date.now()}`, name: o.name }),
  cloneVoice: async () => ({ voice_id: `mock-clone-${Date.now()}` }),
};
