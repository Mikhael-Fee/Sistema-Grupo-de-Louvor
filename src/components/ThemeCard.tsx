import { useState } from 'react';
import { Moon, Sun, SunMoon } from 'lucide-react';
import { readTheme, saveTheme, type ThemeChoice } from '../lib/theme';
import './presence.css';

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'auto', label: 'Automático', icon: SunMoon }, { value: 'light', label: 'Claro', icon: Sun }, { value: 'dark', label: 'Escuro', icon: Moon },
];

/** Light, dark, or follow the phone. Saved on this device only. */
export default function ThemeCard() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  return <section className="card unavailability-card theme-card" aria-labelledby="theme-title">
    <h2 id="theme-title"><Moon size={19} /> Aparência</h2>
    <p className="muted">O modo escuro cansa menos a vista no palco e em lugares com pouca luz. "Automático" segue o tema do aparelho.</p>
    <div className="theme-options" role="radiogroup" aria-label="Tema">
      {OPTIONS.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="radio" aria-checked={choice === value} className={`button ${choice === value ? 'button-primary' : 'button-secondary'}`} onClick={() => { setChoice(value); saveTheme(value); }}><Icon size={16} />{label}</button>)}
    </div>
  </section>;
}
