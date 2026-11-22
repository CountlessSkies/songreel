-- Ban acoustic mua kem khi thanh toan: Suno thu lai cung loi voi phoi guitar/piano moc.
-- JSON {status: running|ready|failed, task, submittedAt, take?, error?}
ALTER TABLE orders ADD COLUMN acoustic TEXT;
