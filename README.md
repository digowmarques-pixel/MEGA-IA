# MEGA HUB AI

Hub interno de criação com IA da Mega: projetos organizados em **cenários** (locações) e **cenas**, geração de imagem, vídeo, áudio, upscale e avatares via Higgsfield, enhance de prompt com Claude, e controle financeiro de créditos por funcionário e por projeto.

## Rodar no seu computador (Windows)

1. Instale o **Node.js LTS** em https://nodejs.org (versão 20 ou mais nova).
2. Baixe esta pasta (GitHub → **Code → Download ZIP**, ou `git clone`) e extraia, por exemplo, em `C:\MEGA-HUB`.
3. Dê dois cliques em **`INSTALAR.bat`** (só na primeira vez; leva alguns minutos).
4. Dê dois cliques em **`INICIAR.bat`**. O navegador abre em http://localhost:3100.
   Deixe a janela preta aberta enquanto usa o hub; para parar, feche-a ou aperte Ctrl+C.

Login inicial: `admin@hub.local` / `admin123` (troque em **Minha carteira → Trocar senha**, ou defina `ADMIN_EMAIL` / `ADMIN_PASSWORD` no `.env` antes do primeiro início).
Na primeira execução o hub cria o `.env` em modo simulação (`HIGGSFIELD_MODE=mock`): coloque as chaves nele e reinicie para usar as contas reais.
Tudo fica na pasta `data/` (banco e arquivos gerados): é ela que você copia para fazer backup.

**Atualizar:** `ATUALIZAR.bat` (baixa a versão nova do GitHub e recompila). **Mac/Linux:** `./iniciar.sh`.

### Celular como câmera no blocking 3D

O celular só libera giroscópio e rastreamento 3D em páginas **HTTPS**. Por isso o `INICIAR.bat` abre duas portas:

| Endereço | Para quê |
|---|---|
| `http://localhost:3100` | o hub no computador |
| `https://<IP-do-computador>:3443` | o celular na mesma rede Wi-Fi (o QR code já aponta para cá) |

Passo a passo:
1. Computador e celular **na mesma rede Wi-Fi**.
2. Na primeira vez que o hub iniciar, o Windows pergunta se o Node.js pode acessar a rede: marque **Redes privadas** e clique em **Permitir**.
   Se a sua rede Wi-Fi estiver como "Pública" no Windows, mude para "Privada" (Configurações → Rede e Internet → Wi-Fi → propriedades).
3. No Blocking 3D, clique em **Conectar celular** e leia o QR code.
4. O celular avisa que "a conexão não é particular" (o certificado é gerado pelo próprio hub). Toque em **Avançado → Continuar para o site**. Só na primeira vez.
5. Se o computador tiver mais de uma rede (VPN, máquina virtual), escolha o endereço certo na lista abaixo do QR.

**Se o celular não aceitar o certificado** ou estiver em outra rede (4G), use **`INICIAR-COM-TUNEL.bat`**: ele instala o `cloudflared` (túnel gratuito da Cloudflare) e cria um endereço `https://….trycloudflare.com` com certificado válido. O QR passa a apontar para ele. Esse endereço fica acessível pela internet enquanto a janela estiver aberta (protegido pelo login do hub); feche quando terminar.

O vídeo de referência do blocking é convertido para MP4 com um ffmpeg que já vem na instalação (não precisa instalar nada). Para usar outro, defina `FFMPEG_PATH` no `.env`.

### Se algo der errado

- **INSTALAR.bat falha falando em `node-gyp`, `Visual Studio` ou `better-sqlite3`:** o banco não tem versão pronta para o seu Node. Instale o **Node.js 22 LTS** (https://nodejs.org/pt/download, aba de versões anteriores) e rode o INSTALAR.bat de novo.
- **O celular não abre o endereço:** confira se está no mesmo Wi-Fi, se o Windows liberou o Node.js em redes privadas e se escolheu o IP certo na lista abaixo do QR. Se nada resolver, use o `INICIAR-COM-TUNEL.bat`.
- **A porta 3100 está ocupada:** já existe um hub aberto. Feche a outra janela preta.

### Para desenvolvedores

```bash
npm install
npm run dev          # modo desenvolvimento em http://localhost:3000 (sem HTTPS para o celular)
npm run build && npm start   # igual ao INICIAR.bat (HTTP 3100 + HTTPS 3443)
```

Variáveis do servidor local: `PORT` (3100), `HTTPS_PORT` (3443), `LOCAL_HTTPS=0` desliga o HTTPS, `PUBLIC_URL` força o endereço usado no QR code.

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

Servidor Node 20+ com disco persistente (o banco SQLite fica em `data/hub.db` e os uploads em `data/media/`). Faça backup da pasta `data/`. Coloque o hub atrás de um proxy HTTPS (Caddy ou Nginx em `hub.megalume.com`) com `LOCAL_HTTPS=0`, `PUBLIC_URL=https://hub.megalume.com` e um `AUTH_SECRET` longo e aleatório. O cookie de sessão vira `secure` automaticamente quando a conexão é HTTPS. Para muitos usuários simultâneos, migrar para Postgres é o próximo passo.
