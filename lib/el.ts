import * as real from "./providers/elevenlabs";
import { mockEl, mockModels, mockVoices } from "./providers/elevenlabs-mock";

/** ElevenLabs real quando há chave; senão simulação (mesma interface). */
export const elMode = () => (real.elevenlabsConfigured() ? "live" : "mock");
export const EL = {
  textToSpeech: (o: Parameters<typeof real.textToSpeech>[0]) => (elMode() === "live" ? real.textToSpeech(o) : mockEl.textToSpeech()),
  soundEffect: (o: Parameters<typeof real.soundEffect>[0]) => (elMode() === "live" ? real.soundEffect(o) : mockEl.soundEffect()),
  isolateVoice: (f: Parameters<typeof real.isolateVoice>[0]) => (elMode() === "live" ? real.isolateVoice(f) : mockEl.isolateVoice()),
  changeVoice: (o: Parameters<typeof real.changeVoice>[0]) => (elMode() === "live" ? real.changeVoice(o) : mockEl.changeVoice()),
  designVoicePreviews: (o: Parameters<typeof real.designVoicePreviews>[0]) => (elMode() === "live" ? real.designVoicePreviews(o) : mockEl.designVoicePreviews(o)),
  saveDesignedVoice: (o: Parameters<typeof real.saveDesignedVoice>[0]) => (elMode() === "live" ? real.saveDesignedVoice(o) : mockEl.saveDesignedVoice(o)),
  cloneVoice: (o: Parameters<typeof real.cloneVoice>[0]) => (elMode() === "live" ? real.cloneVoice(o) : mockEl.cloneVoice()),
  listVoices: () => (elMode() === "live" ? real.listVoices() : Promise.resolve(mockVoices)),
  listModels: () => (elMode() === "live" ? real.listModels() : Promise.resolve(mockModels)),
  subscription: () => (elMode() === "live" ? real.subscription() : Promise.resolve(null)),
};
export { OUTPUT_FORMATS } from "./providers/elevenlabs";
