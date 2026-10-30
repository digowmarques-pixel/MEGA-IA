// Atualiza em segundo plano as gerações em andamento, mesmo que ninguém esteja com a tela aberta.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startPoller } = await import("./lib/poller");
  startPoller();
}
