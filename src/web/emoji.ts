// Emoji cho tung lua chon, chi dung o giao dien.
export const EMOJI: Record<string, string> = {
  // nguoi nhan
  chong: '🤵', vo: '👰', nguoi_yeu_nu: '💕', nguoi_yeu_nam: '💙', con_trai: '👦', con_gai: '👧',
  bo: '👨', me: '👩', ong_ba: '👵', chau: '🧒', anh_chi_em: '👫', ban_than: '🤝', thay_co: '🍎',
  ban_than_minh: '🌟', khac: '🎁',
  // dip
  sinh_nhat: '🎂', ky_niem: '💍', dam_cuoi: '💒', ngay_cua_me: '💐', tet: '🧧', cam_on: '🙏',
  xin_loi: '🥺', tot_nghiep: '🎓', yeu_xa: '✈️', tuong_nho: '🕯️', khong_ly_do: '😊',
  // the loai
  ballad: '🎹', pop: '🎤', acoustic: '🎸', indie: '🌙', lofi: '☕', rnb: '🎷', edm: '🎧',
  bolero: '🌹', rap: '🧢', kids: '🧸', dan_ca: '🎋', lullaby: '🌛',
  // giong
  female: '👩‍🎤', male: '👨‍🎤', duet: '👫', auto: '✨',
  // nhip do
  cham: '🐢', vua: '🚶', nhanh: '🏃',
  // cam xuc
  cam_dong: '🥹', vui_tuoi: '😄', lang_man: '💖', hoai_niem: '📼', binh_yen: '🍃',
  // thap nien
  '1990s': '📻', '2000s': '💿', '2010s': '📱', '2020s': '🚀',
  // nhac cu (auto da co o tren)
  piano: '🎹', guitar: '🎸', strings: '🎻', dan_tranh: '🪕',
};

export const withEmoji = (value: string, label: string) =>
  EMOJI[value] ? `${EMOJI[value]} ${label}` : label;
