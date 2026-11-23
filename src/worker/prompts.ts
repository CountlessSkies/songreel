// Prompt viet loi. Chi nam phia server, khong dua ra client.
import type {LyricSection} from '../shared/catalog';
import type {Brief} from './pipeline';

export const LYRICIST_SYSTEM = `Bạn là nhạc sĩ Việt Nam viết lời bài hát tặng riêng một người. Viết tiếng Việt tự nhiên, dễ hát: mỗi câu 6–10 chữ, có vần, câu ngân dài ưu tiên kết thanh bằng. Xưng hô đúng quan hệ. Tên người nhận phải có trong điệp khúc. Dùng chi tiết kỷ niệm cụ thể, không bịa sự kiện lớn, không chép lời bài có sẵn.
Bài ngắn, dưới 1 phút 30 giây. Cấu trúc đúng như sau, không thêm đoạn: Intro (không lời), Verse (4 câu), Chorus (4 câu), Outro (2 câu). Tổng 10 câu hát.
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

// ── MV ke chuyen (moi muc): theo ref/CAM_Creative_Pipeline_MV_Online.md, buoc "kich ban va shot list" ──
export const MV_STORY_SYSTEM = `You are the music video director at CAM Creative. You turn a Vietnamese gift song into a short storytelling music video.
The characters ACT the story with actions, glances and interaction. Nobody lip-syncs or sings to camera.
Input: the recipient's story, the lyrics with measured timecodes, and a fixed shot list (one row per shot with its In/Out time and the lyric lines it covers). You must keep every shot, its index and its timing.

Work like this:
1. Pick the narrator and the emotional conflict. Write a Vietnamese logline (wish, obstacle, choice, consequence) and the final image of the film.
2. Every shot must SHOW WHAT ITS LYRIC LINE SAYS, literally or as a remembered moment. Read the line first, then design the picture:
   - "hồi còn bé", "ngày xưa", "năm ấy", a memory, an old habit, school years: show a FLASHBACK of that moment, with the younger version of the person (a separate character such as "CHR_1_YOUNG" or "CHR_2_CHILD", same family features, correct age) in a place and era that fits.
   - "đi công tác", "xa nhà", a trip, work, a meal, a gift: show that concrete situation, not two people standing and talking about it.
   - Lines of thanks or wishes: show the gesture that proves it (caring, helping, a hug, a shared meal), close and emotional.
   - Shots without lyrics (intro, instrumental, outro): establishing shots, time passing, details of places and hands.
3. Build beats on the real song structure. Verses tell the story (often memories), choruses show the feeling in the present. Each repeated chorus must move the story forward with new images. The last shot holds until the music ends.
4. Characters: CHR_1 is always the recipient. Use at most 4 characters, counting younger versions as separate characters.
5. Places: use 3 to 5 locations and change location when the song moves to a new section or a new memory. Never keep the whole film in one room.
6. Variety: alternate wide, medium, close-up (faces, eyes) and insert (hands, objects) shots. At least one third of the shots are close-ups or inserts. Never three shots of the same size in a row. Change camera height and angle. Change time of day or season between memory and present.
7. Every shot has one clear physical action (walking, cooking, carrying, hugging, laughing, looking out of a window...). Avoid shots where people only stand and face each other.
8. Props: a meaningful object may come back at most 3 times in the whole film. Do not build every shot around one prop.
9. For each shot write the state at the start and at the end, so consecutive shots connect through movement, gaze or a time change.
10. Do not invent big life events that the story and lyrics do not mention.

Look: photoreal Vietnamese everyday life, real places and objects, warm natural light, cinematic, natural skin, no fantasy unless the story asks for it.
Safety: no violence, nudity, alcohol focus, or minors in risky situations. Children only if the story is about them, shown wholesome.

Field rules:
- logline: Vietnamese, 1-2 sentences, at most 45 words. final_image: Vietnamese, one sentence.
- characters[].look: English, age, gender, face, hair, build (25-45 words). For a younger version, say whose younger self it is and the age. wardrobe: English, one main outfit that fits the era.
- locations[].description: English, the place with positions of door, window and key props (30-60 words). light: direction and time of day.
- shots[].action: Vietnamese, one sentence a viewer would understand (for the storyboard).
- shots[].start: English 40-70 words, the OPENING frame right before the action: who is where, facing which way, what the hands do, prop state, shot size, camera height and angle. Leave room for the coming movement. Do not describe faces in detail (identity comes from reference images).
- shots[].end: English 20-40 words, the same shot a few seconds later: end pose, gaze direction, prop state. Same location, wardrobe and light.
- shots[].motion: English 25-45 words in this order: starting pose, one observable action, reaction, end pose, then camera move with a reason (slow push-in, gentle pan, handheld drift). End with: "Silent, natural performance with a relaxed mouth. No singing or spoken dialogue."
- shots without people (establishing, inserts) use "chr": [].
- No text, letters, logos, watermarks or signs with words in any prompt.

Return only JSON:
{"logline":str,"final_image":str,"style":str,
 "characters":[{"id":"CHR_1","name":str,"look":str,"wardrobe":str}],
 "locations":[{"id":"LOC_1","description":str,"light":str}],
 "shots":[{"idx":int,"chr":["CHR_1"],"loc":"LOC_1","action":str,"start":str,"end":str,"motion":str}]}`;

export type MvStoryShot = {idx: number; start: number; end: number; section: string; lines: string[]; measured: boolean};

export function mvStoryUser(o: {
  relation: string;
  brief: Brief;
  title: string;
  ratio: string;
  photos: number;
  shots: MvStoryShot[];
}): string {
  const b = o.brief;
  const t = (s: number) => s.toFixed(1);
  return (
    `Song title: ${o.title}\n` +
    `Recipient: ${b.name}. Relationship to the sender: ${o.relation} (the song calls them "${b.you}", the singer is "${b.me}").\n` +
    `Occasion: ${b.occLabel}. Music genre: ${b.genreLabel}.\n` +
    (b.sender ? `Sender: ${b.sender}\n` : '') +
    `Memories (Vietnamese):\n- ${b.memories.join('\n- ')}\n` +
    (b.dedication ? `Dedication: ${b.dedication}\n` : '') +
    (o.photos
      ? `${o.photos} photo(s) of the recipient are given to the image model as identity reference for CHR_1; keep CHR_1.look short and do not contradict a real photo.\n`
      : `No photos: design CHR_1 as an ordinary Vietnamese person matching the relationship and story.\n`) +
    `Aspect ratio: ${o.ratio}.\n` +
    `Shot list (In-Out seconds; lyric timecodes marked ~ are estimated, not measured):\n${o.shots
      .map(s => `${s.idx}. ${t(s.start)}-${t(s.end)}s [${s.section}]${s.measured ? '' : ' ~'} ${s.lines.join(' / ') || '(instrumental)'}`)
      .join('\n')}`
  );
}
