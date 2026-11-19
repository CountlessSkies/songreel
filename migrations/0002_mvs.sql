-- MV tam: anh Nano Banana 2.1 + clip Seedance 2.0 mini qua RunningHub, ghep tren trinh duyet
CREATE TABLE IF NOT EXISTS mvs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mode TEXT NOT NULL,               -- hybrid | full
  ratio TEXT NOT NULL,              -- 9:16 | 16:9
  take INTEGER NOT NULL,            -- ban nhac dung lam nen
  duration REAL NOT NULL,           -- giay, client do tu file mp3
  stage TEXT NOT NULL,              -- plan | anchor | scenes | ready | failed
  photos INTEGER NOT NULL DEFAULT 0,-- so anh nguoi nhan (KV mvphoto/<id>/<n>, khong phuc vu ra ngoai)
  bible TEXT,                       -- JSON {character, setting, style}
  anchor_task TEXT,
  anchor_url TEXT,                  -- link RunningHub cua anh nhan vat goc (song 24h)
  scenes TEXT NOT NULL,             -- JSON MvSceneRow[]
  cost_usd REAL NOT NULL DEFAULT 0,
  llm_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  busy_until INTEGER
);
CREATE INDEX IF NOT EXISTS mvs_open ON mvs (stage, updated_at);
CREATE INDEX IF NOT EXISTS mvs_order ON mvs (order_id);
