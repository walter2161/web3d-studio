import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';

export type Lang = 'en' | 'pt' | 'es';

// ============================================================================
// Translation dictionary.
// Keys are canonical English source strings (case-sensitive, trimmed).
// Missing keys fall back to the English source unchanged.
// ============================================================================
const dict: Record<Lang, Record<string, string>> = {
  en: {},
  pt: {
    // Top menu
    File: 'Arquivo', Edit: 'Editar', Group: 'Grupo', Views: 'Vistas',
    Create: 'Criar', Modifiers: 'Modificadores', Character: 'Personagem',
    Animation: 'Animação', 'Graph Editors': 'Editores de Curvas',
    Rendering: 'Renderização', Customize: 'Personalizar', MAXScript: 'MAXScript',
    Help: 'Ajuda', Interface: 'Interface', Language: 'Idioma',
    // File menu
    'New Scene': 'Nova Cena', Reset: 'Redefinir', 'Open...': 'Abrir...', Save: 'Salvar',
    'Save As...': 'Salvar Como...', 'Save Cloud...': 'Salvar Nuvem...', 'Open Cloud...': 'Abrir Nuvem...',
    'Export Cloud...': 'Exportar Nuvem...', 'Import Cloud...': 'Importar Nuvem...',
    'Import...': 'Importar...', 'Export...': 'Exportar...', 'Login...': 'Entrar...',
    Logout: 'Sair', 'Admin — Liberar usuário...': 'Admin — Liberar usuário...', Exit: 'Sair do App',
    // Edit menu
    Undo: 'Desfazer', Redo: 'Refazer', Hold: 'Reter', Fetch: 'Restaurar',
    Delete: 'Excluir', Clone: 'Clonar', 'Select All': 'Selecionar Tudo',
    'Select None': 'Selecionar Nada', 'Select Invert': 'Inverter Seleção',
    Region: 'Região', 'Object Properties...': 'Propriedades do Objeto...',
    // Group menu
    Ungroup: 'Desagrupar', Open: 'Abrir', Close: 'Fechar', Attach: 'Anexar',
    Detach: 'Desanexar', Explode: 'Explodir',
    // Views
    Perspective: 'Perspectiva', Top: 'Superior', Front: 'Frontal', Left: 'Esquerda',
    'Layout: Single': 'Layout: Único',
    'Layout: Quad (3 Wire + Persp)': 'Layout: Quad (3 Wire + Perspectiva)',
    'Viewport Configuration...': 'Configuração da Viewport...',
    'Show Grid': 'Mostrar Grade', 'Show Statistics': 'Mostrar Estatísticas',
    'Update During Spinner Drag': 'Atualizar Durante Arrasto do Spinner',
    // Create submenu
    'Standard Primitives': 'Primitivas Padrão', 'Extended Primitives': 'Primitivas Estendidas',
    'AEC Objects': 'Objetos AEC', 'Compound Objects': 'Objetos Compostos',
    'Particle Systems': 'Sistemas de Partículas', Lights: 'Luzes', Cameras: 'Câmeras',
    Helpers: 'Auxiliares',
    // Modifiers
    'Selection Modifiers': 'Modificadores de Seleção',
    'Parametric Deformers': 'Deformadores Paramétricos',
    'Free Form Deformers': 'Deformadores de Forma Livre',
    'Edit Poly': 'Editar Poly', 'Edit Mesh': 'Editar Mesh',
    Bend: 'Curvar', Twist: 'Torcer', Taper: 'Afunilar', Noise: 'Ruído',
    TurboSmooth: 'TurboSmooth', Shell: 'Casca',
    // Character
    'Create Character': 'Criar Personagem', 'Insert Character...': 'Inserir Personagem...',
    'Save Character...': 'Salvar Personagem...', 'Bone Tools...': 'Ferramentas de Bones...',
    'IK Solvers': 'Solvers de IK',
    // Animation
    'Set Key': 'Definir Chave', 'Auto Key': 'Auto Chave',
    'Track View': 'Track View', 'Curve Editor': 'Editor de Curvas',
    'Position Constraint': 'Restrição de Posição', 'LookAt Constraint': 'Restrição LookAt',
    'Track View - Curve Editor': 'Track View - Editor de Curvas',
    'Track View - Dope Sheet': 'Track View - Dope Sheet',
    'Schematic View': 'Vista Esquemática',
    // Rendering
    'Render...': 'Renderizar...', 'Render Setup...': 'Configuração de Render...',
    'Environment...': 'Ambiente...', 'Material Editor...': 'Editor de Materiais...',
    'Material/Map Browser...': 'Navegador de Materiais/Mapas...',
    'View Image File...': 'Ver Arquivo de Imagem...',
    // Customize
    'Customize User Interface...': 'Personalizar Interface...',
    'Load Custom UI Scheme...': 'Carregar Esquema de UI...',
    'Save Custom UI Scheme...': 'Salvar Esquema de UI...',
    'Interface: Classic': 'Interface: Clássica',
    'Interface: Flat': 'Interface: Plana',
    'Interface: Game': 'Interface: Game',
    Classic: 'Clássica', Flat: 'Plana', Game: 'Game',
    English: 'Inglês', 'Português': 'Português', 'Español': 'Espanhol',
    'Language: English': 'Idioma: Inglês',
    'Language: Português': 'Idioma: Português',
    'Language: Español': 'Idioma: Espanhol',
    'Preferences...': 'Preferências...', 'Units Setup...': 'Configurar Unidades...',
    'Grid and Snap Settings...': 'Configurações de Grade e Snap...',
    // MAXScript
    'New Script': 'Novo Script', 'Open Script...': 'Abrir Script...',
    'Run Script...': 'Executar Script...', 'MAXScript Listener': 'Listener MAXScript',
    // Help
    'User Reference': 'Referência do Usuário', 'MAXScript Reference': 'Referência MAXScript',
    Tutorials: 'Tutoriais', 'Welcome...': 'Bem-vindo...', 'About 3De...': 'Sobre 3De...',
    // Common UI
    OK: 'OK', Cancel: 'Cancelar', Apply: 'Aplicar', Yes: 'Sim', No: 'Não',
    Name: 'Nome', Color: 'Cor', Size: 'Tamanho', Position: 'Posição', Rotation: 'Rotação',
    Scale: 'Escala', Width: 'Largura', Height: 'Altura', Length: 'Comprimento',
    Radius: 'Raio', 'Radius 1': 'Raio 1', 'Radius 2': 'Raio 2', Segments: 'Segmentos',
    Sides: 'Lados', Points: 'Pontos', Type: 'Tipo', Parameters: 'Parâmetros',
    Properties: 'Propriedades', Modifiers_stack: 'Pilha de Modificadores',
    'Modifier List': 'Lista de Modificadores', 'Convert to Editable Spline': 'Converter em Editable Spline',
    'Convert to Editable Mesh': 'Converter em Editable Mesh',
    'Convert to Editable Poly': 'Converter em Editable Poly',
    Vertex: 'Vértice', Segment: 'Segmento', Spline: 'Spline', Face: 'Face', Edge: 'Aresta',
    Polygon: 'Polígono', Element: 'Elemento', Selection: 'Seleção', Rendering_r: 'Renderização',
    Interpolation: 'Interpolação', Steps: 'Passos', Optimize: 'Otimizar', Adaptive: 'Adaptativo',
    'Enable In Viewport': 'Habilitar na Viewport', 'Enable In Renderer': 'Habilitar no Render',
    Thickness: 'Espessura', 'Outer Amount': 'Quantidade Externa', 'Inner Amount': 'Quantidade Interna',
    'Straighten Corners': 'Endireitar Cantos', 'Material ID': 'ID do Material',
    Axis: 'Eixo', Direction: 'Direção', Angle: 'Ângulo', 'Upper Limit': 'Limite Superior',
    'Lower Limit': 'Limite Inferior', Amount: 'Quantidade', Bias: 'Viés',
    Frequency: 'Frequência', Seed: 'Semente', Iterations: 'Iterações',
    // Timeline / Animation
    Timeline: 'Linha do Tempo', Frame: 'Quadro', Frames: 'Quadros', Time: 'Tempo',
    Play: 'Reproduzir', Pause: 'Pausar', Stop: 'Parar', 'Go to Start': 'Ir para o Início',
    'Go to End': 'Ir para o Fim', 'Previous Frame': 'Quadro Anterior', 'Next Frame': 'Próximo Quadro',
    'Auto Key mode': 'Modo Auto Key', 'Set Key mode': 'Modo Set Key',
    'Bake clip → tracks': 'Assar clipe → tracks', 'Dope Sheet': 'Dope Sheet',
    'Add Key': 'Adicionar Chave', 'Delete Key': 'Excluir Chave',
    // Toolbars / common
    Move: 'Mover', Rotate: 'Rotacionar', Wireframe: 'Wireframe', Solid: 'Sólido',
    Shaded: 'Sombreado', Transparent: 'Transparente', 'Smooth + Highlights': 'Suave + Realces',
    Grid: 'Grade', Snap: 'Snap', 'Angle Snap': 'Snap de Ângulo', 'Percent Snap': 'Snap de Percentual',
    'Spinner Snap': 'Snap de Spinner',
    // Print3D
    'Print3D Toolkit': 'Print3D Toolkit', 'Print Bed': 'Mesa de Impressão',
    Printer: 'Impressora', 'Build Volume': 'Volume de Impressão',
    // Panels
    Command: 'Comando', 'Command Panel': 'Painel de Comandos', Hierarchy: 'Hierarquia',
    Motion: 'Movimento', Display: 'Exibição', Utilities: 'Utilitários',
    // Object types
    Box: 'Caixa', Sphere: 'Esfera', Cylinder: 'Cilindro', Cone: 'Cone', Torus: 'Torus',
    Plane: 'Plano', Pyramid: 'Pirâmide', Teapot: 'Bule', Tube: 'Tubo',
    Line: 'Linha', Rectangle: 'Retângulo', Circle: 'Círculo', Ellipse: 'Elipse',
    Arc: 'Arco', Donut: 'Rosca', NGon: 'NGon', Star: 'Estrela', Helix: 'Hélice', Text: 'Texto',
    Wall: 'Parede', Camera: 'Câmera', Light: 'Luz',
  },
  es: {
    File: 'Archivo', Edit: 'Editar', Group: 'Grupo', Views: 'Vistas',
    Create: 'Crear', Modifiers: 'Modificadores', Character: 'Personaje',
    Animation: 'Animación', 'Graph Editors': 'Editores de Gráficos',
    Rendering: 'Renderizado', Customize: 'Personalizar', MAXScript: 'MAXScript',
    Help: 'Ayuda', Interface: 'Interfaz', Language: 'Idioma',
    'New Scene': 'Nueva Escena', Reset: 'Restablecer', 'Open...': 'Abrir...', Save: 'Guardar',
    'Save As...': 'Guardar Como...', 'Save Cloud...': 'Guardar Nube...', 'Open Cloud...': 'Abrir Nube...',
    'Export Cloud...': 'Exportar Nube...', 'Import Cloud...': 'Importar Nube...',
    'Import...': 'Importar...', 'Export...': 'Exportar...', 'Login...': 'Iniciar sesión...',
    Logout: 'Cerrar sesión', 'Admin — Liberar usuário...': 'Admin — Liberar usuario...', Exit: 'Salir',
    Undo: 'Deshacer', Redo: 'Rehacer', Hold: 'Retener', Fetch: 'Restaurar',
    Delete: 'Eliminar', Clone: 'Clonar', 'Select All': 'Seleccionar Todo',
    'Select None': 'Deseleccionar Todo', 'Select Invert': 'Invertir Selección',
    Region: 'Región', 'Object Properties...': 'Propiedades del Objeto...',
    Ungroup: 'Desagrupar', Open: 'Abrir', Close: 'Cerrar', Attach: 'Adjuntar',
    Detach: 'Separar', Explode: 'Explotar',
    Perspective: 'Perspectiva', Top: 'Superior', Front: 'Frontal', Left: 'Izquierda',
    'Layout: Single': 'Diseño: Único',
    'Layout: Quad (3 Wire + Persp)': 'Diseño: Cuádruple (3 Wire + Perspectiva)',
    'Viewport Configuration...': 'Configuración de Vista...',
    'Show Grid': 'Mostrar Rejilla', 'Show Statistics': 'Mostrar Estadísticas',
    'Update During Spinner Drag': 'Actualizar Durante Arrastre',
    'Standard Primitives': 'Primitivas Estándar', 'Extended Primitives': 'Primitivas Extendidas',
    'AEC Objects': 'Objetos AEC', 'Compound Objects': 'Objetos Compuestos',
    'Particle Systems': 'Sistemas de Partículas', Lights: 'Luces', Cameras: 'Cámaras',
    Helpers: 'Ayudantes',
    'Selection Modifiers': 'Modificadores de Selección',
    'Parametric Deformers': 'Deformadores Paramétricos',
    'Free Form Deformers': 'Deformadores de Forma Libre',
    'Edit Poly': 'Editar Poly', 'Edit Mesh': 'Editar Mesh',
    Bend: 'Curvar', Twist: 'Torcer', Taper: 'Estrechar', Noise: 'Ruido',
    Shell: 'Cáscara',
    'Create Character': 'Crear Personaje', 'Insert Character...': 'Insertar Personaje...',
    'Save Character...': 'Guardar Personaje...', 'Bone Tools...': 'Herramientas de Huesos...',
    'IK Solvers': 'Solvers de IK',
    'Set Key': 'Fijar Clave', 'Auto Key': 'Auto Clave',
    'Curve Editor': 'Editor de Curvas',
    'Position Constraint': 'Restricción de Posición', 'LookAt Constraint': 'Restricción LookAt',
    'Track View - Curve Editor': 'Track View - Editor de Curvas',
    'Track View - Dope Sheet': 'Track View - Dope Sheet',
    'Schematic View': 'Vista Esquemática',
    'Render...': 'Renderizar...', 'Render Setup...': 'Configuración de Render...',
    'Environment...': 'Entorno...', 'Material Editor...': 'Editor de Materiales...',
    'Material/Map Browser...': 'Navegador de Materiales/Mapas...',
    'View Image File...': 'Ver Archivo de Imagen...',
    'Customize User Interface...': 'Personalizar Interfaz...',
    'Load Custom UI Scheme...': 'Cargar Esquema de UI...',
    'Save Custom UI Scheme...': 'Guardar Esquema de UI...',
    'Interface: Classic': 'Interfaz: Clásica',
    'Interface: Flat': 'Interfaz: Plana',
    'Interface: Game': 'Interfaz: Game',
    Classic: 'Clásica', Flat: 'Plana', Game: 'Game',
    English: 'Inglés', 'Português': 'Portugués', 'Español': 'Español',
    'Language: English': 'Idioma: Inglés',
    'Language: Português': 'Idioma: Portugués',
    'Language: Español': 'Idioma: Español',
    'Preferences...': 'Preferencias...', 'Units Setup...': 'Configurar Unidades...',
    'Grid and Snap Settings...': 'Ajustes de Rejilla y Snap...',
    'New Script': 'Nuevo Script', 'Open Script...': 'Abrir Script...',
    'Run Script...': 'Ejecutar Script...', 'MAXScript Listener': 'Listener MAXScript',
    'User Reference': 'Referencia del Usuario', 'MAXScript Reference': 'Referencia MAXScript',
    Tutorials: 'Tutoriales', 'Welcome...': 'Bienvenido...', 'About 3De...': 'Acerca de 3De...',
    OK: 'OK', Cancel: 'Cancelar', Apply: 'Aplicar', Yes: 'Sí', No: 'No',
    Name: 'Nombre', Color: 'Color', Size: 'Tamaño', Position: 'Posición', Rotation: 'Rotación',
    Scale: 'Escala', Width: 'Ancho', Height: 'Altura', Length: 'Longitud',
    Radius: 'Radio', 'Radius 1': 'Radio 1', 'Radius 2': 'Radio 2', Segments: 'Segmentos',
    Sides: 'Lados', Points: 'Puntos', Type: 'Tipo', Parameters: 'Parámetros',
    Properties: 'Propiedades',
    'Modifier List': 'Lista de Modificadores',
    'Convert to Editable Spline': 'Convertir a Editable Spline',
    'Convert to Editable Mesh': 'Convertir a Editable Mesh',
    'Convert to Editable Poly': 'Convertir a Editable Poly',
    Vertex: 'Vértice', Segment: 'Segmento', Spline: 'Spline', Face: 'Cara', Edge: 'Arista',
    Polygon: 'Polígono', Element: 'Elemento', Selection: 'Selección',
    Interpolation: 'Interpolación', Steps: 'Pasos', Optimize: 'Optimizar', Adaptive: 'Adaptativo',
    'Enable In Viewport': 'Habilitar en Vista', 'Enable In Renderer': 'Habilitar en Render',
    Thickness: 'Espesor', 'Outer Amount': 'Cantidad Externa', 'Inner Amount': 'Cantidad Interna',
    'Straighten Corners': 'Enderezar Esquinas', 'Material ID': 'ID de Material',
    Axis: 'Eje', Direction: 'Dirección', Angle: 'Ángulo', 'Upper Limit': 'Límite Superior',
    'Lower Limit': 'Límite Inferior', Amount: 'Cantidad', Bias: 'Sesgo',
    Frequency: 'Frecuencia', Seed: 'Semilla', Iterations: 'Iteraciones',
    Timeline: 'Línea de Tiempo', Frame: 'Cuadro', Frames: 'Cuadros', Time: 'Tiempo',
    Play: 'Reproducir', Pause: 'Pausar', Stop: 'Detener', 'Go to Start': 'Ir al Inicio',
    'Go to End': 'Ir al Final', 'Previous Frame': 'Cuadro Anterior', 'Next Frame': 'Siguiente Cuadro',
    'Auto Key mode': 'Modo Auto Clave', 'Set Key mode': 'Modo Fijar Clave',
    'Bake clip → tracks': 'Hornear clip → tracks', 'Dope Sheet': 'Dope Sheet',
    'Add Key': 'Añadir Clave', 'Delete Key': 'Eliminar Clave',
    Move: 'Mover', Rotate: 'Rotar', Wireframe: 'Wireframe', Solid: 'Sólido',
    Shaded: 'Sombreado', Transparent: 'Transparente', 'Smooth + Highlights': 'Suave + Realces',
    Grid: 'Rejilla', Snap: 'Snap', 'Angle Snap': 'Snap de Ángulo',
    'Percent Snap': 'Snap de Porcentaje', 'Spinner Snap': 'Snap de Spinner',
    'Print3D Toolkit': 'Print3D Toolkit', 'Print Bed': 'Mesa de Impresión',
    Printer: 'Impresora', 'Build Volume': 'Volumen de Impresión',
    Command: 'Comando', 'Command Panel': 'Panel de Comandos', Hierarchy: 'Jerarquía',
    Motion: 'Movimiento', Display: 'Visualización', Utilities: 'Utilidades',
    Box: 'Caja', Sphere: 'Esfera', Cylinder: 'Cilindro', Cone: 'Cono', Torus: 'Torus',
    Plane: 'Plano', Pyramid: 'Pirámide', Teapot: 'Tetera', Tube: 'Tubo',
    Line: 'Línea', Rectangle: 'Rectángulo', Circle: 'Círculo', Ellipse: 'Elipse',
    Arc: 'Arco', Donut: 'Rosquilla', NGon: 'NGon', Star: 'Estrella', Helix: 'Hélice', Text: 'Texto',
    Wall: 'Pared', Camera: 'Cámara', Light: 'Luz',
  },
};

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (s: string) => string;
}

const LanguageCtx = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (s) => s });

// ============================================================================
// Global DOM auto-translator.
// Walks text nodes and translatable attributes (title, placeholder, aria-label,
// alt, value on button/submit) and replaces them with dictionary entries. The
// ORIGINAL English source is stashed on the node via WeakMap so switching back
// to English (or to another language) always translates from the source, not
// from an already-translated string.
// ============================================================================
const originalText = new WeakMap<Text, string>();
const originalAttr = new WeakMap<Element, Record<string, string>>();
const TRANSLATABLE_ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
// Guard: while we are writing translations, ignore mutations we cause ourselves,
// otherwise the observer would overwrite the stored English source with a
// translated string and prevent switching back.
let selfWriting = 0;

// Build a reverse map (translated string → English source) for every language,
// so if we ever encounter a node whose "original" was captured while already
// translated (e.g. before the provider mounted), we can still recover it.
const reverseMaps: Record<Lang, Record<string, string>> = { en: {}, pt: {}, es: {} };
for (const l of ['pt', 'es'] as Lang[]) {
  for (const [src, tr] of Object.entries(dict[l])) reverseMaps[l][tr] = src;
}
const recoverSource = (s: string): string => {
  const trimmed = s.trim();
  if (!trimmed) return s;
  for (const l of ['pt', 'es'] as Lang[]) {
    if (reverseMaps[l][trimmed]) return reverseMaps[l][trimmed];
  }
  return s;
};

const shouldSkip = (node: Node): boolean => {
  let el: Node | null = node;
  while (el) {
    if (el.nodeType === 1) {
      const e = el as Element;
      if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE' || e.tagName === 'CODE' || e.tagName === 'PRE') return true;
      if (e.hasAttribute('data-no-translate')) return true;
      if (e.hasAttribute('contenteditable')) return true;
    }
    el = el.parentNode;
  }
  return false;
};

const translateTextNode = (node: Text, lookup: (s: string) => string) => {
  let src = originalText.get(node);
  if (src === undefined) {
    // First time seeing this node — recover the English source in case it was
    // already rendered translated by a previous language.
    src = recoverSource(node.nodeValue ?? '');
    originalText.set(node, src);
  }
  const trimmed = src.trim();
  if (!trimmed) return;
  const translated = lookup(trimmed);
  const leading = src.match(/^\s*/)?.[0] ?? '';
  const trailing = src.match(/\s*$/)?.[0] ?? '';
  const next = translated === trimmed ? src : leading + translated + trailing;
  if (node.nodeValue !== next) {
    selfWriting++;
    node.nodeValue = next;
    selfWriting--;
  }
};

const translateAttrs = (el: Element, lookup: (s: string) => string) => {
  let bag = originalAttr.get(el);
  for (const attr of TRANSLATABLE_ATTRS) {
    if (!el.hasAttribute(attr)) continue;
    const current = el.getAttribute(attr) ?? '';
    if (!bag) { bag = {}; originalAttr.set(el, bag); }
    if (!(attr in bag)) bag[attr] = recoverSource(current);
    const src = bag[attr];
    const translated = lookup(src.trim());
    const next = translated === src.trim() ? src : translated;
    if (el.getAttribute(attr) !== next) {
      selfWriting++;
      el.setAttribute(attr, next);
      selfWriting--;
    }
  }
};


const walkAndTranslate = (root: Node, lookup: (s: string) => string) => {
  if (shouldSkip(root)) return;
  if (root.nodeType === 3) {
    translateTextNode(root as Text, lookup);
    return;
  }
  if (root.nodeType !== 1) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = walker.currentNode;
  // Include the root itself when it's an element.
  if ((root as Element).nodeType === 1) translateAttrs(root as Element, lookup);
  while ((n = walker.nextNode())) {
    if (shouldSkip(n)) continue;
    if (n.nodeType === 3) translateTextNode(n as Text, lookup);
    else if (n.nodeType === 1) translateAttrs(n as Element, lookup);
  }
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = typeof window !== 'undefined' ? (localStorage.getItem('r3-lang') as Lang | null) : null;
    return stored ?? 'en';
  });
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('r3-lang', l); } catch {}
  }, []);
  const t = useCallback((s: string) => dict[lang]?.[s] ?? s, [lang]);

  const observerRef = useRef<MutationObserver | null>(null);
  const langRef = useRef<Lang>(lang);
  langRef.current = lang;

  useEffect(() => {
    document.documentElement.lang = lang;
    const lookup = (s: string) => dict[langRef.current]?.[s] ?? s;
    // Initial full sweep.
    if (typeof document !== 'undefined') walkAndTranslate(document.body, lookup);
    // Set up mutation observer once (idempotent per-mount).
    if (!observerRef.current && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver((mutations) => {
        const currentLookup = (s: string) => dict[langRef.current]?.[s] ?? s;
        for (const m of mutations) {
          if (m.type === 'characterData' && m.target.nodeType === 3) {
            const tn = m.target as Text;
            // React just wrote to this node — treat the new value as the new source.
            originalText.set(tn, tn.nodeValue ?? '');
            translateTextNode(tn, currentLookup);
          } else if (m.type === 'childList') {
            m.addedNodes.forEach((n) => walkAndTranslate(n, currentLookup));
          } else if (m.type === 'attributes' && m.target.nodeType === 1) {
            const el = m.target as Element;
            const bag = originalAttr.get(el);
            if (bag && m.attributeName && m.attributeName in bag) {
              // React updated the attribute — refresh source.
              bag[m.attributeName] = el.getAttribute(m.attributeName) ?? '';
            }
            translateAttrs(el, currentLookup);
          }
        }
      });
      obs.observe(document.body, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: TRANSLATABLE_ATTRS,
      });
      observerRef.current = obs;
    } else if (observerRef.current) {
      // Re-sweep on language change.
      walkAndTranslate(document.body, lookup);
    }
    return () => { /* keep observer alive across renders */ };
  }, [lang]);

  useEffect(() => () => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  return <LanguageCtx.Provider value={{ lang, setLang, t }}>{children}</LanguageCtx.Provider>;
};

export const useLanguage = () => useContext(LanguageCtx);
