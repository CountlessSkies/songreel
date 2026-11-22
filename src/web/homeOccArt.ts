// Occasion scenes for the home page grid, ported verbatim from ref/solsongs-v1.6.1.html.
// Each scene has three layers, far (L1), middle (L2) and near (L3), which home.css shifts for parallax on hover.
/* eslint-disable */
const sky = (id: string, a: string, b: string, c: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
const glow = (id: string, col: string) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${col}" stop-opacity=".9"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
const stars = (n: number, seed: number, col = '#fff') => {
  let s = '', r = seed;
  for (let i = 0; i < n; i++) {
    r = (r * 9301 + 49297) % 233280; const x = r / 233280 * 320;
    r = (r * 9301 + 49297) % 233280; const y = r / 233280 * 130;
    s += `<circle class="tw" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i % 3 ? 0.9 : 1.5}" fill="${col}" style="animation-delay:${(i * .37 % 3).toFixed(2)}s"/>`;
  }
  return s;
};
const conf = (n: number, seed: number, cols: string[]) => {
  let s = '', r = seed;
  for (let i = 0; i < n; i++) {
    r = (r * 9301 + 49297) % 233280; const x = r / 233280 * 320; const c = cols[i % cols.length];
    s += `<rect class="fall" x="${x.toFixed(0)}" y="-10" width="5" height="9" rx="1.5" fill="${c}" style="animation-duration:${(4 + i % 5 * .8).toFixed(1)}s;animation-delay:-${(i * .7 % 5).toFixed(1)}s"/>`;
  }
  return s;
};
const petals = (n: number, seed: number, col: string) => {
  let s = '', r = seed;
  for (let i = 0; i < n; i++) {
    r = (r * 9301 + 49297) % 233280; const x = r / 233280 * 320;
    s += `<ellipse class="fall sway" cx="${x.toFixed(0)}" cy="-8" rx="5" ry="3.2" fill="${col}" style="animation-duration:${(6 + i % 4).toFixed(1)}s;animation-delay:-${(i * 1.1 % 6).toFixed(1)}s"/>`;
  }
  return s;
};
const heart = (x: number, y: number, s: number, col: string) =>
  `<path d="M${x} ${y + s * .3}c0-${s * .35} ${s * .45}-${s * .55} ${s * .5}-${s * .1}c${s * .05}-${s * .45} ${s * .5}-${s * .25} ${s * .5} ${s * .1}c0 ${s * .4}-${s * .5} ${s * .6}-${s * .5} ${s * .85}c0-${s * .25}-${s * .5}-${s * .45}-${s * .5}-${s * .85}z" fill="${col}"/>`;
const flame = (x: number, y: number, d = 0) =>
  `<g class="flick" style="transform-origin:${x}px ${y + 8}px;animation-delay:${d}s"><ellipse cx="${x}" cy="${y}" rx="5" ry="9" fill="#FFC63D"/><ellipse cx="${x}" cy="${y + 2}" rx="2.4" ry="5" fill="#fff6d8"/></g><circle cx="${x}" cy="${y}" r="16" fill="url(#gl)" class="breathe"/>`;

const SCENES: Record<string, () => string> = {
 sinh_nhat:()=>`<defs>${sky("sk","#2a1838","#5a2a3e","#a5482f")}${glow("gl","#FFC63D")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1">${stars(18,7,"#ffe2b8")}<circle cx="60" cy="70" r="40" fill="url(#gl)" opacity=".35" class="breathe"/><circle cx="270" cy="50" r="30" fill="url(#gl)" opacity=".3" class="breathe"/></g>
  <g class="L2"><rect x="0" y="182" width="320" height="58" fill="#2b1a2e"/><rect x="95" y="128" width="130" height="58" rx="10" fill="#f6e6d0"/><rect x="95" y="128" width="130" height="16" rx="8" fill="#F0506E"/>
   <path d="M95 150q16 10 32 0t33 0 33 0 32 0" stroke="#fff" stroke-width="4" fill="none" opacity=".8"/><rect x="85" y="182" width="150" height="8" rx="4" fill="#e9d2b6"/>
   <rect x="128" y="104" width="6" height="26" rx="2" fill="#7A5AF8"/><rect x="157" y="98" width="6" height="32" rx="2" fill="#FFC63D"/><rect x="186" y="104" width="6" height="26" rx="2" fill="#F0506E"/>
   ${flame(131,94,0)}${flame(160,88,.3)}${flame(189,94,.6)}</g>
  <g class="L3">${conf(16,3,["#FFC63D","#F0506E","#7A5AF8","#7ad7c9"])}</g>`,
 ky_niem:()=>`<defs>${sky("sk","#ffb36b","#f07a6a","#6b2f57")}${glow("gl","#fff1c2")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1"><circle cx="160" cy="150" r="70" fill="url(#gl)" class="breathe"/><circle cx="160" cy="152" r="34" fill="#ffe7b0"/></g>
  <g class="L2"><path d="M0 170q80-30 160-6t160-10v86H0z" fill="#8a3a52"/><path d="M0 195q90-24 170 0t150-6v51H0z" fill="#5a2442"/>
   <g fill="#2B1E3F"><circle cx="146" cy="150" r="7"/><path d="M139 158h14l3 32h-20z"/><circle cx="174" cy="148" r="7"/><path d="M167 156h14l2 34h-18z"/><path d="M152 168h16" stroke="#2B1E3F" stroke-width="4"/></g></g>
  <g class="L3"><g class="rise">${heart(60,200,18,"#F0506E")}</g><g class="rise" style="animation-delay:-2s">${heart(250,210,14,"#ffd1dc")}</g><g class="rise" style="animation-delay:-4s">${heart(110,215,10,"#ff8fab")}</g></g>`,
 ngay_cua_me:()=>`<defs>${sky("sk","#fde9d0","#f7c9a6","#f2a38a")}${glow("gl","#fff7dc")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1"><circle cx="250" cy="60" r="60" fill="url(#gl)" class="breathe"/><g class="rays" style="transform-origin:250px 60px">${Array.from({length:12},(_,i)=>`<rect x="248" y="-10" width="4" height="40" fill="#fff4d6" opacity=".5" transform="rotate(${i*30} 250 60)"/>`).join("")}</g></g>
  <g class="L2"><path d="M0 200q160-30 320 0v40H0z" fill="#9cbf7a"/>${[60,110,160,210,260].map((x,i)=>`<g class="sway2" style="transform-origin:${x}px 230px;animation-delay:-${i*.6}s"><path d="M${x} 230q-4-40 0-70" stroke="#5f8f48" stroke-width="4" fill="none"/><path d="M${x} 205q-18-8-22-24q18 4 22 24z" fill="#6fa356"/>
   <path d="M${x-12} 160q0-22 12-26q12 4 12 26q-6 8-12 8t-12-8z" fill="${["#F0506E","#ff8fab","#FFC63D","#f26d5b","#e0457b"][i]}"/><path d="M${x} 134q-6 14 0 34q6-20 0-34z" fill="#fff" opacity=".25"/></g>`).join("")}</g>
  <g class="L3">${petals(6,11,"#ffb3c6")}</g>`,
 cam_on_bo:()=>`<defs>${sky("sk","#1d2a4f","#c4664a","#f3b26a")}${glow("gl","#ffd28a")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1"><circle cx="230" cy="170" r="80" fill="url(#gl)" class="breathe"/><circle cx="230" cy="172" r="30" fill="#ffd98f"/>${stars(8,5)}</g>
  <g class="L2"><path d="M0 182h320v58H0z" fill="#3a2030"/><path d="M0 182h320" stroke="#e8a86a" stroke-width="2" opacity=".6"/>
   <g class="ride"><g stroke="#2B1E3F" stroke-width="4" fill="none"><circle class="wheel" cx="120" cy="170" r="16"/><circle class="wheel" cx="172" cy="170" r="16"/><path d="M120 170l18-26h24l10 26M138 144l12 26 22-26M134 138h10"/></g>
    <g fill="#2B1E3F"><circle cx="150" cy="104" r="8"/><path d="M144 112h12l8 30h-20z"/><circle cx="168" cy="118" r="6"/><path d="M163 124h10l4 20h-14z"/></g></g></g>
  <g class="L3"><path d="M0 240h320v-14q-80 6-160-2t-160 4z" fill="#22131f"/></g>`,
 tinh_yeu:()=>`<defs>${sky("sk","#2a0f2a","#5c1636","#8a2a3a")}${glow("gl","#F0506E")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1"><circle cx="160" cy="110" r="90" fill="url(#gl)" opacity=".55" class="breathe"/>${stars(10,9,"#ffc2d1")}</g>
  <g class="L2"><path d="M160 230q-6-60 4-100" stroke="#2f6b3a" stroke-width="5" fill="none"/><path d="M162 190q22-14 30-34q-24 6-30 34z" fill="#3f8a4c"/>
   <g class="breathe2" style="transform-origin:164px 110px"><path d="M164 70q34 6 30 40q-6 26-30 28q-24-2-30-28q-4-34 30-40z" fill="#c81d4a"/><path d="M164 78q22 8 18 32q-6 16-18 18q-12-2-18-18q-4-24 18-32z" fill="#e8355f"/><path d="M164 88q12 8 8 20q-4 8-8 8t-8-8q-4-12 8-20z" fill="#ff6b8b"/></g></g>
  <g class="L3">${petals(9,21,"#e8355f")}</g>`,
 dam_cuoi:()=>`<defs>${sky("sk","#fdf3e6","#f7dcc4","#e9b9a2")}${glow("gl","#fff")}<linearGradient id="gd" x1="0" x2="1"><stop offset="0" stop-color="#ffd36b"/><stop offset=".5" stop-color="#fff2c2"/><stop offset="1" stop-color="#d99a2b"/></linearGradient></defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1"><path d="M40 240V120q120-120 240 0v120" stroke="#f3cfc0" stroke-width="16" fill="none"/>${Array.from({length:9},(_,i)=>{const a=Math.PI*(1-i/8);return`<circle cx="${160+120*Math.cos(a)}" cy="${120-120*Math.sin(a)+0}" r="9" fill="${i%2?"#ffb3c6":"#fff"}"/>`;}).join("")}</g>
  <g class="L2"><g class="spinY" style="transform-origin:145px 140px"><ellipse cx="145" cy="140" rx="30" ry="30" stroke="url(#gd)" stroke-width="9" fill="none"/></g><g class="spinY" style="transform-origin:180px 140px;animation-delay:-1.5s"><ellipse cx="180" cy="140" rx="30" ry="30" stroke="url(#gd)" stroke-width="9" fill="none"/><path d="M180 104l-8-10h16z" fill="#bfe9ff"/></g></g>
  <g class="L3">${Array.from({length:8},(_,i)=>`<path class="tw" d="M${30+i*38} ${40+(i%3)*50}l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff" style="animation-delay:${i*.4}s"/>`).join("")}</g>`,
 tuong_nho:()=>`<defs>${sky("sk","#0b1022","#1b2142","#2b2a4a")}${glow("gl","#FFC63D")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1">${stars(34,13)}<circle cx="250" cy="50" r="18" fill="#f5efd8"/><circle cx="258" cy="45" r="16" fill="#1b2142"/><path class="shoot" d="M40 40l40 14" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>
  <g class="L2"><rect x="0" y="190" width="320" height="50" fill="#141832"/><rect x="146" y="140" width="28" height="56" rx="4" fill="#f4ead6"/><rect x="146" y="140" width="28" height="8" rx="3" fill="#e2d4b8"/>
   <path d="M160 140v-8" stroke="#3a3a3a" stroke-width="2"/>${flame(160,122,0)}<circle cx="160" cy="130" r="60" fill="url(#gl)" opacity=".35" class="breathe"/></g>
  <g class="L3"><circle class="float" cx="90" cy="200" r="3" fill="#ffe2a0"/><circle class="float" cx="230" cy="210" r="2.4" fill="#ffe2a0" style="animation-delay:-2s"/><circle class="float" cx="200" cy="205" r="2" fill="#ffe2a0" style="animation-delay:-3.5s"/></g>`,
 tot_nghiep:()=>`<defs>${sky("sk","#6fb6e8","#a8d6f0","#f4e7c4")}${glow("gl","#fff")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1"><g class="drift"><ellipse cx="70" cy="60" rx="34" ry="12" fill="#fff" opacity=".85"/><ellipse cx="92" cy="54" rx="22" ry="12" fill="#fff" opacity=".85"/></g><g class="drift" style="animation-delay:-8s"><ellipse cx="240" cy="40" rx="30" ry="10" fill="#fff" opacity=".8"/></g></g>
  <g class="L2"><path d="M0 196q160-26 320 0v44H0z" fill="#7fb069"/>${[100,165,230].map((x,i)=>`<g class="toss" style="animation-delay:-${i*.9}s;transform-origin:${x}px 150px"><path d="M${x-26} 150l26-12 26 12-26 12z" fill="#1d2440"/><path d="M${x-14} 156v10q14 8 28 0v-10" fill="#2b3358"/><path d="M${x+18} 150v16" stroke="#FFC63D" stroke-width="2.5"/><circle cx="${x+18}" cy="168" r="3" fill="#FFC63D"/></g>`).join("")}</g>
  <g class="L3">${conf(12,17,["#FFC63D","#F0506E","#fff","#7A5AF8"])}</g>`,
 cam_on:()=>`<defs>${sky("sk","#fff3d6","#ffd9a0","#f2a86a")}${glow("gl","#fff7e0")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1"><circle cx="160" cy="100" r="100" fill="url(#gl)" class="breathe"/></g>
  <g class="L2"><g class="bob"><rect x="104" y="112" width="112" height="76" rx="6" fill="#fffaf0" stroke="#e3c79c" stroke-width="2"/><path d="M104 118l56 40 56-40" stroke="#e3c79c" stroke-width="2" fill="none"/>
   <path d="M120 176h40M120 168h60" stroke="#e8d6b8" stroke-width="3" stroke-linecap="round"/><circle cx="196" cy="170" r="8" fill="#c8434f"/></g></g>
  <g class="L3"><g class="rise">${heart(150,150,22,"#F0506E")}</g><g class="rise" style="animation-delay:-2.4s">${heart(205,150,13,"#ff8fab")}</g><g class="rise" style="animation-delay:-1.2s">${heart(110,160,11,"#FFC63D")}</g></g>`,
 yeu_xa:()=>`<defs>${sky("sk","#0f1840","#2b3a7a","#7a5aa8")}${glow("gl","#bcd3ff")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1">${stars(26,31)}<circle cx="260" cy="56" r="16" fill="#eef3ff"/><circle cx="260" cy="56" r="40" fill="url(#gl)" opacity=".4"/></g>
  <g class="L2"><path d="M40 190Q160 60 280 190" stroke="#ffd1dc" stroke-width="2.5" stroke-dasharray="6 7" fill="none" class="dash"/><circle cx="40" cy="190" r="6" fill="#FFC63D"/><circle cx="280" cy="190" r="6" fill="#F0506E"/>
   <circle cx="40" cy="190" r="14" fill="none" stroke="#FFC63D" class="ping"/><circle cx="280" cy="190" r="14" fill="none" stroke="#F0506E" class="ping" style="animation-delay:-1s"/>
   <g class="fly"><path d="M-12 0l24-3 8-10 4 0-4 11 10-1 4-5 3 0-2 6 2 6-3 0-4-5-10-1 4 11-4 0-8-10-24-3z" fill="#fff"/></g></g>
  <g class="L3"><path d="M0 240h320v-30q-60-14-120 4t-200-4z" fill="#141a3a"/></g>`,
 xin_loi:()=>`<defs>${sky("sk","#8aa4bf","#c9d6e2","#f3e3cf")}${glow("gl","#fff6d0")}<linearGradient id="rb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#F0506E"/><stop offset=".33" stop-color="#FFC63D"/><stop offset=".66" stop-color="#7ad7a9"/><stop offset="1" stop-color="#7A5AF8"/></linearGradient></defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1"><circle cx="220" cy="90" r="60" fill="url(#gl)" class="breathe"/><circle cx="220" cy="92" r="24" fill="#fff0b8"/><path class="bow" d="M40 220a120 120 0 0 1 240 0" stroke="url(#rb)" stroke-width="14" fill="none" opacity=".75"/></g>
  <g class="L2"><g class="drift"><ellipse cx="120" cy="80" rx="46" ry="20" fill="#9aa9bb"/><ellipse cx="150" cy="70" rx="30" ry="20" fill="#aab7c6"/><ellipse cx="95" cy="76" rx="24" ry="16" fill="#aab7c6"/></g>
   ${Array.from({length:10},(_,i)=>`<path class="rain" d="M${88+i*8} 98l-3 10" stroke="#6d86a8" stroke-width="2" stroke-linecap="round" style="animation-delay:-${(i*.17).toFixed(2)}s"/>`).join("")}</g>
  <g class="L3"><path d="M0 240h320v-26q-160-20-320 0z" fill="#b8c9a4"/></g>`,
 tet:()=>`<defs>${sky("sk","#3a0c12","#7a1620","#c2412a")}${glow("gl","#ffb347")}</defs><rect width="320" height="240" fill="url(#sk)"/>
  <g class="L1">${[70,240].map((x,i)=>`<g class="burst" style="transform-origin:${x}px ${50+i*10}px;animation-delay:-${i*1.3}s">${Array.from({length:12},(_,k)=>`<path d="M${x} ${50+i*10}l0 -26" stroke="${i?"#FFC63D":"#ff8fab"}" stroke-width="2.4" stroke-linecap="round" transform="rotate(${k*30} ${x} ${50+i*10})"/>`).join("")}</g>`).join("")}</g>
  <g class="L2"><path d="M0 30q60 30 120 20t120 10 80-6" stroke="#5a2a1a" stroke-width="5" fill="none"/>${[[60,50],[160,56],[255,52]].map(([x,y],i)=>`<g class="swing" style="transform-origin:${x}px ${y}px;animation-delay:-${i*.7}s"><path d="M${x} ${y}v14" stroke="#FFC63D" stroke-width="2"/><ellipse cx="${x}" cy="${y+38}" rx="22" ry="25" fill="#e0262e"/>
   <path d="M${x-22} ${y+38}h44M${x} ${y+13}v50" stroke="#b81a22" stroke-width="2"/><rect x="${x-9}" y="${y+11}" width="18" height="5" rx="2" fill="#FFC63D"/><rect x="${x-9}" y="${y+61}" width="18" height="5" rx="2" fill="#FFC63D"/><path d="M${x} ${y+66}v14" stroke="#FFC63D" stroke-width="2"/><circle cx="${x}" cy="${y+38}" r="30" fill="url(#gl)" opacity=".35"/></g>`).join("")}</g>
  <g class="L3"><path d="M0 240q40-60 90-70" stroke="#3a1a14" stroke-width="5" fill="none"/>${[[30,214],[52,196],[74,182],[40,200]].map(([x,y])=>`<g fill="#ffb7c9"><circle cx="${x}" cy="${y}" r="6"/><circle cx="${x+5}" cy="${y-5}" r="5"/><circle cx="${x-5}" cy="${y-4}" r="5"/></g>`).join("")}${petals(7,41,"#ffc2d1")}</g>`};

const cache = new Map<string, string>();

/** Inner SVG markup (viewBox 0 0 320 240) for one occasion scene, with ids made unique per scene. */
export function occArt(key: string): string {
  let svg = cache.get(key);
  if (svg === undefined) {
    svg = SCENES[key]()
      .replace(/id="(\w+)"/g, (_, i) => `id="${key}-${i}"`)
      .replace(/url\(#(\w+)\)/g, (_, i) => `url(#${key}-${i})`);
    cache.set(key, svg);
  }
  return svg;
}
