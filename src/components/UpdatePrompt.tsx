import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function UpdatePrompt() {
  const [error, setError] = useState('');
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return <aside className="update-prompt" aria-label="Atualização disponível">
    <p>Uma nova versão do Candeia está disponível. Seus rascunhos serão mantidos nesta aba.</p>
    {error && <p role="alert">{error}</p>}
    <div><button className="button button-primary" onClick={() => void updateServiceWorker(true).catch(() => setError('Não foi possível atualizar agora. Tente novamente.'))}>Atualizar agora</button><button className="button button-secondary" onClick={() => setNeedRefresh(false)}>Depois</button></div>
  </aside>;
}
