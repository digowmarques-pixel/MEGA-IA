// Nomenclatura padrão de arquivos:
//   {PROJETO}_CEN{01}_CENA{02}_{IMG|VID|AUD}_v{003}.{ext}
// Sem cenário/cena: {PROJETO}_GERAL_{TIPO}_v{003}  |  Sem projeto: AVULSO_{usuario}_{TIPO}_{id}

export function slugCode(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "PROJETO"
  );
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const TYPE: Record<string, string> = { image: "IMG", video: "VID", audio: "AUD", ref: "REF", previs: "PREVIS" };

export function buildFilename(opts: {
  projectCode?: string | null;
  scenarioIdx?: number | null;
  sceneIdx?: number | null;
  kind: string;
  version: number;
  ext?: string;
  userName?: string;
  id?: number;
}) {
  const type = TYPE[opts.kind] || opts.kind.toUpperCase();
  const parts: string[] = [];
  if (opts.projectCode) {
    parts.push(opts.projectCode);
    if (opts.scenarioIdx) parts.push(`CEN${pad(opts.scenarioIdx)}`);
    if (opts.sceneIdx) parts.push(`CENA${pad(opts.sceneIdx)}`);
    if (!opts.scenarioIdx && !opts.sceneIdx) parts.push("GERAL");
    parts.push(type, `v${pad(opts.version, 3)}`);
  } else {
    parts.push("AVULSO", slugCode(opts.userName || "user"), type, pad(opts.id ?? opts.version, 4));
  }
  return parts.join("_") + (opts.ext ? `.${opts.ext}` : "");
}

export function withExt(filename: string, ext: string) {
  return filename.replace(/\.[a-z0-9]+$/i, "") + "." + ext;
}
