# MEGA HUB AI

Hub interno de criação com IA da Mega: projetos organizados em **cenários** (locações) e **cenas**, geração de imagem, vídeo, áudio, upscale e avatares via Higgsfield, enhance de prompt com Claude, e controle financeiro de créditos por funcionário e por projeto.

## Rodar localmente

```bash
npm install
cp .env.example .env      # preencha AUTH_SECRET e as chaves
npm run build && npm start   # ou: npm run dev
```

Acesse http://localhost:3000 — login inicial: `admin@hub.local` / `admin123` (troque em **Minha carteira → Trocar senha**, ou defina `ADMIN_EMAIL` / `ADMIN_PASSWORD` antes do primeiro start).

## Integrações (.env)

| Variável | Para quê |
|---|---|
| `HIGGSFIELD_MODE` | `mock` (simulação, não gasta), `mcp` (recomendado) ou `api` |
| `HIGGSFIELD_MCP_URL` / `HIGGSFIELD_MCP_TOKEN` | MCP da conta Higgsfield — mesmo catálogo de modelos, custo real via `get_cost`, saldo e extrato reais |
| `HIGGSFIELD_API_KEY_ID` / `_SECRET` | API REST do Higgsfield Cloud (ajuste `MODEL_PATHS` em `lib/providers/higgsfield-api.ts`) |
| `ANTHROPIC_API_KEY` | Enhance de prompt e assistente Claude |
| `ELEVENLABS_API_KEY` | Locução (áudio) |

## Como funcionam os créditos

* **Valor do crédito**: o gestor registra cada compra no Higgsfield (ex.: US$ 100 = 1.500 créditos). O sistema usa a média ponderada como US$/crédito.
* **Três carteiras**:
  1. **Verba do projeto** — quando o gestor define verba (ex.: LIGA = 1.200), tudo gerado dentro do projeto sai dela.
  2. **Cota da empresa** do funcionário — cota mensal automática + extras do gestor.
  3. **Créditos pessoais** — pagos pelo funcionário (pedido de recarga → gestor confirma o pagamento). Só o dono usa.
* **Garantias**: débito atômico antes de enviar ao Higgsfield (nunca fica negativo, mesmo com cliques simultâneos), idempotência por clique, estorno automático se o envio ou o job falhar, ajuste para o custo real informado pelo Higgsfield.
* ElevenLabs é cobrado em dólar por caractere e convertido em "créditos equivalentes" para usar as mesmas carteiras.

## Nomenclatura de arquivos

`{CODIGO}_CEN{01}_CENA{02}_{IMG|VID|AUD|REF}_v{003}.ext` — calculada pela posição atual: mover um arquivo de cena ou reordenar cenários atualiza os nomes. O ZIP sai em pastas `CODIGO/CEN01_NOME/CENA01_NOME/` com `_referencias/` e um `_manifesto.csv` (prompt, modelo, autor, data).

## Skills do Claude

Arquivos `.md` em `skills/` (com cabeçalho `name` / `applies`). São lidos a cada pedido de enhance e chat — basta adicionar/editar o arquivo.

## Publicar no site

Servidor Node 20+ com disco persistente (o banco SQLite fica em `data/hub.db` e os uploads em `data/media/`). Faça backup da pasta `data/`. Use HTTPS (o cookie de sessão é `secure` em produção) e um `AUTH_SECRET` longo e aleatório. Para muitos usuários simultâneos, migrar para Postgres é o próximo passo.
