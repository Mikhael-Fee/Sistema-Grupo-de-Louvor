import { Component, type ReactNode } from 'react';
import { useMinistry } from '../context/MinistryContext';

function AppRecovery() {
  const { busy } = useMinistry();
  return <main className="standalone-page"><section className="card" role="alert" aria-busy={busy || undefined}>
    <h1>Não foi possível abrir esta tela</h1>
    <p>Se houver uma nova versão, o Candeia atualizará automaticamente quando as operações em andamento terminarem. Seus rascunhos continuam nesta aba.</p>
    <button className="button button-primary" disabled={busy} onClick={() => window.location.reload()}>{busy ? 'Aguardando a operação terminar…' : 'Reabrir o Candeia'}</button>
  </section></main>;
}

/** A stale lazy chunk must not unmount Auth, pending saves or the updater. */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <AppRecovery /> : this.props.children; }
}
