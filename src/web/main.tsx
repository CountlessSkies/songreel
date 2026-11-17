import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '@astryxdesign/theme-butter/theme.css';
import '@astryxdesign/theme-y2k/theme.css';
import '@astryxdesign/theme-matcha/theme.css';
import '@astryxdesign/theme-chocolate/theme.css';
import '@astryxdesign/theme-stone/theme.css';
import '@astryxdesign/theme-gothic/theme.css';
import './app.css';

import {StrictMode, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Selector} from '@astryxdesign/core/Selector';
import viVN from '@astryxdesign/core/locales/vi-VN.generated.js';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {butterTheme} from '@astryxdesign/theme-butter/built';
import {y2kTheme} from '@astryxdesign/theme-y2k/built';
import {matchaTheme} from '@astryxdesign/theme-matcha/built';
import {chocolateTheme} from '@astryxdesign/theme-chocolate/built';
import {stoneTheme} from '@astryxdesign/theme-stone/built';
import {gothicTheme} from '@astryxdesign/theme-gothic/built';
import {App} from './App';

const THEMES = {
  butter: {label: 'Butter (vàng bơ)', theme: butterTheme, mode: 'light'},
  y2k: {label: 'Y2K (pastel)', theme: y2kTheme, mode: 'light'},
  matcha: {label: 'Matcha (xanh lá)', theme: matchaTheme, mode: 'light'},
  chocolate: {label: 'Chocolate (nâu ấm)', theme: chocolateTheme, mode: 'light'},
  stone: {label: 'Stone (đá ấm)', theme: stoneTheme, mode: 'light'},
  neutral: {label: 'Neutral (trắng đen)', theme: neutralTheme, mode: 'light'},
  gothic: {label: 'Gothic (tối)', theme: gothicTheme, mode: 'dark'},
} as const;
type ThemeKey = keyof typeof THEMES;

const readTheme = (): ThemeKey => {
  const q = new URLSearchParams(location.search).get('theme');
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('songreel_theme');
  } catch {
    /* private mode */
  }
  const k = (q ?? saved ?? 'butter') as ThemeKey;
  return k in THEMES ? k : 'butter';
};

function Root() {
  const [key, setKey] = useState<ThemeKey>(readTheme);
  const choose = (k: string) => {
    setKey(k as ThemeKey);
    try {
      localStorage.setItem('songreel_theme', k);
    } catch {
      /* ignore */
    }
  };
  return (
    <InternationalizationProvider locale="vi-VN" messages={{'vi-VN': viVN}}>
      <Theme theme={THEMES[key].theme} mode={THEMES[key].mode}>
        <App />
        {/* Khach tu chon giao dien */}
        <div className="theme-switcher">
          <Selector
            label="Giao diện"
            isLabelHidden
            size="sm"
            options={Object.entries(THEMES).map(([value, t]) => ({value, label: `🎨 ${t.label}`}))}
            value={key}
            onChange={choose}
          />
        </div>
      </Theme>
    </InternationalizationProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
