import { higgsfieldApiProvider } from "./providers/higgsfield-api";
import { higgsfieldMcpProvider } from "./providers/higgsfield-mcp";
import { mockProvider } from "./providers/mock";
import type { GenerationProvider } from "./providers/types";

export function higgsfieldMode(): "mock" | "mcp" | "api" {
  const m = (process.env.HIGGSFIELD_MODE || "mock").toLowerCase();
  return m === "mcp" || m === "api" ? m : "mock";
}

export function higgsfield(): GenerationProvider {
  switch (higgsfieldMode()) {
    case "mcp":
      return higgsfieldMcpProvider;
    case "api":
      return higgsfieldApiProvider;
    default:
      return mockProvider;
  }
}
