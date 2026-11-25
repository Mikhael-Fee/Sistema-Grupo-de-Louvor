import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push-notifications';
import { FormError } from './ui';
import './presence.css';

const HINTS: Record<PushState, string> = {
  on: 'Este aparelho avisa quando você for escalado(a).',
  off: 'Receba um aviso neste aparelho quando você for escalado(a). Os avisos também chegam por e-mail.',
  blocked: 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador e volte aqui.',
  'ios-install': 'No iPhone, os avisos só chegam com o Candeia instalado: toque em Compartilhar e depois em "Adicionar à Tela de Início". Abra o Candeia pelo ícone e volte aqui.',
  unsupported: 'Este navegador não recebe notificações. Os avisos de escala continuam chegando por e-mail.',
};

/** Turns scale notices on or off for this device only. */
export default function NotificationsCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; void pushState().then(value => { if (active) setState(value); }).catch(() => { if (active) setState('unsupported'); }); return () => { active = false; }; }, []);
  if (!state) return null;
  async function toggle() {
    setWorking(true); setError(null);
    try { if (state === 'on') await disablePush(); else await enablePush(); setState(await pushState()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível mudar as notificações.'); setState(await pushState().catch(() => 'unsupported' as const)); }
    finally { setWorking(false); }
  }
  return <section className="card unavailability-card notifications-card" aria-labelledby="notifications-title">
    <h2 id="notifications-title">{state === 'on' ? <Bell size={19} /> : <BellOff size={19} />} Avisos de escala neste aparelho</h2>
    <p className="muted">{HINTS[state]}</p>
    {(state === 'on' || state === 'off') && <button type="button" className={`button ${state === 'on' ? 'button-secondary' : 'button-primary'}`} disabled={working} onClick={() => void toggle()}>{working ? 'Aguarde…' : state === 'on' ? 'Desativar neste aparelho' : 'Ativar notificações'}</button>}
    <FormError error={error} />
  </section>;
}
