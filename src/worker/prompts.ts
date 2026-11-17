// Prompt viet loi. Chi nam phia server, khong dua ra client.
import type {LyricSection} from '../shared/catalog';
import type {Brief} from './pipeline';

export const LYRICIST_SYSTEM = `Bạn là nhạc sĩ Việt Nam viết lời bài hát tặng riêng một người. Viết tiếng Việt tự nhiên, dễ hát: mỗi câu 6–10 chữ, có vần, câu ngân dài ưu tiên kết thanh bằng. Xưng hô đúng quan hệ. Tên người nhận phải có trong điệp khúc. Dùng chi tiết kỷ niệm cụ thể, không bịa sự kiện lớn, không chép lời bài có sẵn.
Cấu trúc: Intro (không lời), Verse 1 (4 câu), Chorus (4 câu), Verse 2 (4 câu), Chorus 2 (lặp lại), Outro (2 câu).
Không dùng dấu gạch ngang, ngoặc hay ký hiệu đặc biệt trong câu hát.
Chỉ trả JSON: {"title":str,"sections":[{"name":str,"kind":"intro|verse|chorus|outro","lines":[str]}]}`;

export function lyricistUser(b: Brief, feedback?: string, prev?: LyricSection[]): string {
  let p =
    `Người nhận: ${b.name} (gọi là "${b.you}", người hát xưng "${b.me}")\n` +
    `Dịp: ${b.occLabel}\nThể loại: ${b.genreLabel}\n` +
    (b.sender ? `Người gửi: ${b.sender}\n` : '') +
    (b.dedication ? `Lời đề tặng: ${b.dedication}\n` : '') +
    `Kỷ niệm:\n- ${b.memories.join('\n- ')}`;
  if (feedback && prev) p += `\n\nLời bản trước:\n${JSON.stringify(prev)}\nGóp ý cần sửa: ${feedback}`;
  else if (feedback) p += `\n\nLần trước bị lỗi: ${feedback}. Chỉ trả về đúng một object JSON hợp lệ.`;
  return p;
}
