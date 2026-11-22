-- MV ke chuyen (muc Pro/Cinematic, mode 'story'): kich ban, nhan vat, boi canh, moc loi, va luc khach duyet storyboard.
ALTER TABLE mvs ADD COLUMN story TEXT;          -- JSON Story (src/worker/mvStory.ts)
ALTER TABLE mvs ADD COLUMN approved_at INTEGER; -- luc khach duyet storyboard, tinh gio quay clip tu day
