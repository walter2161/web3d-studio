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
    Tutorials: 'Tutoriais', 'Welcome...': 'Bem-vindo...', 'About Walt3D...': 'Sobre Walt3D...',
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
    // About / Welcome dialogs
    'About Walt3D': 'Sobre o Walt3D',
    'WEB 3D MODELER': 'MODELADOR 3D WEB',
    'web 3d modeler': 'modelador 3d web',
    'Walt3D · Web Edition': 'Walt3D · Edição Web',
    'Version 3.0.1 · Build 2026.07': 'Versão 3.0.1 · Build 2026.07',
    'Copyright © 2026 Walt3D': 'Copyright © 2026 Walt3D',
    'Real-time 3D authoring, non-destructive modifiers, animation timeline, and integrated scanline renderer — running fully in the browser via WebGL / three.js.':
      'Autoria 3D em tempo real, modificadores não-destrutivos, linha do tempo de animação e renderizador scanline integrado — rodando totalmente no navegador via WebGL / three.js.',
    'This product is licensed to:': 'Este produto está licenciado para:',
    'Local User': 'Usuário Local',
    'Welcome to Walt3D': 'Bem-vindo ao Walt3D',
    Welcome: 'Boas-vindas',
    Subscription: 'Assinatura',
    'Legal notice: Walt3D is an independent and proprietary web 3D modeler. This project has no affiliation, association or endorsement with the developers of commercial modeling software on the market. All trademarks and registered marks referenced belong to their respective owners.':
      'Aviso legal: o Walt3D é um modelador 3D web independente e proprietário. Este projeto não possui qualquer vínculo, afiliação ou endosso com os desenvolvedores de softwares de modelagem comercial do mercado. Todas as marcas e marcas registradas referenciadas pertencem aos seus respectivos proprietários.',
    'Free access (demo): the app can be used without login in demonstration mode, but with limited functionality. To unlock all tools, save scenes to the cloud, and have full access to Walt3D, an active subscription is required. See the "Subscription" tab for more details.':
      'Acesso gratuito (demo): o app pode ser utilizado sem login em modo demonstração, porém com funcionalidades limitadas. Para desbloquear todas as ferramentas, salvar cenas na nuvem e ter acesso completo ao Walt3D é necessário possuir uma assinatura ativa. Veja a aba "Assinatura" para mais detalhes.',
    'Promotional subscription: during the promotional period, the subscription costs only':
      'Assinatura promocional: durante o período promocional, a assinatura custa apenas',
    'US$ 1.00 per month': 'US$ 1,00 por mês',
    'per month': 'por mês',
    'Fill in the fields below to request your subscription — access is manually granted by the administrator after payment confirmation.':
      'Preencha os campos abaixo para solicitar sua assinatura — o acesso é liberado manualmente pelo administrador após a confirmação do pagamento.',
    'Name:': 'Nome:', 'E-mail:': 'E-mail:', 'Reason:': 'Motivo:',
    '← Back': '← Voltar',
    'Sending...': 'Enviando...',
    'Send registration request': 'Enviar pedido de registro',
    'Please enter your e-mail': 'Informe seu e-mail',
    'Request sent': 'Pedido enviado',
    'Please wait for admin approval.': 'Aguarde a liberação do administrador.',
    'Send error': 'Erro ao enviar',
    // Extended primitives / AEC / Compound / Particles
    Hedra: 'Hedra', ChamferBox: 'Caixa Chanfrada', ChamferCyl: 'Cilindro Chanfrado',
    OilTank: 'Tanque de Óleo', Spindle: 'Fuso', Gengon: 'Gengon', Prism: 'Prisma',
    'Torus Knot': 'Nó Toroidal', Capsule: 'Cápsula', 'L-Ext': 'L-Ext', 'C-Ext': 'C-Ext',
    Foliage: 'Folhagem', Railing: 'Corrimão', Stairs: 'Escadas', Door: 'Porta', Window: 'Janela',
    Boolean: 'Boolean', ProBoolean: 'ProBoolean', Loft: 'Loft', Scatter: 'Scatter',
    Connect: 'Conectar', Terrain: 'Terreno', Morph: 'Morph', Conform: 'Conformar',
    Spray: 'Spray', Snow: 'Neve', Blizzard: 'Blizzard', PArray: 'PArray', PCloud: 'PCloud',
    'Super Spray': 'Super Spray', Species: 'Espécie', Density: 'Densidade', Age: 'Idade',
    'Leaf Size': 'Tamanho da Folha', 'Crown Radius': 'Raio da Copa', 'Trunk Height': 'Altura do Tronco',
    'Trunk Radius': 'Raio do Tronco', 'Low Poly': 'Baixo Poly', 'High Poly': 'Alto Poly',
    // Reference primitives
    Reference: 'Referência', Suzanne: 'Suzanne', 'Stanford Bunny': 'Coelho de Stanford',
    'Stanford Dragon': 'Dragão de Stanford', '3DBenchy': '3DBenchy', 'Cornell Box': 'Caixa Cornell',
    Mug: 'Caneca',
    // Modifiers (full list)
    Stretch: 'Alongar', Skew: 'Inclinar', FFD: 'FFD', Symmetry: 'Simetria', Mirror: 'Espelhar',
    Lathe: 'Torno', Bevel: 'Chanfro', Slice: 'Fatiar', Skin: 'Skin', 'UVW Map': 'Mapa UVW',
    'Unwrap UVW': 'Desdobrar UVW', MeshSmooth: 'MeshSmooth', WaltSculpt: 'WaltSculpt',
    Extrude: 'Extrudar', Displace: 'Deslocamento', Relax: 'Relaxar', Push: 'Empurrar',
    Gizmo: 'Gizmo', Center: 'Centro', 'Sub-Object': 'Sub-Objeto', 'Sub-Object Levels': 'Níveis de Sub-Objeto',
    'Show End Result': 'Mostrar Resultado Final', 'Make Unique': 'Tornar Único',
    'Remove from Stack': 'Remover da Pilha',
    // Materials
    'Standard Material': 'Material Padrão', 'Physical Material': 'Material Físico',
    'Multi/Sub-Object': 'Multi/Sub-Objeto', 'Double Sided': 'Face Dupla', Blend: 'Blend',
    Composite: 'Composto', 'Matte/Shadow': 'Matte/Sombra', 'Raytrace Material': 'Material Raytrace',
    Diffuse: 'Difuso', Specular: 'Especular', Glossiness: 'Brilho', 'Specular Level': 'Nível Especular',
    Ambient: 'Ambiente', 'Self-Illumination': 'Autoiluminação', Opacity: 'Opacidade',
    'Bump Map': 'Mapa de Bump', 'Normal Map': 'Mapa de Normais', 'Diffuse Map': 'Mapa Difuso',
    'Reflection Map': 'Mapa de Reflexão', 'Refraction Map': 'Mapa de Refração',
    'Displacement Map': 'Mapa de Deslocamento', 'Environment Map': 'Mapa de Ambiente',
    Shader: 'Shader', Blinn: 'Blinn', Phong: 'Phong', Metal: 'Metal', Anisotropic: 'Anisotrópico',
    'Sub-Materials': 'Sub-Materiais', 'Pick Material from Object': 'Obter Material do Objeto',
    'Assign Material to Selection': 'Atribuir Material à Seleção', 'Get Material': 'Obter Material',
    'Show Map in Viewport': 'Mostrar Mapa na Viewport',
    // Lighting
    Omni: 'Omni', Spot: 'Spot', Direct: 'Direta', Skylight: 'Skylight', 'Free Spot': 'Spot Livre',
    'Target Spot': 'Spot com Alvo', 'Free Direct': 'Direta Livre', 'Target Direct': 'Direta com Alvo',
    Intensity: 'Intensidade', Multiplier: 'Multiplicador', Attenuation: 'Atenuação',
    'Near Attenuation': 'Atenuação Próxima', 'Far Attenuation': 'Atenuação Distante',
    'Start Range': 'Início do Alcance', 'End Range': 'Fim do Alcance',
    Hotspot: 'Hotspot', Falloff: 'Falloff', 'Cone Angle': 'Ângulo do Cone',
    Shadows: 'Sombras', 'Shadow Map': 'Mapa de Sombra', 'Ray Traced Shadows': 'Sombras Ray Traced',
    'Shadow Bias': 'Bias da Sombra', 'Shadow Density': 'Densidade da Sombra',
    'Projector Map': 'Mapa Projetor', 'Cast Shadows': 'Projetar Sombras',
    'Light On': 'Luz Ligada', Overshoot: 'Overshoot',
    // Render pipeline
    'Rendering Progress': 'Progresso da Renderização', 'Rendering...': 'Renderizando...',
    'Scene Parsing': 'Análise da Cena', 'Evaluate Scene': 'Avaliar Cena',
    'Evaluate Animation': 'Avaliar Animação', 'Evaluate Bones': 'Avaliar Bones',
    'Evaluate Particles': 'Avaliar Partículas', 'Evaluate Modifiers': 'Avaliar Modificadores',
    'Build Geometry': 'Construir Geometria', 'Build Lights': 'Construir Luzes',
    'Build Shadows': 'Construir Sombras', 'Global Illumination': 'Iluminação Global',
    'Mesh Conversion': 'Conversão de Mesh', 'Spatial Acceleration': 'Aceleração Espacial',
    'Shadow Calculation': 'Cálculo de Sombra', 'Anti-Aliasing': 'Anti-Aliasing',
    'Frame Buffer': 'Frame Buffer', 'Beauty Pass': 'Passagem Beauty',
    'Warmup Pass': 'Passagem de Aquecimento', 'Save Frame': 'Salvar Quadro',
    Elapsed: 'Decorrido', Remaining: 'Restante', 'Scene Stats': 'Estatísticas da Cena',
    Hide: 'Ocultar', Resume: 'Continuar',
    Common: 'Comum', Renderer: 'Motor', Output: 'Saída', 'Output Size': 'Tamanho de Saída',
    'Time Output': 'Saída de Tempo', 'Active Time Segment': 'Segmento de Tempo Ativo',
    Range: 'Intervalo', 'Every Nth Frame': 'A cada N quadros',
    'Scanline Renderer': 'Renderizador Scanline', 'Path Tracer': 'Path Tracer',
    'GPU Path Tracer': 'Path Tracer GPU', CausticRay: 'CausticRay',
    'WebGPU Trace': 'Trace WebGPU', 'Real-time (WebGL)': 'Tempo real (WebGL)',
    // Environment
    'Background Color': 'Cor de Fundo', 'Ambient Light': 'Luz Ambiente',
    'Exposure Control': 'Controle de Exposição', 'Tone Mapping': 'Mapeamento de Tom', Fog: 'Névoa',
    // Print3D / WaltGame / WaltCad / WaltSculpt / MapTools
    WaltGame: 'WaltGame', WaltCad: 'WaltCad', MapTools: 'MapTools', 'MapTools...': 'MapTools...',
    'WaltGame...': 'WaltGame...', 'WaltCad...': 'WaltCad...', 'WaltSculpt...': 'WaltSculpt...',
    'Run Game (F12)': 'Executar Jogo (F12)', 'Export HTML Game...': 'Exportar Jogo HTML...',
    'Play Mode': 'Modo Play', 'Play (F12)': 'Executar (F12)', 'Stop (Esc)': 'Parar (Esc)',
    Player: 'Jogador', Collider: 'Colisor', Trigger: 'Gatilho', Audio: 'Áudio',
    'Input Manager': 'Gerenciador de Entrada', Physics: 'Física', 'Rigid Body': 'Corpo Rígido',
    Static: 'Estático', Dynamic: 'Dinâmico', Kinematic: 'Cinemático',
    Mass: 'Massa', Friction: 'Atrito', Restitution: 'Restituição', Gravity: 'Gravidade',
    Print3D: 'Print3D', 'Layer Height': 'Altura da Camada', Nozzle: 'Bico',
    Filament: 'Filamento', Infill: 'Preenchimento', Supports: 'Suportes', Brim: 'Brim',
    Raft: 'Raft', Slicer: 'Fatiador',
    'Repair Mesh': 'Reparar Malha', 'Close Holes': 'Fechar Buracos', 'Remove Duplicates': 'Remover Duplicados',
    // WaltCad
    Trim: 'Aparar', Extend: 'Estender', Offset: 'Deslocar', Fillet: 'Filete',
    Chamfer: 'Chanfrar', Hatch: 'Hachura', Array: 'Matriz',
    'Layer Manager': 'Gerenciador de Camadas', 'New Layer': 'Nova Camada',
    'Object Snap': 'Snap de Objeto', Endpoint: 'Extremidade', Midpoint: 'Ponto Médio',
    Intersection: 'Interseção', Perpendicular: 'Perpendicular', Tangent: 'Tangente',
    // WaltSculpt
    Brush: 'Pincel', 'Brush Size': 'Tamanho do Pincel', Strength: 'Intensidade',
    Inflate: 'Inflar', Smooth: 'Suavizar', Pinch: 'Beliscar', Grab: 'Puxar',
    Flatten: 'Achatar', Clay: 'Argila', Crease: 'Vinco', Mask: 'Máscara',
    Dyntopo: 'Dyntopo', Remesh: 'Remalhar', 'Symmetry X': 'Simetria X',
    // MapTools / UV
    'UV Editor': 'Editor UV', 'Pack UVs': 'Empacotar UVs', Unwrap: 'Desdobrar',
    Checker: 'Xadrez', 'Relax UVs': 'Relaxar UVs', Align: 'Alinhar', Stitch: 'Costurar',
    'UV Channel': 'Canal UV',
    // Selection region
    'Rectangular Selection Region': 'Seleção Retangular',
    'Circular Selection Region': 'Seleção Circular',
    'Fence Selection Region': 'Seleção por Cerca',
    'Lasso Selection Region': 'Seleção por Laço',
    'Paint Selection Region': 'Seleção por Pintura',
    'Window — fully inside': 'Janela — totalmente dentro',
    'Crossing — touches region': 'Cruzamento — toca a região',
    'Ignore Backfacing': 'Ignorar Faces Traseiras',
    'Selection Region': 'Região de Seleção',
    'Window / Crossing': 'Janela / Cruzamento',
    // Toolbar tooltips
    'Undo (Ctrl+Z)': 'Desfazer (Ctrl+Z)', 'Redo (Ctrl+Y)': 'Refazer (Ctrl+Y)',
    'Select Object (H)': 'Selecionar Objeto (H)',
    'Select and Move (W) — Right-click: Transform Type-In': 'Selecionar e Mover (W) — Botão direito: Transform Type-In',
    'Select and Rotate (E) — Right-click: Transform Type-In': 'Selecionar e Rotacionar (E) — Botão direito: Transform Type-In',
    'Select and Scale (R) — Right-click: Transform Type-In': 'Selecionar e Escalar (R) — Botão direito: Transform Type-In',
    'Select and Link': 'Selecionar e Vincular',
    'Select and Link — click parent to link to (Esc to cancel)': 'Selecionar e Vincular — clique no pai (Esc para cancelar)',
    'Unlink Selection': 'Desvincular Seleção',
    'Snap Toggle (S)': 'Alternar Snap (S)', 'Angle Snap Toggle': 'Alternar Snap de Ângulo',
    'Percent Snap Toggle': 'Alternar Snap de Percentual',
    'Zoom Region': 'Zoom em Região',
    'Scene Hierarchy (List)': 'Hierarquia da Cena (Lista)', 'Object Library': 'Biblioteca de Objetos',
    'Material Editor (M)': 'Editor de Materiais (M)', 'Quick Render (Shift+Q)': 'Render Rápido (Shift+Q)',
    'Min/Max Toggle (W) — Single View': 'Alternar Min/Max (W) — Visão Única',
    'Min/Max Toggle (W) — Quad View (Top/Front/Left/Perspective)': 'Alternar Min/Max (W) — Visão Quad (Top/Front/Left/Perspectiva)',
    // Viewport nav
    Zoom: 'Zoom', 'Zoom All': 'Zoom em Tudo', 'Zoom Extents': 'Zoom Total',
    'Field Of View': 'Campo de Visão', Pan: 'Deslocar', Walkthrough: 'Passeio',
    'Arc Rotate': 'Rotação Orbital', 'Maximize Viewport': 'Maximizar Viewport',
    // Quad menu
    'Isolate Selection': 'Isolar Seleção', 'Freeze Selection': 'Congelar Seleção',
    'Unfreeze All': 'Descongelar Tudo', 'Hide Selection': 'Ocultar Seleção',
    'Unhide All': 'Reexibir Tudo', 'Transform Type-In': 'Entrada de Transformação',
    'Move Transform Type-In': 'Entrada de Movimento', 'Rotate Transform Type-In': 'Entrada de Rotação',
    'Scale Transform Type-In': 'Entrada de Escala',
    'Convert To:': 'Converter em:', 'Object Properties': 'Propriedades do Objeto',
    // Status
    Ready: 'Pronto', Selected: 'Selecionado', objects: 'objetos', object: 'objeto',
    'No selection': 'Nenhuma seleção', Absolute: 'Absoluto', Relative: 'Relativo',
    World: 'Mundo', Local: 'Local', View: 'Vista', Screen: 'Tela',
    // Preferences
    Preferences: 'Preferências', General: 'Geral', Files: 'Arquivos', Viewports: 'Viewports',
    Gamma: 'Gama', 'Render Output': 'Saída de Render', 'Animation Playback': 'Reprodução de Animação',
    'Auto Backup': 'Backup Automático', Hotkeys: 'Atalhos', Colors: 'Cores',
    'Restore Defaults': 'Restaurar Padrões', 'Load...': 'Carregar...', 'Save...': 'Salvar...',
    // Curve / tangent
    Curve: 'Curva', 'Tangent Type': 'Tipo de Tangente', Bezier: 'Bezier', Linear: 'Linear',
    Step: 'Passo', TCB: 'TCB', 'Ease In': 'Suavizar Entrada', 'Ease Out': 'Suavizar Saída',
    Loop: 'Loop', 'Ping-Pong': 'Ping-Pong', Cycle: 'Ciclo',
    // Import
    'Import DWG': 'Importar DWG', 'Import DXF': 'Importar DXF', 'Import ZIP': 'Importar ZIP',
    'Import OBJ': 'Importar OBJ', 'Import FBX': 'Importar FBX', 'Import GLTF': 'Importar GLTF',
    // Render output
    Resolution: 'Resolução', 'Aspect Ratio': 'Proporção', 'Pixel Aspect': 'Proporção do Pixel',
    Samples: 'Amostras', Denoiser: 'Denoiser', Bounces: 'Rebotes',
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
    Tutorials: 'Tutoriales', 'Welcome...': 'Bienvenido...', 'About Walt3D...': 'Acerca de Walt3D...',
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
    // About / Welcome dialogs
    'About Walt3D': 'Acerca de Walt3D',
    'WEB 3D MODELER': 'MODELADOR 3D WEB',
    'web 3d modeler': 'modelador 3d web',
    'Walt3D · Web Edition': 'Walt3D · Edición Web',
    'Version 3.0.1 · Build 2026.07': 'Versión 3.0.1 · Build 2026.07',
    'Copyright © 2026 Walt3D': 'Copyright © 2026 Walt3D',
    'Real-time 3D authoring, non-destructive modifiers, animation timeline, and integrated scanline renderer — running fully in the browser via WebGL / three.js.':
      'Autoría 3D en tiempo real, modificadores no destructivos, línea de tiempo de animación y renderizador scanline integrado — funcionando totalmente en el navegador vía WebGL / three.js.',
    'This product is licensed to:': 'Este producto está licenciado a:',
    'Local User': 'Usuario Local',
    'Welcome to Walt3D': 'Bienvenido a Walt3D',
    Welcome: 'Bienvenida',
    Subscription: 'Suscripción',
    'Legal notice: Walt3D is an independent and proprietary web 3D modeler. This project has no affiliation, association or endorsement with the developers of commercial modeling software on the market. All trademarks and registered marks referenced belong to their respective owners.':
      'Aviso legal: Walt3D es un modelador 3D web independiente y propietario. Este proyecto no tiene vínculo, afiliación ni respaldo con los desarrolladores de software de modelado comercial del mercado. Todas las marcas y marcas registradas referenciadas pertenecen a sus respectivos propietarios.',
    'Free access (demo): the app can be used without login in demonstration mode, but with limited functionality. To unlock all tools, save scenes to the cloud, and have full access to Walt3D, an active subscription is required. See the "Subscription" tab for more details.':
      'Acceso gratuito (demo): la app puede usarse sin login en modo demostración, pero con funcionalidad limitada. Para desbloquear todas las herramientas, guardar escenas en la nube y tener acceso completo a Walt3D, se necesita una suscripción activa. Vea la pestaña "Suscripción" para más detalles.',
    'Promotional subscription: during the promotional period, the subscription costs only':
      'Suscripción promocional: durante el período promocional, la suscripción cuesta solo',
    'US$ 1.00 per month': 'US$ 1,00 por mes',
    'per month': 'por mes',
    'Fill in the fields below to request your subscription — access is manually granted by the administrator after payment confirmation.':
      'Complete los campos a continuación para solicitar su suscripción — el acceso es otorgado manualmente por el administrador tras la confirmación del pago.',
    'Name:': 'Nombre:', 'E-mail:': 'Correo:', 'Reason:': 'Motivo:',
    '← Back': '← Atrás',
    'Sending...': 'Enviando...',
    'Send registration request': 'Enviar solicitud de registro',
    'Please enter your e-mail': 'Ingrese su correo',
    'Request sent': 'Solicitud enviada',
    'Please wait for admin approval.': 'Espere la aprobación del administrador.',
    'Send error': 'Error al enviar',
    // Extended primitives / AEC / Compound / Particles
    Hedra: 'Hedra', ChamferBox: 'Caja Chaflanada', ChamferCyl: 'Cilindro Chaflanado',
    OilTank: 'Tanque de Aceite', Spindle: 'Huso', Gengon: 'Gengon', Prism: 'Prisma',
    'Torus Knot': 'Nudo Toroidal', Capsule: 'Cápsula', 'L-Ext': 'L-Ext', 'C-Ext': 'C-Ext',
    Foliage: 'Follaje', Railing: 'Barandilla', Stairs: 'Escaleras', Door: 'Puerta', Window: 'Ventana',
    Boolean: 'Booleano', ProBoolean: 'ProBoolean', Loft: 'Loft', Scatter: 'Dispersión',
    Connect: 'Conectar', Terrain: 'Terreno', Morph: 'Morph', Conform: 'Conformar',
    Spray: 'Aspersión', Snow: 'Nieve', Blizzard: 'Ventisca', PArray: 'PArray', PCloud: 'PCloud',
    'Super Spray': 'Super Aspersión', Species: 'Especie', Density: 'Densidad', Age: 'Edad',
    'Leaf Size': 'Tamaño de Hoja', 'Crown Radius': 'Radio de Copa', 'Trunk Height': 'Altura del Tronco',
    'Trunk Radius': 'Radio del Tronco', 'Low Poly': 'Bajo Poly', 'High Poly': 'Alto Poly',
    // Reference
    Reference: 'Referencia', Suzanne: 'Suzanne', 'Stanford Bunny': 'Conejo de Stanford',
    'Stanford Dragon': 'Dragón de Stanford', '3DBenchy': '3DBenchy', 'Cornell Box': 'Caja Cornell',
    Mug: 'Taza',
    // Modifiers
    Stretch: 'Estirar', Skew: 'Sesgar', FFD: 'FFD', Symmetry: 'Simetría', Mirror: 'Espejar',
    Lathe: 'Torno', Bevel: 'Bisel', Slice: 'Cortar', Skin: 'Skin', 'UVW Map': 'Mapa UVW',
    'Unwrap UVW': 'Desplegar UVW', MeshSmooth: 'MeshSmooth', WaltSculpt: 'WaltSculpt',
    Extrude: 'Extruir', Displace: 'Desplazar', Relax: 'Relajar', Push: 'Empujar',
    Gizmo: 'Gizmo', Center: 'Centro', 'Sub-Object': 'Sub-Objeto', 'Sub-Object Levels': 'Niveles de Sub-Objeto',
    'Show End Result': 'Mostrar Resultado Final', 'Make Unique': 'Hacer Único',
    'Remove from Stack': 'Quitar de la Pila',
    // Materials
    'Standard Material': 'Material Estándar', 'Physical Material': 'Material Físico',
    'Multi/Sub-Object': 'Multi/Sub-Objeto', 'Double Sided': 'Doble Cara', Blend: 'Mezcla',
    Composite: 'Compuesto', 'Matte/Shadow': 'Matte/Sombra', 'Raytrace Material': 'Material Raytrace',
    Diffuse: 'Difuso', Specular: 'Especular', Glossiness: 'Brillo', 'Specular Level': 'Nivel Especular',
    Ambient: 'Ambiente', 'Self-Illumination': 'Autoiluminación', Opacity: 'Opacidad',
    'Bump Map': 'Mapa de Bump', 'Normal Map': 'Mapa de Normales', 'Diffuse Map': 'Mapa Difuso',
    'Reflection Map': 'Mapa de Reflexión', 'Refraction Map': 'Mapa de Refracción',
    'Displacement Map': 'Mapa de Desplazamiento', 'Environment Map': 'Mapa de Entorno',
    Shader: 'Shader', Blinn: 'Blinn', Phong: 'Phong', Metal: 'Metal', Anisotropic: 'Anisotrópico',
    'Sub-Materials': 'Sub-Materiales',
    'Pick Material from Object': 'Obtener Material del Objeto',
    'Assign Material to Selection': 'Asignar Material a la Selección',
    'Get Material': 'Obtener Material', 'Show Map in Viewport': 'Mostrar Mapa en Vista',
    // Lighting
    Omni: 'Omni', Spot: 'Foco', Direct: 'Directa', Skylight: 'Skylight',
    'Free Spot': 'Foco Libre', 'Target Spot': 'Foco con Objetivo',
    'Free Direct': 'Directa Libre', 'Target Direct': 'Directa con Objetivo',
    Intensity: 'Intensidad', Multiplier: 'Multiplicador', Attenuation: 'Atenuación',
    'Near Attenuation': 'Atenuación Cercana', 'Far Attenuation': 'Atenuación Lejana',
    'Start Range': 'Inicio de Rango', 'End Range': 'Fin de Rango',
    Hotspot: 'Hotspot', Falloff: 'Falloff', 'Cone Angle': 'Ángulo del Cono',
    Shadows: 'Sombras', 'Shadow Map': 'Mapa de Sombra', 'Ray Traced Shadows': 'Sombras Ray Traced',
    'Shadow Bias': 'Bias de Sombra', 'Shadow Density': 'Densidad de Sombra',
    'Projector Map': 'Mapa Proyector', 'Cast Shadows': 'Proyectar Sombras',
    'Light On': 'Luz Encendida', Overshoot: 'Overshoot',
    // Render pipeline
    'Rendering Progress': 'Progreso de Renderizado', 'Rendering...': 'Renderizando...',
    'Scene Parsing': 'Análisis de Escena', 'Evaluate Scene': 'Evaluar Escena',
    'Evaluate Animation': 'Evaluar Animación', 'Evaluate Bones': 'Evaluar Huesos',
    'Evaluate Particles': 'Evaluar Partículas', 'Evaluate Modifiers': 'Evaluar Modificadores',
    'Build Geometry': 'Construir Geometría', 'Build Lights': 'Construir Luces',
    'Build Shadows': 'Construir Sombras', 'Global Illumination': 'Iluminación Global',
    'Mesh Conversion': 'Conversión de Mesh', 'Spatial Acceleration': 'Aceleración Espacial',
    'Shadow Calculation': 'Cálculo de Sombra', 'Anti-Aliasing': 'Anti-Aliasing',
    'Frame Buffer': 'Frame Buffer', 'Beauty Pass': 'Pasada Beauty',
    'Warmup Pass': 'Pasada de Calentamiento', 'Save Frame': 'Guardar Cuadro',
    Elapsed: 'Transcurrido', Remaining: 'Restante', 'Scene Stats': 'Estadísticas de Escena',
    Hide: 'Ocultar', Resume: 'Continuar',
    Common: 'Común', Renderer: 'Motor', Output: 'Salida', 'Output Size': 'Tamaño de Salida',
    'Time Output': 'Salida de Tiempo', 'Active Time Segment': 'Segmento de Tiempo Activo',
    Range: 'Rango', 'Every Nth Frame': 'Cada N cuadros',
    'Scanline Renderer': 'Renderizador Scanline', 'Path Tracer': 'Path Tracer',
    'GPU Path Tracer': 'Path Tracer GPU', CausticRay: 'CausticRay',
    'WebGPU Trace': 'Trace WebGPU', 'Real-time (WebGL)': 'Tiempo real (WebGL)',
    // Environment
    'Background Color': 'Color de Fondo', 'Ambient Light': 'Luz Ambiente',
    'Exposure Control': 'Control de Exposición', 'Tone Mapping': 'Mapeo de Tono', Fog: 'Niebla',
    // Plugins
    WaltGame: 'WaltGame', WaltCad: 'WaltCad', MapTools: 'MapTools', 'MapTools...': 'MapTools...',
    'WaltGame...': 'WaltGame...', 'WaltCad...': 'WaltCad...', 'WaltSculpt...': 'WaltSculpt...',
    'Run Game (F12)': 'Ejecutar Juego (F12)', 'Export HTML Game...': 'Exportar Juego HTML...',
    'Play Mode': 'Modo Play', 'Play (F12)': 'Ejecutar (F12)', 'Stop (Esc)': 'Detener (Esc)',
    Player: 'Jugador', Collider: 'Colisionador', Trigger: 'Disparador', Audio: 'Audio',
    'Input Manager': 'Gestor de Entrada', Physics: 'Física', 'Rigid Body': 'Cuerpo Rígido',
    Static: 'Estático', Dynamic: 'Dinámico', Kinematic: 'Cinemático',
    Mass: 'Masa', Friction: 'Fricción', Restitution: 'Restitución', Gravity: 'Gravedad',
    Print3D: 'Print3D', 'Layer Height': 'Altura de Capa', Nozzle: 'Boquilla',
    Filament: 'Filamento', Infill: 'Relleno', Supports: 'Soportes', Brim: 'Brim',
    Raft: 'Raft', Slicer: 'Rebanador',
    'Repair Mesh': 'Reparar Malla', 'Close Holes': 'Cerrar Huecos',
    'Remove Duplicates': 'Quitar Duplicados',
    Trim: 'Recortar', Extend: 'Extender', Offset: 'Desplazar', Fillet: 'Redondeo',
    Chamfer: 'Chaflán', Hatch: 'Sombreado', Array: 'Matriz',
    'Layer Manager': 'Gestor de Capas', 'New Layer': 'Nueva Capa',
    'Object Snap': 'Snap de Objeto', Endpoint: 'Extremo', Midpoint: 'Punto Medio',
    Intersection: 'Intersección', Perpendicular: 'Perpendicular', Tangent: 'Tangente',
    Brush: 'Pincel', 'Brush Size': 'Tamaño del Pincel', Strength: 'Intensidad',
    Inflate: 'Inflar', Smooth: 'Suavizar', Pinch: 'Pellizcar', Grab: 'Agarrar',
    Flatten: 'Aplanar', Clay: 'Arcilla', Crease: 'Pliegue', Mask: 'Máscara',
    Dyntopo: 'Dyntopo', Remesh: 'Remalla', 'Symmetry X': 'Simetría X',
    'UV Editor': 'Editor UV', 'Pack UVs': 'Empaquetar UVs', Unwrap: 'Desplegar',
    Checker: 'Ajedrez', 'Relax UVs': 'Relajar UVs', Align: 'Alinear', Stitch: 'Coser',
    'UV Channel': 'Canal UV',
    // Selection region
    'Rectangular Selection Region': 'Selección Rectangular',
    'Circular Selection Region': 'Selección Circular',
    'Fence Selection Region': 'Selección por Cerca',
    'Lasso Selection Region': 'Selección por Lazo',
    'Paint Selection Region': 'Selección por Pintura',
    'Window — fully inside': 'Ventana — totalmente dentro',
    'Crossing — touches region': 'Cruce — toca la región',
    'Ignore Backfacing': 'Ignorar Caras Traseras',
    'Selection Region': 'Región de Selección',
    'Window / Crossing': 'Ventana / Cruce',
    // Toolbar tooltips
    'Undo (Ctrl+Z)': 'Deshacer (Ctrl+Z)', 'Redo (Ctrl+Y)': 'Rehacer (Ctrl+Y)',
    'Select Object (H)': 'Seleccionar Objeto (H)',
    'Select and Move (W) — Right-click: Transform Type-In': 'Seleccionar y Mover (W) — Clic derecho: Transform Type-In',
    'Select and Rotate (E) — Right-click: Transform Type-In': 'Seleccionar y Rotar (E) — Clic derecho: Transform Type-In',
    'Select and Scale (R) — Right-click: Transform Type-In': 'Seleccionar y Escalar (R) — Clic derecho: Transform Type-In',
    'Select and Link': 'Seleccionar y Vincular',
    'Select and Link — click parent to link to (Esc to cancel)': 'Seleccionar y Vincular — clic en el padre (Esc para cancelar)',
    'Unlink Selection': 'Desvincular Selección',
    'Snap Toggle (S)': 'Alternar Snap (S)', 'Angle Snap Toggle': 'Alternar Snap de Ángulo',
    'Percent Snap Toggle': 'Alternar Snap de Porcentaje',
    'Zoom Region': 'Zoom en Región',
    'Scene Hierarchy (List)': 'Jerarquía de Escena (Lista)', 'Object Library': 'Biblioteca de Objetos',
    'Material Editor (M)': 'Editor de Materiales (M)', 'Quick Render (Shift+Q)': 'Render Rápido (Shift+Q)',
    'Min/Max Toggle (W) — Single View': 'Alternar Min/Max (W) — Vista Única',
    'Min/Max Toggle (W) — Quad View (Top/Front/Left/Perspective)': 'Alternar Min/Max (W) — Vista Cuad (Top/Front/Left/Perspectiva)',
    Zoom: 'Zoom', 'Zoom All': 'Zoom Todo', 'Zoom Extents': 'Zoom Total',
    'Field Of View': 'Campo de Visión', Pan: 'Panear', Walkthrough: 'Recorrido',
    'Arc Rotate': 'Rotación Orbital', 'Maximize Viewport': 'Maximizar Vista',
    'Isolate Selection': 'Aislar Selección', 'Freeze Selection': 'Congelar Selección',
    'Unfreeze All': 'Descongelar Todo', 'Hide Selection': 'Ocultar Selección',
    'Unhide All': 'Mostrar Todo', 'Transform Type-In': 'Entrada de Transformación',
    'Move Transform Type-In': 'Entrada de Movimiento', 'Rotate Transform Type-In': 'Entrada de Rotación',
    'Scale Transform Type-In': 'Entrada de Escala',
    'Convert To:': 'Convertir a:', 'Object Properties': 'Propiedades del Objeto',
    Ready: 'Listo', Selected: 'Seleccionado', objects: 'objetos', object: 'objeto',
    'No selection': 'Sin selección', Absolute: 'Absoluto', Relative: 'Relativo',
    World: 'Mundo', Local: 'Local', View: 'Vista', Screen: 'Pantalla',
    Preferences: 'Preferencias', General: 'General', Files: 'Archivos', Viewports: 'Vistas',
    Gamma: 'Gama', 'Render Output': 'Salida de Render', 'Animation Playback': 'Reproducción de Animación',
    'Auto Backup': 'Copia Automática', Hotkeys: 'Atajos', Colors: 'Colores',
    'Restore Defaults': 'Restaurar Predeterminados', 'Load...': 'Cargar...', 'Save...': 'Guardar...',
    Curve: 'Curva', 'Tangent Type': 'Tipo de Tangente', Bezier: 'Bezier', Linear: 'Lineal',
    Step: 'Paso', TCB: 'TCB', 'Ease In': 'Suavizar Entrada', 'Ease Out': 'Suavizar Salida',
    Loop: 'Bucle', 'Ping-Pong': 'Ping-Pong', Cycle: 'Ciclo',
    'Import DWG': 'Importar DWG', 'Import DXF': 'Importar DXF', 'Import ZIP': 'Importar ZIP',
    'Import OBJ': 'Importar OBJ', 'Import FBX': 'Importar FBX', 'Import GLTF': 'Importar GLTF',
    Resolution: 'Resolución', 'Aspect Ratio': 'Proporción', 'Pixel Aspect': 'Proporción de Píxel',
    Samples: 'Muestras', Denoiser: 'Denoiser', Bounces: 'Rebotes',
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
        if (selfWriting > 0) return; // ignore mutations we caused
        const currentLookup = (s: string) => dict[langRef.current]?.[s] ?? s;
        for (const m of mutations) {
          if (m.type === 'characterData' && m.target.nodeType === 3) {
            const tn = m.target as Text;
            // React just wrote to this node — its current value is the new
            // English source (recover if it happens to already be translated).
            originalText.set(tn, recoverSource(tn.nodeValue ?? ''));
            translateTextNode(tn, currentLookup);
          } else if (m.type === 'childList') {
            m.addedNodes.forEach((n) => walkAndTranslate(n, currentLookup));
          } else if (m.type === 'attributes' && m.target.nodeType === 1) {
            const el = m.target as Element;
            const bag = originalAttr.get(el);
            if (bag && m.attributeName && m.attributeName in bag) {
              bag[m.attributeName] = recoverSource(el.getAttribute(m.attributeName) ?? '');
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
