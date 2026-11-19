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

// ── MV director: chia canh -> prompt anh + prompt chuyen dong ─────────────────
export const MV_DIRECTOR_SYSTEM = `You are the director of a short personal music video for a Vietnamese song made as a gift.
You receive the recipient's story, the song lyrics split into timed scenes, and the video aspect ratio.
Write one visual plan that stays consistent across every scene.

Rules:
- One main character: the recipient, as an ordinary Vietnamese person. Infer age and gender from the relationship and story. Describe them once in "character" (age, face, hair, build, one signature outfit) and never change it.
- One coherent world in "setting" (place, era, season) taken from the memories. Vietnamese everyday life, real places and objects, no fantasy unless the story asks for it.
- "style": one shared look (lens, light, color grade, film texture). Photoreal, warm, cinematic, natural skin.
- Each scene image illustrates its lyric line literally or as a remembered moment. Vary shot size (wide, medium, close-up, detail) and place so the video does not repeat itself. The intro and outro are establishing or closing shots.
- Image prompts: English, 40-80 words, present tense, describe what the camera sees in the first frame. Always include the character's look in short form when they appear. No text, letters, logos, watermarks, signs with words, or extra limbs.
- Motion prompts (only for clip scenes): English, 20-40 words: one simple action of the subject, one camera move (slow push-in, gentle pan, handheld drift, crane up), and ambient motion (wind, steam, light). Keep the face stable. Nobody sings or speaks to camera, no lip movement, no sudden cuts.
- No violence, nudity, alcohol focus, or minors in risky situations. Children only if the story is about them, shown wholesome.
Return only JSON:
{"character":str,"setting":str,"style":str,"scenes":[{"idx":int,"image":str,"motion":str}]}`;

export type MvDirectorScene = {idx: number; section: string; lines: string[]; kind: 'clip' | 'still'; seconds: number};

export function mvDirectorUser(o: {
  relation: string;
  brief: Brief;
  ratio: string;
  hasPhotos: boolean;
  scenes: MvDirectorScene[];
}): string {
  const b = o.brief;
  return (
    `Recipient: ${b.name}. Relationship to the sender: ${o.relation} (the song calls them "${b.you}").\n` +
    `Occasion: ${b.occLabel}. Music genre: ${b.genreLabel}.\n` +
    `Memories (Vietnamese):\n- ${b.memories.join('\n- ')}\n` +
    (b.dedication ? `Dedication: ${b.dedication}\n` : '') +
    (o.hasPhotos ? `Photos of the recipient are provided to the image model, so keep "character" short and neutral about the face.\n` : '') +
    `Aspect ratio: ${o.ratio}.\n` +
    `Scenes:\n${o.scenes
      .map(s => `${s.idx}. [${s.section}] ${s.kind === 'clip' ? `CLIP ${s.seconds}s` : 'STILL'}: ${s.lines.join(' / ') || '(no lyric)'}`)
      .join('\n')}`
  );
}
