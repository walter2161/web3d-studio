import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type UITheme = 'classic' | 'flat' | 'game';

const STORAGE_KEY = '3de.ui.theme';

interface Ctx {
  theme: UITheme;
  setTheme: (t: UITheme) => void;
}

const UIThemeCtx = createContext<Ctx>({ theme: 'classic', setTheme: () => {} });

export const UIThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<UITheme>(() => {
    if (typeof window === 'undefined') return 'classic';
    const v = localStorage.getItem(STORAGE_KEY);
    return (v === 'flat' || v === 'game' || v === 'classic') ? v : 'classic';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  return (
    <UIThemeCtx.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </UIThemeCtx.Provider>
  );
};

export const useUITheme = () => useContext(UIThemeCtx);

export const UIThemeSelector = () => {
  const { theme, setTheme } = useUITheme();
  const opts: { id: UITheme; label: string }[] = [
    { id: 'classic', label: 'Classic' },
    { id: 'flat', label: 'Flat' },
    { id: 'game', label: 'Game' },
  ];
  return (
    <div className="flex items-center gap-[2px] pr-1">
      <span className="text-[10px] text-win-text opacity-70 mr-1">UI:</span>
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => setTheme(o.id)}
          title={`Interface ${o.label}`}
          className={`text-[10px] px-2 h-[16px] ${theme === o.id ? 'bevel-sunken' : 'bevel-raised'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};
