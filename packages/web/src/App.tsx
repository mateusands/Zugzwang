import { BoardPlaceholder } from './components/BoardPlaceholder.js';

export function App() {
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Zugzwang</h1>
        <p className="app__tagline">Xadrez contra o bot — em construção.</p>
      </header>

      <BoardPlaceholder />

      <footer className="app__footer">
        <span className="app__badge">Fase 1 — estrutura inicial</span>
      </footer>
    </main>
  );
}
