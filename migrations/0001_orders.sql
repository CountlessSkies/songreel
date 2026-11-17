-- Don hang SongReel PoC
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  stage TEXT NOT NULL,              -- lyrics | producer | ready | failed
  writer TEXT NOT NULL,             -- sol | claude | gemini
  answers TEXT NOT NULL,            -- JSON bang hoi
  brief TEXT NOT NULL,              -- JSON brief da chuan hoa
  round INTEGER NOT NULL DEFAULT 0, -- so lan da goi model viet loi
  lyrics TEXT,                      -- JSON {title, sections}
  critic TEXT,                      -- JSON {score, issues, notes}
  feedback TEXT,                    -- gop y cho vong sua tiep theo
  title TEXT,
  tags TEXT,                        -- style gui Suno
  rh_task_id TEXT,
  submitted_at INTEGER,
  takes TEXT,                       -- JSON [{audioUrl, coverUrl}]
  cost_usd REAL NOT NULL DEFAULT 0, -- chi phi Suno RunningHub bao
  llm_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  busy_until INTEGER
);
CREATE INDEX IF NOT EXISTS orders_open ON orders (stage, updated_at);
