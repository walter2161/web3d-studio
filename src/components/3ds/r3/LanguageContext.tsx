import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

export type Lang = 'en' | 'pt' | 'es';

// Translation dictionary. Keys are the English source strings used in menus and
// common UI. Missing keys fall back to the English source.
const dict: Record<Lang, Record<string, string>> = {
  en: {},
  pt: {
    // Top-level menu labels
    File: 'Arquivo', Edit: 'Editar', Group: 'Grupo', Views: 'Vistas',
    Create: 'Criar', Modifiers: 'Modificadores', Character: 'Personagem',
    Animation: 'Animação', 'Graph Editors': 'Editores de Curvas',
    Rendering: 'Renderização', Customize: 'Personalizar', MAXScript: 'MAXScript',
    Help: 'Ajuda',
    // Customize submenu (language items)
    'Language: English': 'Idioma: Inglês',
    'Language: Português': 'Idioma: Português',
    'Language: Español': 'Idioma: Espanhol',
    'Customize User Interface...': 'Personalizar Interface...',
    'Preferences...': 'Preferências...',
    'Units Setup...': 'Configurar Unidades...',
    'Grid and Snap Settings...': 'Configurações de Grade e Snap...',
  },
  es: {
    File: 'Archivo', Edit: 'Editar', Group: 'Grupo', Views: 'Vistas',
    Create: 'Crear', Modifiers: 'Modificadores', Character: 'Personaje',
    Animation: 'Animación', 'Graph Editors': 'Editores de Gráficos',
    Rendering: 'Renderizado', Customize: 'Personalizar', MAXScript: 'MAXScript',
    Help: 'Ayuda',
    'Language: English': 'Idioma: Inglés',
    'Language: Português': 'Idioma: Portugués',
    'Language: Español': 'Idioma: Español',
    'Customize User Interface...': 'Personalizar Interfaz...',
    'Preferences...': 'Preferencias...',
    'Units Setup...': 'Configurar Unidades...',
    'Grid and Snap Settings...': 'Ajustes de Rejilla y Snap...',
  },
};

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (s: string) => string;
}

const LanguageCtx = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (s) => s });

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = typeof window !== 'undefined' ? (localStorage.getItem('r3-lang') as Lang | null) : null;
    return stored ?? 'en';
  });
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('r3-lang', l); } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = useCallback((s: string) => dict[lang]?.[s] ?? s, [lang]);
  return <LanguageCtx.Provider value={{ lang, setLang, t }}>{children}</LanguageCtx.Provider>;
};

export const useLanguage = () => useContext(LanguageCtx);
