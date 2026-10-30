// Biblioteca de tags de áudio (mesma organização da aba Text to Speech da ElevenLabs).
export const AUDIO_TAGS: { group: string; tags: string[] }[] = [
  { group: "Emoção", tags: ["[com voz fraca]", "[com raiva]", "[com tédio]", "[em tom ameaçador]", "[em tom brincalhão]", "[com voz cansada]", "[com empolgação]", "[com tristeza]", "[com alegria]", "[com medo]", "[surpreso]", "[com carinho]", "[sarcástico]", "[nervoso]", "[confiante]", "[emocionado]"] },
  { group: "Vocalizações", tags: ["[pigarreando]", "[tossindo]", "[rindo baixinho]", "[suspirando]", "[fungando]", "[bocejando]", "[rindo]", "[soltando o ar com força]", "[bufando com desdém]", "[cantarolando]", "[ofegando]", "[arquejando]", "[engolindo seco]", "[chorando]"] },
  { group: "Entrega", tags: ["[sussurrando]", "[gritando]", "[falando baixo]", "[falando rápido]", "[falando devagar]", "[em tom de narrador]", "[em tom de anúncio]", "[em tom de segredo]", "[enfático]", "[hesitante]"] },
  { group: "Ritmo", tags: ["[pausa]", "[pausa curta]", "[pausa longa]", "[respira fundo]"] },
];
export const ALL_TAGS = AUDIO_TAGS.flatMap((g) => g.tags);
