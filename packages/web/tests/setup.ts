// Setup da suíte do web.
//
// O Node >= 26 expõe um `localStorage` nativo experimental que só funciona com
// `--localstorage-file`. Esse global fica no `globalThis` do processo e, como o
// ambiente jsdom do Vitest usa o próprio `globalThis` como `window`, ele
// sombreia o Storage do jsdom: tanto `localStorage` quanto `window.localStorage`
// viram `undefined` — nos testes e no código de produção que roda sob eles, que
// acessa o global direto (App.tsx, useSavedGames.ts).
//
// Aqui instalamos um Storage em memória quando o global não está utilizável. Em
// Node 22/24, onde o jsdom instala o seu, isto é um no-op.

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key(index: number): string | null {
      return [...entries.keys()][index] ?? null;
    },
    getItem(key: string): string | null {
      return entries.get(String(key)) ?? null;
    },
    setItem(key: string, value: string): void {
      entries.set(String(key), String(value));
    },
    removeItem(key: string): void {
      entries.delete(String(key));
    },
    clear(): void {
      entries.clear();
    },
  };
}

function ensureStorage(name: 'localStorage' | 'sessionStorage'): void {
  const current = Reflect.get(globalThis, name) as Storage | undefined;
  if (current && typeof current.getItem === 'function') return;
  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  });
  if (globalThis.window && globalThis.window !== globalThis) {
    Object.defineProperty(globalThis.window, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');
