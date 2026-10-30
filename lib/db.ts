import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "hub.db");

declare global {
  // eslint-disable-next-line no-var
  var __hubDb: Database.Database | undefined;
}

function init(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',          -- 'admin' (gestor) | 'member'
      department TEXT,
      monthly_allowance INTEGER NOT NULL DEFAULT 0, -- créditos da empresa liberados automaticamente todo mês
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,                    -- usado na nomenclatura dos arquivos
      client TEXT,
      description TEXT,
      look TEXT,                                    -- direção de arte / color grading global
      aspect_ratio TEXT DEFAULT '16:9',
      status TEXT NOT NULL DEFAULT 'ativo',
      budget_enabled INTEGER NOT NULL DEFAULT 0,    -- 1 = gerações dentro do projeto debitam a verba do projeto
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Cenário = família de cenas que compartilham locação / luz / grading
    CREATE TABLE IF NOT EXISTS scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      scenario_id INTEGER REFERENCES scenarios(id) ON DELETE SET NULL,
      scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,                           -- image | video | audio | upscale_image | upscale_video | avatar
      model TEXT NOT NULL,
      prompt TEXT,
      params TEXT,                                  -- JSON
      source_asset_id INTEGER,
      provider TEXT NOT NULL,                       -- mock | higgsfield-mcp | higgsfield-api | elevenlabs
      provider_job_ids TEXT,                        -- JSON array
      client_request_id TEXT UNIQUE,                -- idempotência: evita cobrança duplicada em duplo clique
      wallet_type TEXT,                             -- project | user | personal (quem pagou)
      wallet_id INTEGER,
      status TEXT NOT NULL DEFAULT 'queued',        -- queued | processing | completed | failed
      credits REAL NOT NULL DEFAULT 0,              -- créditos Higgsfield debitados (ElevenLabs: caracteres)
      estimated_credits REAL,
      cost_usd REAL NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generation_id INTEGER REFERENCES generations(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      scenario_id INTEGER REFERENCES scenarios(id) ON DELETE SET NULL,
      scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
      parent_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,                           -- image | video | audio
      source TEXT NOT NULL DEFAULT 'generated',     -- generated | upload
      original_name TEXT,
      prompt TEXT,
      model TEXT,
      url TEXT NOT NULL,
      thumb_url TEXT,
      provider_ref TEXT,                            -- job_id/media_id no Higgsfield (reuso como referência)
      width INTEGER,
      height INTEGER,
      duration REAL,
      version INTEGER NOT NULL DEFAULT 1,
      favorite INTEGER NOT NULL DEFAULT 0,
      approved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Livro-razão de créditos. Saldo de qualquer carteira = SUM(amount).
    --   company  (wallet_id 0): compras de créditos no Higgsfield (amount = créditos, usd = valor pago)
    --   user     (wallet_id = user): cota da empresa para o funcionário (grant / monthly / debit / refund)
    --   project  (wallet_id = project): verba do projeto
    --   personal (wallet_id = user): créditos pagos pelo próprio funcionário — só ele usa
    CREATE TABLE IF NOT EXISTS credit_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_type TEXT NOT NULL CHECK (wallet_type IN ('company','user','project','personal')),
      wallet_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      kind TEXT NOT NULL,                           -- purchase | grant | monthly | topup | debit | refund | adjust
      usd REAL,
      generation_id INTEGER REFERENCES generations(id) ON DELETE SET NULL,
      period TEXT,                                  -- YYYY-MM (cota mensal)
      note TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_monthly ON credit_ledger(wallet_type, wallet_id, period) WHERE kind = 'monthly';
    CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON credit_ledger(wallet_type, wallet_id);

    CREATE TABLE IF NOT EXISTS topup_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      usd REAL NOT NULL,
      credits REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',       -- pending | approved | rejected | canceled
      payment_ref TEXT,                             -- comprovante / id do Pix
      note TEXT,
      decided_by INTEGER REFERENCES users(id),
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      feature TEXT NOT NULL,                        -- enhance | assistant
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Cenas 3D de blocking (previs) usadas como vídeo de referência no Seedance
    CREATE TABLE IF NOT EXISTS blocking_scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      scenario_id INTEGER REFERENCES scenarios(id) ON DELETE SET NULL,
      scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,                           -- JSON: objetos, keyframes, câmera
      last_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Biblioteca de prompts de referência (curada pela equipe / importada)
    CREATE TABLE IF NOT EXISTS prompt_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'video',           -- video | image
      model TEXT,
      category TEXT NOT NULL,
      prompt TEXT NOT NULL,
      notes TEXT,                                   -- por que funciona / quais inputs usar
      tags TEXT,                                    -- JSON array: câmera, grading, gênero…
      inputs TEXT,                                  -- JSON array: referências necessárias (ex.: frame inicial, vídeo de blocking)
      asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      source_url TEXT,
      created_by INTEGER REFERENCES users(id),
      uses INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_gen_user ON generations(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_gen_project ON generations(project_id);
    CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id, scenario_id, scene_id);
  `);

  migrate(db);
  seed(db);
  return db;
}

/** Colunas adicionadas depois da criação das tabelas (bancos antigos recebem sem perder dados). */
function migrate(db: Database.Database) {
  const add = (table: string, col: string, def: string) => {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  add("prompt_library", "video_url", "TEXT");
  add("prompt_library", "thumb_url", "TEXT");
  add("prompt_library", "author_credit", "TEXT");
  add("prompt_library", "mode", "TEXT");
  add("prompt_library", "duration", "INTEGER");
  add("prompt_library", "ratio", "TEXT");
  add("prompt_library", "refs_count", "INTEGER");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_library_source ON prompt_library(source_url) WHERE source_url LIKE 'http%'");
}

function seed(db: Database.Database) {
  const defaults: Record<string, string> = {
    company_name: "AI Hub",
    usd_per_credit: "0.044625",           // pacote 2.000 créditos = US$ 89,25 (atualiza a cada compra registrada)
    monthly_budget_usd: "500",
    usd_brl: "5.40",                      // só para exibição opcional em reais
    elevenlabs_usd_per_1k_chars: "0.30",
    personal_topup_min_usd: "5",
    topup_expire_days: "90",              // créditos avulsos do Higgsfield expiram em 90 dias
  };
  const ins = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

  const count = db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number };
  if (count.c === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin123", 10);
    db.prepare("INSERT INTO users (name, email, password_hash, role, department) VALUES (?, ?, ?, 'admin', 'Direção')")
      .run("Gestor", process.env.ADMIN_EMAIL || "admin@hub.local", hash);
  }
}

export function db(): Database.Database {
  if (!global.__hubDb) global.__hubDb = init();
  return global.__hubDb;
}

export function getSetting(key: string, fallback = ""): string {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function getSettingNumber(key: string, fallback = 0): number {
  const n = Number(getSetting(key, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

export function setSetting(key: string, value: string) {
  db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export type UserRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "member";
  department: string | null;
  monthly_allowance: number;
  active: number;
  created_at: string;
};
