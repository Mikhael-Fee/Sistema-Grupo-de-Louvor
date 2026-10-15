import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useMinistry } from '../context/MinistryContext';
import { createAppUpdater, updateBlocker, type AppUpdateState } from '../lib/pwa-update';

export default function UpdatePrompt() {
  const { busy } = useMinistry();
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const location = useLocation();
  const updater = useRef<ReturnType<typeof createAppUpdater> | null>(null);
  const [state, setState] = useState<AppUpdateState>({ phase: 'idle' });
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    const current = createAppUpdater({ window, serviceWorker: navigator.serviceWorker,
      blocker: () => updateBlocker(document, busyRef.current), onState: setState });
    updater.current = current;
    void current.start();
    return () => { current.stop(); if (updater.current === current) updater.current = null; };
  }, []);
  useEffect(() => { void updater.current?.check(); }, [location.pathname, location.search]);
  if (state.phase === 'idle') return null;
  const blocked = Boolean(state.blocker);
  const notice = <aside className="update-prompt" aria-label="Atualização disponível" role="status" aria-live="polite">
    <p><strong>Nova versão do Candeia</strong><br />{state.phase === 'reloading' ? 'Atualizando… Seus rascunhos serão mantidos nesta aba.'
      : state.blocker === 'photo' ? 'Salve ou desfaça a alteração da foto. Depois, o aplicativo atualizará automaticamente.'
      : state.blocker === 'operation' ? 'Aguardando a operação em andamento terminar para atualizar automaticamente.'
      : state.blocker === 'credentials' ? 'Conclua seu acesso ou cadastro. Depois, o aplicativo atualizará automaticamente.'
      : blocked ? 'Conclua ou feche a edição para atualizar automaticamente. Seus rascunhos serão mantidos nesta aba.'
      : 'Atualizando automaticamente em instantes. Seus rascunhos serão mantidos nesta aba.'}</p>
    {state.phase === 'error' && <><p role="alert">Não foi possível atualizar. Confira sua conexão e tente novamente.</p><button className="button button-primary" onClick={() => updater.current?.retry()}>Tentar atualização novamente</button></>}
  </aside>;
  // Native modal dialogs occupy the top layer. Keep the notice visible there
  // while safely waiting for an editor to finish, without closing that editor.
  const dialog = document.querySelector('dialog[open]');
  return dialog ? createPortal(notice, dialog) : notice;
}
