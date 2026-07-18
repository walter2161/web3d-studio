import { R3Dialog } from './R3Dialog';
import { useLanguage, Lang } from './LanguageContext';
import { useMemo, useState } from 'react';

// ============================================================================
// HelpDialog — In-app documentation for Walt3D.
//
// The pages (User Reference, MAXScript Reference, Tutorials, Keyboard
// Shortcuts, What's New) are provided as pre-translated content bundles per
// language. Selecting a different language via Customize → Language switches
// the shown text immediately — no dictionary lookup / partial-string fallback.
//
// Each topic is a list of sections { heading, body[] } so we can render a
// consistent doc-style layout with headings, paragraphs and bullet lists.
// ============================================================================

export type HelpTopic =
  | 'user-reference'
  | 'maxscript-reference'
  | 'tutorials'
  | 'shortcuts'
  | 'whats-new';

interface Block {
  h?: string;         // section heading
  p?: string;         // paragraph
  ul?: string[];      // bullet list
  code?: string;      // preformatted code
}

interface HelpPage {
  title: string;
  intro: string;
  sections: Block[][];
  sectionTitles: string[];
}

// ---------------------------------------------------------------------------
// EN — User Reference
// ---------------------------------------------------------------------------
const userRef_en: HelpPage = {
  title: 'Walt3D — User Reference',
  intro: 'Walt3D is a browser-based 3D modeling, animation and rendering studio inspired by the workflow of 3ds Max R3–2024. This reference explains every panel and tool available in the current build.',
  sectionTitles: [
    '1. Interface Overview', '2. Creating Objects', '3. Selection & Transform',
    '4. Modifier Stack', '5. Materials & Maps', '6. Lighting', '7. Cameras & Rendering',
    '8. Animation & Timeline', '9. Rigging & Characters', '10. WaltSculpt',
    '11. Print3D Toolkit', '12. MapTools (UV)', '13. Particle Systems',
    '14. Import / Export', '15. Customization',
  ],
  sections: [
    // 1
    [
      { p: 'The Walt3D interface reproduces the classic 3ds Max R3 layout: menu bar on top, main toolbar below it, a viewport grid in the middle, the Command Panel (side panel) on the right, and the animation timeline plus status bar at the bottom.' },
      { h: 'Viewport Grid', p: 'The default layout is Quad view: three orthographic wireframes (Top, Front, Left) and one perspective in smooth-shaded mode. Alternative layouts (Single, 2-columns, 2-rows) are available under Views → Viewport Layout.' },
      { h: 'Active Viewport', p: 'Clicking a viewport activates it and shows a yellow border. The bottom-right button toggles between Quad and Maximized Active Viewport (Alt+W). The title-bar button toggles full-screen application mode.' },
      { h: 'Command Panel', p: 'The right side panel switches between Create, Modify, Hierarchy, Motion, Display and Utilities panels — same tabs as 3ds Max.' },
    ],
    // 2
    [
      { p: 'Create objects from Create → Geometry or by dragging from the Object Library.' },
      { h: 'Standard Primitives', ul: ['Box, Sphere, Cylinder, Cone, Torus, Plane, Pyramid, Teapot, GeoSphere, Tube'] },
      { h: 'Extended Primitives', ul: ['ChamferBox, ChamferCyl, OilTank, Capsule, Spindle, L-Ext, C-Ext, Gengon, Hedra, Torus Knot, RingWave, Hose'] },
      { h: 'Shapes', ul: ['Line, Rectangle, Circle, Ellipse, Arc, Donut, NGon, Star, Helix, Text (with Google Fonts and TTF/OTF loading, extrusion and bevel)'] },
      { h: 'AEC Objects', ul: ['Wall, Door, Window, Stairs, Railing, Foliage (procedural fractal trees)'] },
      { h: 'Compound Objects', ul: ['Boolean (Union, Subtraction, Intersection), Loft, Scatter, ProBoolean, Morph, Connect'] },
      { h: 'Ortho Creation', p: 'Click-and-drag creation works in every viewport. In orthographic viewports the base is drawn in the screen plane and screen-Y offset defines the height, just like in 3ds Max.' },
    ],
    // 3
    [
      { h: 'Selection Region', p: 'Rectangle, Circle, Fence, Lasso, Paint. Toggle between Window (fully inside) and Crossing (partial overlap) on the toolbar. Ignore Backfacing hides hidden faces from picks.' },
      { h: 'Multi-Selection', p: 'Ctrl adds to the selection, Alt subtracts. The selection remains until you click elsewhere.' },
      { h: 'Sub-Object Selection', p: 'Region selection also works on Vertex, Edge, Face, Poly, Element and Spline knots when a modifier is in sub-object mode.' },
      { h: 'Transform Tools', ul: ['Select and Move (W)', 'Select and Rotate (E)', 'Select and Scale (R)', 'Select and Link (parent/child hierarchy)', 'Unlink Selection'] },
      { h: 'Type-In Dialog', p: 'Right-click any transform button on the main toolbar to open the Transform Type-In dialog for numeric input.' },
      { h: 'Snapping', p: 'Snaps Toggle (S) enables grid/vertex/edge/face snapping. When active, Line and Wall creation force orthogonal segments aligned to the grid.' },
    ],
    // 4
    [
      { p: 'The Modifier Stack is fully non-destructive. Adding a modifier from the Modify panel appears at the top of the stack and is selected automatically.' },
      { h: 'Deformers', ul: ['Bend, Twist, Taper, Skew, Stretch, Noise, Wave, Ripple, Squeeze, Spherify, Push, Relax'] },
      { h: 'Free-Form', ul: ['FFD 2×2×2, 3×3×3, 4×4×4, FFD Box, FFD Cyl'] },
      { h: 'Topology', ul: ['MeshSmooth, TurboSmooth, Subdivide, Tessellate, Optimize, Cap Holes, Symmetry, Mirror, Slice, Shell, Extrude, Bevel, Lathe, Skin, UVW Map, Unwrap UVW'] },
      { h: 'Gizmos', p: 'Bend, Twist, Taper, FFD and similar modifiers expose a Gizmo / Center sub-object level, editable in the viewport with the standard Move/Rotate/Scale tools.' },
      { h: 'Editable Spline', p: 'Any shape can be collapsed to an Editable Spline exposing Vertex / Segment / Spline sub-levels with Bezier handles.' },
      { h: 'Editable Mesh / Poly', p: 'Converts geometry to per-vertex/edge/face editing with Extrude, Bevel, Chamfer, Cut, Weld, Bridge and Turn Edge tools.' },
    ],
    // 5
    [
      { h: 'Material Editor R3', p: 'Slots 6×4 grid. Materials support Standard shading models (Blinn, Phong, Metal, Oren-Nayar, Anisotropic, Multi-Layer) with Ambient/Diffuse/Specular/Glossiness/Self-Illumination/Opacity.' },
      { h: 'Maps', ul: ['Diffuse, Specular, Glossiness, Self-Illumination, Opacity, Bump, Normal, Reflection, Refraction, Displacement'] },
      { h: 'Procedural Maps', ul: ['Checker, Gradient, Gradient Ramp, Noise, Cellular, Marble, Wood, Speckle, Splat, Falloff, Mix, RGB Multiply, Composite, Bitmap'] },
      { h: 'Compound Materials', ul: ['Multi/Sub-Object (per-face material IDs)', 'Blend, Double Sided, Top/Bottom, Composite, Shellac, Matte/Shadow'] },
    ],
    // 6
    [
      { h: 'Light Types', ul: ['Omni, Target Spot, Free Spot, Target Direct, Free Direct, Skylight'] },
      { h: 'General Parameters', ul: ['On/Off, Color, Multiplier, Cast Shadows, Affect Diffuse / Specular / Ambient Only, Exclude/Include list'] },
      { h: 'Attenuation', ul: ['Decay: None / Inverse / Inverse Square', 'Near Attenuation: Start / End', 'Far Attenuation: Start / End'] },
      { h: 'Spot / Direct', ul: ['Hotspot / Falloff angles', 'Cone shape: Circle / Rectangle', 'Aspect Ratio, Overshoot, Show Cone gizmo'] },
      { h: 'Shadows', ul: ['Shadow Map / Ray Traced / Advanced Ray Traced', 'Bias, Size, Sample Range'] },
      { h: 'Advanced', ul: ['Projector Map (image or animated texture projected through the light)', 'Contrast, Soften Diffuse Edge'] },
    ],
    // 7
    [
      { p: 'Rendering uses a WebGL-based real-time engine with optional shadow maps and post effects.' },
      { h: 'Render Setup', ul: ['Output: Single / Active Time Segment / Range / Frames', 'Resolution presets: 320×240 → 1920×1080, custom', 'File output: PNG / JPEG / MP4 (via MediaRecorder)'] },
      { h: 'Environment', ul: ['Background color / gradient / bitmap / HDRI', 'Global lighting: Ambient, Tint, Level', 'Exposure Control, Atmospheric Effects (Fog, Volume Fog)'] },
      { h: 'Cameras', ul: ['Free / Target camera, FOV, Focal Length, Clipping Planes, Depth of Field, Motion Blur'] },
    ],
    // 8
    [
      { p: 'The timeline defaults to 100 frames with cubic Bezier interpolation. Auto Key toggles keyframe recording; Set Key requires explicit key placement.' },
      { h: 'Track View', ul: ['Dope Sheet: per-channel keys on a Gantt-style grid', 'Curve Editor: Bezier tangent editing per animatable parameter', 'Clip lanes: place walk/run/idle segments and cross-fade them'] },
      { h: 'Controllers', ul: ['Bezier, Linear, TCB, Noise, Position/Rotation/LookAt Constraints'] },
      { h: 'Undo Scope', p: 'Timeline edits (key add, move, delete, clip changes) have their own undo history so unrelated scene edits are not lost.' },
    ],
    // 9
    [
      { h: 'Bones & Rigs', p: 'Imported skinned models (FBX/glTF) automatically expose a Bones panel with a full hierarchical tree.' },
      { h: 'Manipulation', ul: ['Select any bone in the tree or via the on-scene joint gizmos', 'Move / Rotate / Scale per bone with full undo history', 'IK Solvers: HI Solver, HD Solver, Spline IK'] },
      { h: 'Animation Blending', p: 'Multiple baked clips (Walk, Run, Idle…) can be laid out on the Clip Gantt lane and cross-faded to change animation mid-scene.' },
    ],
    // 10
    [
      { p: 'WaltSculpt is Walt3D\'s hybrid direct-mesh sculpting system, available as a modifier and as a top-level tool.' },
      { h: 'Brushes', ul: ['Draw, Clay, ClayStrips, Inflate, Crease, Pinch, Grab, Smooth, Flatten, Layer, Nudge, Mask'] },
      { h: 'Brush Options', ul: ['Radius, Strength, Falloff curve, Symmetry X/Y/Z, Dyntopo (dynamic topology)', 'Screen-space brush cursor with live preview'] },
      { h: 'Workflow', p: 'Sculpting is non-destructive when applied via the modifier stack; converting to Editable Poly bakes the sculpt into geometry.' },
    ],
    // 11
    [
      { p: 'Print3D Toolkit prepares meshes for resin/FDM 3D printing. Presets include the Elegoo Mars 2 Pro.' },
      { h: 'Tools', ul: ['Virtual print bed with build volume overlay', 'Auto-orient, Hollow, Add Supports, Repair (fill holes, unify normals, remove non-manifold)', 'Slice preview (per-layer)', 'Estimate resin volume / print time'] },
    ],
    // 12
    [
      { p: 'MapTools is the UV editing panel (TexTools-inspired).' },
      { h: 'Features', ul: ['Auto Unwrap, Planar / Cylindrical / Spherical / Box projections', 'UV Pack, Align, Straighten, Relax, Stack Similar Shells', 'Checker preview material with adjustable density', 'UDIM tile management'] },
    ],
    // 13
    [
      { h: 'Systems', ul: ['Spray, Snow, PArray, Blizzard, PCloud, Super Spray, Particle Flow (basic)'] },
      { h: 'Emitter Parameters', ul: ['Rate, Speed, Direction, Variation, Life, Gravity, Wind, Deflectors'] },
      { h: 'Particle Shapes', ul: ['Dot, Triangle, Facing quad, Sphere, Cube, Custom mesh'] },
    ],
    // 14
    [
      { h: 'Supported Formats', ul: ['Import: OBJ, GLTF, GLB, FBX, 3DS, DAE, STL, PLY, DWG, DXF, ZIP (Sketchfab bundles)', 'Export: OBJ, GLTF, GLB, STL, PLY'] },
      { h: 'ZIP Bundles', p: 'Drop a ZIP archive containing the model and its textures. Walt3D extracts every file, resolves relative texture references through a LoadingManager, and rehydrates the archive from IndexedDB on reload.' },
    ],
    // 15
    [
      { h: 'Preferences', p: 'Customize → Preferences opens the tabbed dialog (General, Files, Viewports, Gamma, Rendering, Animation, Inverse Kinematics, Gizmos).' },
      { h: 'Customize UI', ul: ['Hotkeys editor with search and conflict detection', 'UI colors editor (per-token color pickers persisted to localStorage)'] },
      { h: 'Language', p: 'Customize → Language switches every UI string, dialog and help page to English, Portuguese or Spanish immediately.' },
      { h: 'Themes', p: 'Customize → Interface offers Classic (3ds Max R3), Flat and Game visual themes.' },
    ],
  ],
};

// ---------------------------------------------------------------------------
// EN — MAXScript Reference
// ---------------------------------------------------------------------------
const maxscript_en: HelpPage = {
  title: 'MAXScript Reference',
  intro: 'MAXScript is Walt3D\'s embedded scripting language. It replicates a subset of the 3ds Max MAXScript language for scene automation, batch operations and custom tools. Open the Listener via MAXScript → MAXScript Listener.',
  sectionTitles: [
    '1. Basics', '2. Variables & Types', '3. Scene Access',
    '4. Creating Objects', '5. Transforms', '6. Modifiers',
    '7. Iteration', '8. Rendering', '9. Utility Functions',
  ],
  sections: [
    [
      { p: 'Statements are line-based. A line starting with -- is a comment. Blocks use parentheses. Assignments use =. The Listener echoes the last expression\'s value.' },
      { code: '-- Hello Walt3D\n"hello" + " " + "world"\n-- Result: "hello world"' },
    ],
    [
      { p: 'Types: integer, float, string, boolean (true/false), array (#(...)), point3 [x,y,z], color, node.' },
      { code: 'a = 10\nb = 3.14\nname = "MyBox"\npos = [10, 0, 5]\ncol = color 255 128 0' },
    ],
    [
      { ul: ['objects — array of all scene nodes', 'selection — currently selected nodes', '$name — pick by name', '$* — all objects (wildcard)'] },
      { code: 'for o in objects do print o.name\n$Box01.pos = [0,0,10]' },
    ],
    [
      { code: 'b = box length:20 width:20 height:20\ns = sphere radius:10 pos:[30,0,10]\nc = cylinder radius:5 height:30' },
    ],
    [
      { ul: ['obj.pos — position [x,y,z]', 'obj.rotation — quaternion or euler', 'obj.scale — [sx,sy,sz]', 'move obj [dx,dy,dz]', 'rotate obj (angleaxis 45 [0,0,1])', 'scale obj [2,2,2]'] },
    ],
    [
      { code: 'addModifier $Box01 (Bend angle:45 direction:0 axis:2)\naddModifier selection (TurboSmooth iterations:2)' },
    ],
    [
      { code: 'for i = 1 to 5 do (\n  b = box height:i*10 pos:[i*30, 0, 0]\n)\nwhile $Box01.pos.z < 100 do move $Box01 [0,0,1]' },
    ],
    [
      { ul: ['render() — trigger the render setup dialog', 'renderCurrentFrame() — render active viewport', 'renderRange 0 100 outputPath:"out.png"'] },
    ],
    [
      { ul: ['print value — print to Listener', 'format "% at %\\n" node.name node.pos', 'delete obj — remove from scene', 'clone obj — duplicate', 'group selection — create group'] },
    ],
  ],
};

// ---------------------------------------------------------------------------
// EN — Tutorials
// ---------------------------------------------------------------------------
const tutorials_en: HelpPage = {
  title: 'Walt3D Tutorials',
  intro: 'Step-by-step lessons covering the most common tasks. Each lesson lists the exact menus, panels and shortcuts you\'ll use.',
  sectionTitles: [
    'Tutorial 1 — Your First Scene',
    'Tutorial 2 — Working with Modifiers',
    'Tutorial 3 — Materials & Textures',
    'Tutorial 4 — Lighting & Rendering',
    'Tutorial 5 — Animating a Character',
    'Tutorial 6 — Sculpting with WaltSculpt',
    'Tutorial 7 — Preparing a Print (Elegoo Mars 2 Pro)',
    'Tutorial 8 — Importing a Sketchfab ZIP',
  ],
  sections: [
    [
      { p: 'Goal: create a simple table on the ground plane.' },
      { ul: [
        'Create → Standard Primitives → Box. Drag on the Top viewport to make a 100×60×5 tabletop.',
        'Create four Cylinders (radius 3, height 40) — position them at each corner (right-click any transform button for numeric input).',
        'Select all four legs, Ctrl+Click the tabletop to include it, then Group → Group to combine.',
        'Save with File → Save As.',
      ]},
    ],
    [
      { p: 'Goal: add a Bend to a tall Box.' },
      { ul: [
        'Create a Box: length 10, width 10, height 100, height segments 20.',
        'Modify panel → Bend. Set Angle to 90, Bend Axis to Z.',
        'Expand the modifier in the stack, choose Gizmo sub-object level and rotate the gizmo to change the bend axis interactively.',
      ]},
    ],
    [
      { ul: [
        'M opens Material Editor R3.',
        'Pick the first slot, set Diffuse color, then click the small square next to Diffuse to add a Bitmap map.',
        'Drag the material onto the object (or click Assign to Selection).',
        'Add a Bump map at 30% strength for surface detail.',
      ]},
    ],
    [
      { ul: [
        'Create → Lights → Target Spot. Place the source above your scene and its target on the subject.',
        'Enable Cast Shadows (Shadow Map). Adjust Hotspot / Falloff for the cone.',
        'Rendering → Render Setup. Choose 1280×720, PNG, click Render.',
      ]},
    ],
    [
      { ul: [
        'Import an FBX character with animation (Mixamo works out of the box).',
        'Open the Bones panel — click a limb bone to select it.',
        'Enable Auto Key, scrub the timeline, rotate the bone at frame 20 — a key is recorded automatically.',
        'Open Track View → Curve Editor to fine-tune tangents.',
      ]},
    ],
    [
      { ul: [
        'Select a Sphere with enough segments (32+).',
        'Add the WaltSculpt modifier — the brush cursor appears when you hover the mesh.',
        'Choose Draw brush, set Radius and Strength, enable Symmetry X.',
        'Paint on the mesh to sculpt.',
      ]},
    ],
    [
      { ul: [
        'Create → Print3D → Print Bed. Choose the Elegoo Mars 2 Pro preset.',
        'Drop your model onto the bed — the bounds overlay shows if it fits.',
        'Print3D panel → Auto-Orient, then Hollow (2mm shell) and Add Supports.',
        'Export STL for slicing (or use the built-in slice preview).',
      ]},
    ],
    [
      { ul: [
        'File → Import. Choose a .zip downloaded from Sketchfab.',
        'Walt3D extracts every file, resolves textures and .bin buffers automatically.',
        'If the model appears untextured, verify the archive contains the referenced files in any subfolder — Walt3D matches by leaf name too.',
      ]},
    ],
  ],
};

// ---------------------------------------------------------------------------
// EN — Keyboard Shortcuts
// ---------------------------------------------------------------------------
const shortcuts_en: HelpPage = {
  title: 'Keyboard Shortcuts',
  intro: 'Default keyboard shortcuts. All keys can be customized in Customize → Customize UI → Hotkeys.',
  sectionTitles: ['File & Edit', 'Selection & Transform', 'Viewport', 'Animation', 'Sub-Object Levels', 'Panels'],
  sections: [
    [{ ul: ['Ctrl+N — New Scene', 'Ctrl+O — Open', 'Ctrl+S — Save', 'Ctrl+Shift+S — Save As', 'Ctrl+Z — Undo', 'Ctrl+Y — Redo', 'Delete — Delete selection'] }],
    [{ ul: ['Q — Select', 'W — Move', 'E — Rotate', 'R — Scale', 'Ctrl+A — Select All', 'Ctrl+D — Deselect All', 'Ctrl+I — Invert Selection', 'S — Snap Toggle', 'H — Select by Name'] }],
    [{ ul: ['Alt+W — Toggle Active Viewport (Maximize)', 'Ctrl+P — Perspective', 'Ctrl+T — Top', 'Ctrl+F — Front', 'Ctrl+L — Left', 'Z — Zoom Extents', 'F3 — Wireframe / Smooth toggle', 'F4 — Edged Faces toggle'] }],
    [{ ul: ['N — Auto Key toggle', 'K — Set Key', ', — Previous Frame', '. — Next Frame', '/ — Play / Pause'] }],
    [{ ul: ['1 — Vertex', '2 — Edge', '3 — Face', '4 — Polygon', '5 — Element'] }],
    [{ ul: ['M — Material Editor', 'F10 — Render Setup', 'Shift+Q — Quick Render', 'F11 — App Fullscreen'] }],
  ],
};

// ---------------------------------------------------------------------------
// EN — What's New
// ---------------------------------------------------------------------------
const whatsNew_en: HelpPage = {
  title: 'What\'s New in Walt3D',
  intro: 'Recent additions and improvements to Walt3D.',
  sectionTitles: ['Modeling', 'Animation', 'Materials & Lighting', 'Import/Export', 'UI & Preferences'],
  sections: [
    [{ ul: [
      'WaltSculpt hybrid sculpting system with dynamic topology and symmetry.',
      'Editable Spline / Editable Mesh with full sub-object levels.',
      'Complete modifier set (Bend, Twist, FFD, Shell, Symmetry, Mirror, Slice, Lathe, Bevel, Skin, UVW Map, Unwrap UVW…) with viewport Gizmo/Center controls.',
      'Print3D Toolkit for resin/FDM printing with Elegoo Mars 2 Pro preset.',
    ] }],
    [{ ul: [
      'Track View with Dope Sheet and Curve Editor.',
      'Clip Gantt lane for laying out and cross-fading baked animation clips.',
      'Scoped timeline undo — keyframe edits no longer lose imported models.',
    ] }],
    [{ ul: [
      'Material Editor R3 with Standard, Multi/Sub-Object, Blend, Double Sided, Top/Bottom, Composite, Shellac, Matte/Shadow.',
      'Complete 3ds Max-style light system with attenuation, projector maps and shadow controls.',
    ] }],
    [{ ul: [
      'ZIP bundle import (Sketchfab-style) with automatic texture resolution.',
      'DWG / DXF import for CAD workflows.',
    ] }],
    [{ ul: [
      'Multi-language support: English, Portuguese, Spanish (auto-translated across the entire app).',
      'Customize UI: hotkeys editor and per-token color editor.',
      'Quad view default with alternate layouts under Views → Viewport Layout.',
    ] }],
  ],
};

// ============================================================================
// PT translations
// ============================================================================
const userRef_pt: HelpPage = {
  title: 'Walt3D — Referência do Usuário',
  intro: 'O Walt3D é um estúdio 3D no navegador para modelagem, animação e renderização, inspirado no fluxo de trabalho do 3ds Max R3–2024. Esta referência descreve cada painel e ferramenta da versão atual.',
  sectionTitles: [
    '1. Visão Geral da Interface', '2. Criando Objetos', '3. Seleção e Transformação',
    '4. Pilha de Modificadores', '5. Materiais e Mapas', '6. Iluminação',
    '7. Câmeras e Renderização', '8. Animação e Timeline', '9. Rigging e Personagens',
    '10. WaltSculpt', '11. Print3D Toolkit', '12. MapTools (UV)',
    '13. Sistemas de Partículas', '14. Importação / Exportação', '15. Personalização',
  ],
  sections: [
    [
      { p: 'A interface do Walt3D reproduz o layout clássico do 3ds Max R3: menu no topo, barra de ferramentas principal logo abaixo, grade de viewports ao centro, o Painel de Comandos (barra lateral) à direita e a timeline de animação junto com a barra de status na parte inferior.' },
      { h: 'Grade de Viewports', p: 'O layout padrão é Quad view: três wireframes ortográficos (Top, Front, Left) e uma perspectiva com sombreamento suave. Layouts alternativos (Single, 2 colunas, 2 linhas) ficam em Views → Viewport Layout.' },
      { h: 'Viewport Ativa', p: 'Clicar em uma viewport a ativa e mostra uma borda amarela. O botão inferior direito alterna entre Quad e Viewport Ativa Maximizada (Alt+W). O botão da barra de título alterna o modo tela cheia da aplicação.' },
      { h: 'Painel de Comandos', p: 'O painel da direita alterna entre as abas Create, Modify, Hierarchy, Motion, Display e Utilities — as mesmas do 3ds Max.' },
    ],
    [
      { p: 'Crie objetos em Create → Geometry ou arrastando da Biblioteca de Objetos.' },
      { h: 'Primitivas Padrão', ul: ['Box, Sphere, Cylinder, Cone, Torus, Plane, Pyramid, Teapot, GeoSphere, Tube'] },
      { h: 'Primitivas Estendidas', ul: ['ChamferBox, ChamferCyl, OilTank, Capsule, Spindle, L-Ext, C-Ext, Gengon, Hedra, Torus Knot, RingWave, Hose'] },
      { h: 'Shapes', ul: ['Line, Rectangle, Circle, Ellipse, Arc, Donut, NGon, Star, Helix, Text (com Google Fonts, carregamento TTF/OTF, extrusão e chanfro)'] },
      { h: 'Objetos AEC', ul: ['Wall, Door, Window, Stairs, Railing, Foliage (árvores fractais procedurais)'] },
      { h: 'Objetos Compostos', ul: ['Boolean (União, Subtração, Interseção), Loft, Scatter, ProBoolean, Morph, Connect'] },
      { h: 'Criação Ortográfica', p: 'Clique-e-arraste funciona em qualquer viewport. Nas ortográficas, a base é desenhada no plano da tela e o deslocamento Y define a altura, como no 3ds Max.' },
    ],
    [
      { h: 'Regiões de Seleção', p: 'Rectangle, Circle, Fence, Lasso, Paint. Alterne entre Window (totalmente dentro) e Crossing (interseção parcial) na barra de ferramentas. Ignore Backfacing esconde faces ocultas.' },
      { h: 'Seleção Múltipla', p: 'Ctrl adiciona à seleção, Alt subtrai. A seleção permanece até você clicar em outro lugar.' },
      { h: 'Seleção de Sub-Objetos', p: 'A seleção por região também funciona em Vertex, Edge, Face, Poly, Element e knots de spline quando um modificador está em modo sub-objeto.' },
      { h: 'Ferramentas de Transformação', ul: ['Select and Move (W)', 'Select and Rotate (E)', 'Select and Scale (R)', 'Select and Link (hierarquia pai/filho)', 'Unlink Selection'] },
      { h: 'Type-In', p: 'Clique direito em qualquer botão de transformação da barra principal para abrir o diálogo Transform Type-In com entrada numérica.' },
      { h: 'Snap', p: 'Snaps Toggle (S) ativa snap para grade/vértice/aresta/face. Quando ativo, criação de Line e Wall força segmentos ortogonais alinhados à grade.' },
    ],
    [
      { p: 'A Pilha de Modificadores é totalmente não-destrutiva. Ao adicionar um modificador pelo painel Modify, ele vai para o topo da pilha e é selecionado automaticamente.' },
      { h: 'Deformadores', ul: ['Bend, Twist, Taper, Skew, Stretch, Noise, Wave, Ripple, Squeeze, Spherify, Push, Relax'] },
      { h: 'Free-Form', ul: ['FFD 2×2×2, 3×3×3, 4×4×4, FFD Box, FFD Cyl'] },
      { h: 'Topologia', ul: ['MeshSmooth, TurboSmooth, Subdivide, Tessellate, Optimize, Cap Holes, Symmetry, Mirror, Slice, Shell, Extrude, Bevel, Lathe, Skin, UVW Map, Unwrap UVW'] },
      { h: 'Gizmos', p: 'Modificadores como Bend, Twist, Taper e FFD expõem um sub-nível Gizmo / Center editável na viewport com as ferramentas Move/Rotate/Scale.' },
      { h: 'Editable Spline', p: 'Qualquer shape pode ser convertida em Editable Spline expondo sub-níveis Vertex / Segment / Spline com alças Bezier.' },
      { h: 'Editable Mesh / Poly', p: 'Converte geometria para edição por vértice/aresta/face com Extrude, Bevel, Chamfer, Cut, Weld, Bridge e Turn Edge.' },
    ],
    [
      { h: 'Material Editor R3', p: 'Grade de slots 6×4. Materiais usam modelos de sombreamento Standard (Blinn, Phong, Metal, Oren-Nayar, Anisotropic, Multi-Layer) com Ambient/Diffuse/Specular/Glossiness/Self-Illumination/Opacity.' },
      { h: 'Mapas', ul: ['Diffuse, Specular, Glossiness, Self-Illumination, Opacity, Bump, Normal, Reflection, Refraction, Displacement'] },
      { h: 'Mapas Procedurais', ul: ['Checker, Gradient, Gradient Ramp, Noise, Cellular, Marble, Wood, Speckle, Splat, Falloff, Mix, RGB Multiply, Composite, Bitmap'] },
      { h: 'Materiais Compostos', ul: ['Multi/Sub-Object (IDs por face)', 'Blend, Double Sided, Top/Bottom, Composite, Shellac, Matte/Shadow'] },
    ],
    [
      { h: 'Tipos de Luz', ul: ['Omni, Target Spot, Free Spot, Target Direct, Free Direct, Skylight'] },
      { h: 'Parâmetros Gerais', ul: ['On/Off, Cor, Multiplier, Cast Shadows, Afetar Diffuse / Specular / Ambient apenas, Lista Include/Exclude'] },
      { h: 'Attenuation', ul: ['Decay: None / Inverse / Inverse Square', 'Near Attenuation: Start / End', 'Far Attenuation: Start / End'] },
      { h: 'Spot / Direct', ul: ['Ângulos Hotspot / Falloff', 'Forma do cone: Circle / Rectangle', 'Aspect Ratio, Overshoot, mostrar gizmo do cone'] },
      { h: 'Sombras', ul: ['Shadow Map / Ray Traced / Advanced Ray Traced', 'Bias, Size, Sample Range'] },
      { h: 'Avançado', ul: ['Projector Map (imagem ou textura animada projetada pela luz)', 'Contrast, Soften Diffuse Edge'] },
    ],
    [
      { p: 'A renderização usa um engine em tempo real baseado em WebGL com shadow maps opcionais e efeitos de pós-produção.' },
      { h: 'Render Setup', ul: ['Saída: Single / Active Time Segment / Range / Frames', 'Resoluções: 320×240 → 1920×1080 e customizada', 'Arquivo: PNG / JPEG / MP4 (via MediaRecorder)'] },
      { h: 'Environment', ul: ['Fundo: cor / gradiente / bitmap / HDRI', 'Iluminação global: Ambient, Tint, Level', 'Exposure Control, Efeitos Atmosféricos (Fog, Volume Fog)'] },
      { h: 'Câmeras', ul: ['Free / Target camera, FOV, distância focal, planos de clipping, Depth of Field, Motion Blur'] },
    ],
    [
      { p: 'A timeline padrão tem 100 frames com interpolação Bezier cúbica. Auto Key liga/desliga gravação de chaves; Set Key exige inserção explícita.' },
      { h: 'Track View', ul: ['Dope Sheet: chaves por canal em uma grade Gantt', 'Curve Editor: edição de tangentes Bezier por parâmetro', 'Faixas de clip: coloque segmentos walk/run/idle e faça crossfade'] },
      { h: 'Controllers', ul: ['Bezier, Linear, TCB, Noise, Constraints (Position, Rotation, LookAt)'] },
      { h: 'Escopo de Undo', p: 'Edições na timeline (adicionar/mover/apagar chave, mudanças de clip) têm histórico próprio para que edições de cena não sejam perdidas.' },
    ],
    [
      { h: 'Bones e Rigs', p: 'Modelos skinned importados (FBX/glTF) expõem automaticamente um painel Bones com árvore hierárquica completa.' },
      { h: 'Manipulação', ul: ['Selecione bones pela árvore ou pelos gizmos de junta na cena', 'Move / Rotate / Scale por bone com histórico completo de undo', 'IK Solvers: HI Solver, HD Solver, Spline IK'] },
      { h: 'Blending de Animação', p: 'Vários clips baked (Walk, Run, Idle…) podem ser posicionados na faixa Gantt e cruzados para trocar de animação no meio da cena.' },
    ],
    [
      { p: 'WaltSculpt é o sistema híbrido de escultura direta em malhas do Walt3D, disponível como modificador e ferramenta.' },
      { h: 'Pincéis', ul: ['Draw, Clay, ClayStrips, Inflate, Crease, Pinch, Grab, Smooth, Flatten, Layer, Nudge, Mask'] },
      { h: 'Opções', ul: ['Raio, Força, curva de Falloff, Simetria X/Y/Z, Dyntopo (topologia dinâmica)', 'Cursor de pincel em screen-space com pré-visualização ao vivo'] },
      { h: 'Fluxo', p: 'A escultura é não-destrutiva quando aplicada pela pilha de modificadores; converter para Editable Poly baka a escultura na geometria.' },
    ],
    [
      { p: 'O Print3D Toolkit prepara malhas para impressão 3D (resina/FDM). Inclui preset da Elegoo Mars 2 Pro.' },
      { h: 'Ferramentas', ul: ['Mesa de impressão virtual com overlay do volume de construção', 'Auto-Orient, Hollow, Add Supports, Repair (fechar buracos, unificar normais, remover não-manifold)', 'Pré-visualização de fatiamento (por camada)', 'Estimativa de volume de resina / tempo de impressão'] },
    ],
    [
      { p: 'MapTools é o painel de edição de UVs (inspirado no TexTools).' },
      { h: 'Recursos', ul: ['Auto Unwrap, projeções Planar / Cylindrical / Spherical / Box', 'UV Pack, Align, Straighten, Relax, Stack Similar Shells', 'Material de pré-visualização Checker com densidade ajustável', 'Gerenciamento de tiles UDIM'] },
    ],
    [
      { h: 'Sistemas', ul: ['Spray, Snow, PArray, Blizzard, PCloud, Super Spray, Particle Flow (básico)'] },
      { h: 'Parâmetros do Emissor', ul: ['Rate, Speed, Direction, Variation, Life, Gravity, Wind, Deflectors'] },
      { h: 'Formas de Partícula', ul: ['Dot, Triangle, Facing quad, Sphere, Cube, Malha customizada'] },
    ],
    [
      { h: 'Formatos Suportados', ul: ['Importar: OBJ, GLTF, GLB, FBX, 3DS, DAE, STL, PLY, DWG, DXF, ZIP (bundles Sketchfab)', 'Exportar: OBJ, GLTF, GLB, STL, PLY'] },
      { h: 'Bundles ZIP', p: 'Solte um arquivo ZIP contendo o modelo e suas texturas. O Walt3D extrai cada arquivo, resolve referências relativas de textura via LoadingManager e reidrata o arquivo do IndexedDB no recarregamento.' },
    ],
    [
      { h: 'Preferences', p: 'Customize → Preferences abre o diálogo com abas (General, Files, Viewports, Gamma, Rendering, Animation, Inverse Kinematics, Gizmos).' },
      { h: 'Customize UI', ul: ['Editor de Hotkeys com busca e detecção de conflitos', 'Editor de cores da UI (color pickers por token, persistidos no localStorage)'] },
      { h: 'Idioma', p: 'Customize → Language troca imediatamente todos os textos da UI, diálogos e páginas de ajuda entre inglês, português e espanhol.' },
      { h: 'Temas', p: 'Customize → Interface oferece os temas visuais Classic (3ds Max R3), Flat e Game.' },
    ],
  ],
};

const maxscript_pt: HelpPage = {
  title: 'Referência MAXScript',
  intro: 'MAXScript é a linguagem de script embutida no Walt3D. Ela replica um subconjunto do MAXScript do 3ds Max para automação de cena, operações em lote e ferramentas customizadas. Abra o Listener em MAXScript → MAXScript Listener.',
  sectionTitles: ['1. Básico', '2. Variáveis e Tipos', '3. Acesso à Cena', '4. Criando Objetos', '5. Transformações', '6. Modificadores', '7. Iteração', '8. Renderização', '9. Funções Utilitárias'],
  sections: [
    [
      { p: 'As instruções são por linha. Uma linha começando com -- é comentário. Blocos usam parênteses. Atribuições usam =. O Listener imprime o valor da última expressão.' },
      { code: '-- Olá Walt3D\n"olá" + " " + "mundo"\n-- Resultado: "olá mundo"' },
    ],
    [
      { p: 'Tipos: integer, float, string, boolean (true/false), array (#(...)), point3 [x,y,z], color, node.' },
      { code: 'a = 10\nb = 3.14\nnome = "MinhaCaixa"\npos = [10, 0, 5]\ncor = color 255 128 0' },
    ],
    [
      { ul: ['objects — array com todos os nós da cena', 'selection — nós selecionados', '$nome — buscar por nome', '$* — todos os objetos (wildcard)'] },
      { code: 'for o in objects do print o.name\n$Box01.pos = [0,0,10]' },
    ],
    [{ code: 'b = box length:20 width:20 height:20\ns = sphere radius:10 pos:[30,0,10]\nc = cylinder radius:5 height:30' }],
    [{ ul: ['obj.pos — posição [x,y,z]', 'obj.rotation — quaternion ou euler', 'obj.scale — [sx,sy,sz]', 'move obj [dx,dy,dz]', 'rotate obj (angleaxis 45 [0,0,1])', 'scale obj [2,2,2]'] }],
    [{ code: 'addModifier $Box01 (Bend angle:45 direction:0 axis:2)\naddModifier selection (TurboSmooth iterations:2)' }],
    [{ code: 'for i = 1 to 5 do (\n  b = box height:i*10 pos:[i*30, 0, 0]\n)\nwhile $Box01.pos.z < 100 do move $Box01 [0,0,1]' }],
    [{ ul: ['render() — abre o Render Setup', 'renderCurrentFrame() — renderiza a viewport ativa', 'renderRange 0 100 outputPath:"out.png"'] }],
    [{ ul: ['print valor — imprime no Listener', 'format "% em %\\n" node.name node.pos', 'delete obj — remove da cena', 'clone obj — duplica', 'group selection — cria grupo'] }],
  ],
};

const tutorials_pt: HelpPage = {
  title: 'Tutoriais Walt3D',
  intro: 'Lições passo-a-passo cobrindo as tarefas mais comuns. Cada lição indica os menus, painéis e atalhos exatos que serão usados.',
  sectionTitles: [
    'Tutorial 1 — Sua Primeira Cena',
    'Tutorial 2 — Trabalhando com Modificadores',
    'Tutorial 3 — Materiais e Texturas',
    'Tutorial 4 — Iluminação e Renderização',
    'Tutorial 5 — Animando um Personagem',
    'Tutorial 6 — Escultura com WaltSculpt',
    'Tutorial 7 — Preparando uma Impressão (Elegoo Mars 2 Pro)',
    'Tutorial 8 — Importando um ZIP do Sketchfab',
  ],
  sections: [
    [{ p: 'Objetivo: criar uma mesa simples sobre o plano do chão.' },
     { ul: [
       'Create → Standard Primitives → Box. Arraste na viewport Top para criar um tampo 100×60×5.',
       'Crie quatro Cylinders (raio 3, altura 40) — posicione em cada canto (clique direito num botão de transformação para entrada numérica).',
       'Selecione as quatro pernas, Ctrl+Clique no tampo para incluí-lo, então Group → Group para combinar.',
       'Salve em File → Save As.',
     ] }],
    [{ p: 'Objetivo: aplicar Bend a uma Box alta.' },
     { ul: [
       'Crie uma Box: length 10, width 10, height 100, height segments 20.',
       'Painel Modify → Bend. Angle 90, Bend Axis Z.',
       'Expanda o modificador na pilha, escolha o sub-nível Gizmo e rotacione-o para mudar o eixo do bend interativamente.',
     ] }],
    [{ ul: [
      'M abre o Material Editor R3.',
      'Pegue o primeiro slot, defina a cor Diffuse, então clique no quadradinho ao lado de Diffuse para adicionar um mapa Bitmap.',
      'Arraste o material para o objeto (ou clique em Assign to Selection).',
      'Adicione um mapa Bump a 30% de força para detalhes de superfície.',
    ] }],
    [{ ul: [
      'Create → Lights → Target Spot. Posicione a fonte acima e o alvo no assunto.',
      'Ative Cast Shadows (Shadow Map). Ajuste Hotspot / Falloff do cone.',
      'Rendering → Render Setup. Escolha 1280×720, PNG, clique em Render.',
    ] }],
    [{ ul: [
      'Importe um personagem FBX com animação (Mixamo funciona diretamente).',
      'Abra o painel Bones — clique em um bone de membro para selecioná-lo.',
      'Ative Auto Key, arraste a timeline, rotacione o bone no frame 20 — uma chave é gravada automaticamente.',
      'Abra Track View → Curve Editor para ajustar tangentes.',
    ] }],
    [{ ul: [
      'Selecione uma Sphere com segmentos suficientes (32+).',
      'Adicione o modificador WaltSculpt — o cursor de pincel aparece ao passar sobre a malha.',
      'Escolha o pincel Draw, defina Raio e Força, ative Simetria X.',
      'Pinte sobre a malha para esculpir.',
    ] }],
    [{ ul: [
      'Create → Print3D → Print Bed. Escolha o preset Elegoo Mars 2 Pro.',
      'Solte o modelo sobre a mesa — o overlay mostra se cabe.',
      'Painel Print3D → Auto-Orient, então Hollow (casca 2mm) e Add Supports.',
      'Exporte STL para fatiar (ou use o preview de slice embutido).',
    ] }],
    [{ ul: [
      'File → Import. Escolha um .zip baixado do Sketchfab.',
      'O Walt3D extrai cada arquivo, resolve texturas e buffers .bin automaticamente.',
      'Se o modelo aparecer sem textura, confirme que o arquivo contém os arquivos referenciados em qualquer subpasta — o Walt3D também casa pelo nome do arquivo.',
    ] }],
  ],
};

const shortcuts_pt: HelpPage = {
  title: 'Atalhos de Teclado',
  intro: 'Atalhos padrão do teclado. Todas as teclas podem ser personalizadas em Customize → Customize UI → Hotkeys.',
  sectionTitles: ['Arquivo e Edição', 'Seleção e Transformação', 'Viewport', 'Animação', 'Sub-Objetos', 'Painéis'],
  sections: [
    [{ ul: ['Ctrl+N — Nova Cena', 'Ctrl+O — Abrir', 'Ctrl+S — Salvar', 'Ctrl+Shift+S — Salvar Como', 'Ctrl+Z — Desfazer', 'Ctrl+Y — Refazer', 'Delete — Excluir seleção'] }],
    [{ ul: ['Q — Selecionar', 'W — Mover', 'E — Rotacionar', 'R — Escala', 'Ctrl+A — Selecionar Tudo', 'Ctrl+D — Deselecionar', 'Ctrl+I — Inverter Seleção', 'S — Snap Toggle', 'H — Selecionar por Nome'] }],
    [{ ul: ['Alt+W — Alternar Viewport Ativa (Maximizar)', 'Ctrl+P — Perspectiva', 'Ctrl+T — Topo', 'Ctrl+F — Frontal', 'Ctrl+L — Esquerda', 'Z — Zoom Extents', 'F3 — Alternar Wireframe / Suave', 'F4 — Alternar Edged Faces'] }],
    [{ ul: ['N — Auto Key', 'K — Set Key', ', — Frame Anterior', '. — Próximo Frame', '/ — Play / Pause'] }],
    [{ ul: ['1 — Vértice', '2 — Aresta', '3 — Face', '4 — Polígono', '5 — Elemento'] }],
    [{ ul: ['M — Material Editor', 'F10 — Render Setup', 'Shift+Q — Renderização Rápida', 'F11 — Tela Cheia da App'] }],
  ],
};

const whatsNew_pt: HelpPage = {
  title: 'Novidades do Walt3D',
  intro: 'Adições e melhorias recentes ao Walt3D.',
  sectionTitles: ['Modelagem', 'Animação', 'Materiais e Iluminação', 'Import/Export', 'UI e Preferências'],
  sections: [
    [{ ul: [
      'Sistema de escultura híbrida WaltSculpt com topologia dinâmica e simetria.',
      'Editable Spline / Editable Mesh com todos os sub-níveis.',
      'Conjunto completo de modificadores (Bend, Twist, FFD, Shell, Symmetry, Mirror, Slice, Lathe, Bevel, Skin, UVW Map, Unwrap UVW…) com controles de Gizmo/Center na viewport.',
      'Print3D Toolkit para impressão resina/FDM com preset Elegoo Mars 2 Pro.',
    ] }],
    [{ ul: [
      'Track View com Dope Sheet e Curve Editor.',
      'Faixa Gantt de clips para organizar e fazer crossfade entre clips baked.',
      'Undo com escopo na timeline — edições de chave não perdem mais modelos importados.',
    ] }],
    [{ ul: [
      'Material Editor R3 com Standard, Multi/Sub-Object, Blend, Double Sided, Top/Bottom, Composite, Shellac, Matte/Shadow.',
      'Sistema completo de luzes estilo 3ds Max com attenuation, projector maps e controles de sombra.',
    ] }],
    [{ ul: [
      'Importação de bundles ZIP (estilo Sketchfab) com resolução automática de texturas.',
      'Importação DWG / DXF para fluxos CAD.',
    ] }],
    [{ ul: [
      'Suporte multi-idioma: inglês, português, espanhol (auto-tradução em toda a aplicação).',
      'Customize UI: editor de hotkeys e editor de cores por token.',
      'Layout Quad como padrão com layouts alternativos em Views → Viewport Layout.',
    ] }],
  ],
};

// ============================================================================
// ES translations
// ============================================================================
const userRef_es: HelpPage = {
  title: 'Walt3D — Referencia del Usuario',
  intro: 'Walt3D es un estudio 3D basado en navegador para modelado, animación y renderizado, inspirado en el flujo de trabajo de 3ds Max R3–2024. Esta referencia describe cada panel y herramienta de la versión actual.',
  sectionTitles: [
    '1. Visión General de la Interfaz', '2. Creando Objetos', '3. Selección y Transformación',
    '4. Pila de Modificadores', '5. Materiales y Mapas', '6. Iluminación',
    '7. Cámaras y Renderizado', '8. Animación y Timeline', '9. Rigging y Personajes',
    '10. WaltSculpt', '11. Print3D Toolkit', '12. MapTools (UV)',
    '13. Sistemas de Partículas', '14. Importar / Exportar', '15. Personalización',
  ],
  sections: [
    [
      { p: 'La interfaz de Walt3D reproduce el layout clásico de 3ds Max R3: menú superior, barra de herramientas principal, cuadrícula de viewports al centro, Panel de Comandos a la derecha y la línea de tiempo con la barra de estado abajo.' },
      { h: 'Cuadrícula de Viewports', p: 'El layout predeterminado es Quad view: tres wireframes ortográficos (Top, Front, Left) y una perspectiva con sombreado suave. Layouts alternativos (Single, 2 columnas, 2 filas) están en Views → Viewport Layout.' },
      { h: 'Viewport Activo', p: 'Al hacer clic en una viewport se activa y muestra un borde amarillo. El botón inferior derecho alterna entre Quad y Viewport Activo Maximizado (Alt+W). El botón de la barra de título alterna pantalla completa.' },
      { h: 'Panel de Comandos', p: 'El panel de la derecha alterna entre Create, Modify, Hierarchy, Motion, Display y Utilities — las mismas pestañas de 3ds Max.' },
    ],
    [
      { p: 'Crea objetos en Create → Geometry o arrastrándolos desde la Biblioteca de Objetos.' },
      { h: 'Primitivas Estándar', ul: ['Box, Sphere, Cylinder, Cone, Torus, Plane, Pyramid, Teapot, GeoSphere, Tube'] },
      { h: 'Primitivas Extendidas', ul: ['ChamferBox, ChamferCyl, OilTank, Capsule, Spindle, L-Ext, C-Ext, Gengon, Hedra, Torus Knot, RingWave, Hose'] },
      { h: 'Shapes', ul: ['Line, Rectangle, Circle, Ellipse, Arc, Donut, NGon, Star, Helix, Text (con Google Fonts, carga TTF/OTF, extrusión y bisel)'] },
      { h: 'Objetos AEC', ul: ['Wall, Door, Window, Stairs, Railing, Foliage (árboles fractales procedurales)'] },
      { h: 'Objetos Compuestos', ul: ['Boolean (Unión, Sustracción, Intersección), Loft, Scatter, ProBoolean, Morph, Connect'] },
      { h: 'Creación Ortográfica', p: 'Clic-y-arrastrar funciona en cualquier viewport. En las ortográficas la base se dibuja en el plano de pantalla y el desplazamiento Y define la altura, como en 3ds Max.' },
    ],
    [
      { h: 'Regiones de Selección', p: 'Rectangle, Circle, Fence, Lasso, Paint. Alterna entre Window (totalmente dentro) y Crossing (intersección parcial) desde la barra de herramientas. Ignore Backfacing oculta caras traseras.' },
      { h: 'Selección Múltiple', p: 'Ctrl añade a la selección, Alt resta. La selección permanece hasta hacer clic en otro lado.' },
      { h: 'Sub-Objetos', p: 'La selección por región también funciona en Vertex, Edge, Face, Poly, Element y knots de spline con un modificador en modo sub-objeto.' },
      { h: 'Herramientas de Transformación', ul: ['Select and Move (W)', 'Select and Rotate (E)', 'Select and Scale (R)', 'Select and Link (jerarquía padre/hijo)', 'Unlink Selection'] },
      { h: 'Type-In', p: 'Clic derecho sobre cualquier botón de transformación abre el diálogo Transform Type-In para entrada numérica.' },
      { h: 'Snap', p: 'Snaps Toggle (S) activa snap a rejilla/vértice/arista/cara. Cuando está activo, la creación de Line y Wall fuerza segmentos ortogonales alineados a la rejilla.' },
    ],
    [
      { p: 'La Pila de Modificadores es totalmente no destructiva. Al añadir un modificador desde el panel Modify aparece encima de la pila y queda seleccionado automáticamente.' },
      { h: 'Deformadores', ul: ['Bend, Twist, Taper, Skew, Stretch, Noise, Wave, Ripple, Squeeze, Spherify, Push, Relax'] },
      { h: 'Free-Form', ul: ['FFD 2×2×2, 3×3×3, 4×4×4, FFD Box, FFD Cyl'] },
      { h: 'Topología', ul: ['MeshSmooth, TurboSmooth, Subdivide, Tessellate, Optimize, Cap Holes, Symmetry, Mirror, Slice, Shell, Extrude, Bevel, Lathe, Skin, UVW Map, Unwrap UVW'] },
      { h: 'Gizmos', p: 'Modificadores como Bend, Twist, Taper y FFD exponen un sub-nivel Gizmo / Center editable en la viewport con Move/Rotate/Scale.' },
      { h: 'Editable Spline', p: 'Cualquier shape puede convertirse en Editable Spline exponiendo sub-niveles Vertex / Segment / Spline con tiradores Bezier.' },
      { h: 'Editable Mesh / Poly', p: 'Convierte la geometría a edición por vértice/arista/cara con Extrude, Bevel, Chamfer, Cut, Weld, Bridge y Turn Edge.' },
    ],
    [
      { h: 'Material Editor R3', p: 'Cuadrícula de 6×4 slots. Materiales con modelos Standard (Blinn, Phong, Metal, Oren-Nayar, Anisotropic, Multi-Layer) con Ambient/Diffuse/Specular/Glossiness/Self-Illumination/Opacity.' },
      { h: 'Mapas', ul: ['Diffuse, Specular, Glossiness, Self-Illumination, Opacity, Bump, Normal, Reflection, Refraction, Displacement'] },
      { h: 'Mapas Procedurales', ul: ['Checker, Gradient, Gradient Ramp, Noise, Cellular, Marble, Wood, Speckle, Splat, Falloff, Mix, RGB Multiply, Composite, Bitmap'] },
      { h: 'Materiales Compuestos', ul: ['Multi/Sub-Object (IDs por cara)', 'Blend, Double Sided, Top/Bottom, Composite, Shellac, Matte/Shadow'] },
    ],
    [
      { h: 'Tipos de Luz', ul: ['Omni, Target Spot, Free Spot, Target Direct, Free Direct, Skylight'] },
      { h: 'Parámetros Generales', ul: ['On/Off, Color, Multiplier, Cast Shadows, Afectar Diffuse / Specular / Ambient, Lista Include/Exclude'] },
      { h: 'Atenuación', ul: ['Decay: None / Inverse / Inverse Square', 'Near Attenuation: Start / End', 'Far Attenuation: Start / End'] },
      { h: 'Spot / Direct', ul: ['Ángulos Hotspot / Falloff', 'Forma del cono: Circle / Rectangle', 'Aspect Ratio, Overshoot, gizmo de cono'] },
      { h: 'Sombras', ul: ['Shadow Map / Ray Traced / Advanced Ray Traced', 'Bias, Size, Sample Range'] },
      { h: 'Avanzado', ul: ['Projector Map (imagen o textura animada proyectada)', 'Contrast, Soften Diffuse Edge'] },
    ],
    [
      { p: 'El renderizado usa un motor en tiempo real basado en WebGL con shadow maps opcionales y efectos de post.' },
      { h: 'Render Setup', ul: ['Salida: Single / Active Time Segment / Range / Frames', 'Resoluciones: 320×240 → 1920×1080 y personalizada', 'Archivo: PNG / JPEG / MP4 (vía MediaRecorder)'] },
      { h: 'Environment', ul: ['Fondo: color / gradiente / bitmap / HDRI', 'Iluminación global: Ambient, Tint, Level', 'Exposure Control, Efectos Atmosféricos (Fog, Volume Fog)'] },
      { h: 'Cámaras', ul: ['Free / Target camera, FOV, distancia focal, planos de clipping, Depth of Field, Motion Blur'] },
    ],
    [
      { p: 'La timeline predeterminada tiene 100 frames con interpolación Bezier cúbica. Auto Key alterna la grabación de claves; Set Key requiere colocación explícita.' },
      { h: 'Track View', ul: ['Dope Sheet: claves por canal en cuadrícula Gantt', 'Curve Editor: edición de tangentes Bezier por parámetro', 'Pistas de clip: coloca segmentos walk/run/idle con crossfade'] },
      { h: 'Controllers', ul: ['Bezier, Linear, TCB, Noise, Constraints (Position, Rotation, LookAt)'] },
      { h: 'Alcance del Undo', p: 'Las ediciones en la timeline tienen historial propio para no perder ediciones de escena.' },
    ],
    [
      { h: 'Bones y Rigs', p: 'Los modelos skinned importados (FBX/glTF) exponen automáticamente un panel Bones con árbol jerárquico completo.' },
      { h: 'Manipulación', ul: ['Selecciona bones desde el árbol o desde los gizmos de junta en la escena', 'Move / Rotate / Scale por bone con historial de undo', 'IK Solvers: HI Solver, HD Solver, Spline IK'] },
      { h: 'Blending de Animación', p: 'Varios clips baked (Walk, Run, Idle…) pueden colocarse en la pista Gantt y cruzarse para cambiar animación en mitad de escena.' },
    ],
    [
      { p: 'WaltSculpt es el sistema híbrido de escultura directa de Walt3D, disponible como modificador y como herramienta.' },
      { h: 'Pinceles', ul: ['Draw, Clay, ClayStrips, Inflate, Crease, Pinch, Grab, Smooth, Flatten, Layer, Nudge, Mask'] },
      { h: 'Opciones', ul: ['Radio, Fuerza, curva de Falloff, Simetría X/Y/Z, Dyntopo (topología dinámica)', 'Cursor de pincel en screen-space con previsualización en vivo'] },
      { h: 'Flujo', p: 'La escultura es no destructiva desde la pila de modificadores; convertir a Editable Poly hornea la escultura en la geometría.' },
    ],
    [
      { p: 'El Print3D Toolkit prepara mallas para impresión 3D (resina/FDM). Incluye preset para Elegoo Mars 2 Pro.' },
      { h: 'Herramientas', ul: ['Mesa virtual con overlay del volumen de construcción', 'Auto-Orient, Hollow, Add Supports, Repair', 'Previsualización de slicing por capas', 'Estimación de volumen de resina / tiempo de impresión'] },
    ],
    [
      { p: 'MapTools es el panel de edición de UVs (inspirado en TexTools).' },
      { h: 'Características', ul: ['Auto Unwrap, proyecciones Planar / Cylindrical / Spherical / Box', 'UV Pack, Align, Straighten, Relax, Stack Similar Shells', 'Material Checker de previsualización con densidad ajustable', 'Gestión de tiles UDIM'] },
    ],
    [
      { h: 'Sistemas', ul: ['Spray, Snow, PArray, Blizzard, PCloud, Super Spray, Particle Flow (básico)'] },
      { h: 'Parámetros del Emisor', ul: ['Rate, Speed, Direction, Variation, Life, Gravity, Wind, Deflectors'] },
      { h: 'Formas de Partícula', ul: ['Dot, Triangle, Facing quad, Sphere, Cube, Malla personalizada'] },
    ],
    [
      { h: 'Formatos Soportados', ul: ['Importar: OBJ, GLTF, GLB, FBX, 3DS, DAE, STL, PLY, DWG, DXF, ZIP (bundles Sketchfab)', 'Exportar: OBJ, GLTF, GLB, STL, PLY'] },
      { h: 'Bundles ZIP', p: 'Suelta un ZIP con el modelo y sus texturas. Walt3D extrae cada archivo, resuelve referencias relativas mediante LoadingManager y rehidrata el archivo desde IndexedDB al recargar.' },
    ],
    [
      { h: 'Preferences', p: 'Customize → Preferences abre el diálogo por pestañas (General, Files, Viewports, Gamma, Rendering, Animation, Inverse Kinematics, Gizmos).' },
      { h: 'Customize UI', ul: ['Editor de Hotkeys con búsqueda y detección de conflictos', 'Editor de colores UI (color pickers por token, guardados en localStorage)'] },
      { h: 'Idioma', p: 'Customize → Language cambia inmediatamente todos los textos de la UI, diálogos y páginas de ayuda entre inglés, portugués y español.' },
      { h: 'Temas', p: 'Customize → Interface ofrece los temas Classic (3ds Max R3), Flat y Game.' },
    ],
  ],
};

const maxscript_es: HelpPage = {
  title: 'Referencia MAXScript',
  intro: 'MAXScript es el lenguaje de script embebido en Walt3D. Replica un subconjunto del MAXScript de 3ds Max para automatización de escena, operaciones por lotes y herramientas personalizadas. Abre el Listener en MAXScript → MAXScript Listener.',
  sectionTitles: ['1. Básico', '2. Variables y Tipos', '3. Acceso a la Escena', '4. Creando Objetos', '5. Transformaciones', '6. Modificadores', '7. Iteración', '8. Renderizado', '9. Funciones Utilitarias'],
  sections: [
    [{ p: 'Las instrucciones son por línea. Una línea que empieza con -- es comentario. Los bloques usan paréntesis. Asignación con =. El Listener imprime el valor de la última expresión.' },
     { code: '-- Hola Walt3D\n"hola" + " " + "mundo"\n-- Resultado: "hola mundo"' }],
    [{ p: 'Tipos: integer, float, string, boolean, array (#(...)), point3 [x,y,z], color, node.' },
     { code: 'a = 10\nb = 3.14\nnombre = "MiCaja"\npos = [10, 0, 5]\ncol = color 255 128 0' }],
    [{ ul: ['objects — array con todos los nodos', 'selection — nodos seleccionados', '$nombre — buscar por nombre', '$* — todos (wildcard)'] },
     { code: 'for o in objects do print o.name\n$Box01.pos = [0,0,10]' }],
    [{ code: 'b = box length:20 width:20 height:20\ns = sphere radius:10 pos:[30,0,10]\nc = cylinder radius:5 height:30' }],
    [{ ul: ['obj.pos, obj.rotation, obj.scale', 'move obj [dx,dy,dz]', 'rotate obj (angleaxis 45 [0,0,1])', 'scale obj [2,2,2]'] }],
    [{ code: 'addModifier $Box01 (Bend angle:45 direction:0 axis:2)\naddModifier selection (TurboSmooth iterations:2)' }],
    [{ code: 'for i = 1 to 5 do (\n  b = box height:i*10 pos:[i*30, 0, 0]\n)\nwhile $Box01.pos.z < 100 do move $Box01 [0,0,1]' }],
    [{ ul: ['render() — abre Render Setup', 'renderCurrentFrame() — renderiza viewport activo', 'renderRange 0 100 outputPath:"out.png"'] }],
    [{ ul: ['print valor — imprime en Listener', 'format "% en %\\n" node.name node.pos', 'delete obj — elimina', 'clone obj — duplica', 'group selection — crea grupo'] }],
  ],
};

const tutorials_es: HelpPage = {
  title: 'Tutoriales Walt3D',
  intro: 'Lecciones paso a paso cubriendo las tareas más comunes. Cada lección indica los menús, paneles y atajos exactos que se usarán.',
  sectionTitles: [
    'Tutorial 1 — Tu Primera Escena',
    'Tutorial 2 — Trabajando con Modificadores',
    'Tutorial 3 — Materiales y Texturas',
    'Tutorial 4 — Iluminación y Renderizado',
    'Tutorial 5 — Animando un Personaje',
    'Tutorial 6 — Escultura con WaltSculpt',
    'Tutorial 7 — Preparando una Impresión (Elegoo Mars 2 Pro)',
    'Tutorial 8 — Importando un ZIP de Sketchfab',
  ],
  sections: [
    [{ p: 'Objetivo: crear una mesa simple sobre el suelo.' },
     { ul: [
       'Create → Standard Primitives → Box. Arrastra en la viewport Top para crear una tapa 100×60×5.',
       'Crea cuatro Cylinders (radio 3, altura 40) en cada esquina (clic derecho en un botón de transformación para entrada numérica).',
       'Selecciona las patas, Ctrl+Clic en la tapa, luego Group → Group.',
       'Guarda con File → Save As.',
     ] }],
    [{ p: 'Objetivo: aplicar Bend a una Box alta.' },
     { ul: [
       'Crea una Box: length 10, width 10, height 100, height segments 20.',
       'Panel Modify → Bend. Angle 90, Bend Axis Z.',
       'Expande el modificador, elige sub-nivel Gizmo y rótalo para cambiar el eje del bend en tiempo real.',
     ] }],
    [{ ul: [
      'M abre el Material Editor R3.',
      'Elige el primer slot, define color Diffuse, luego pulsa el cuadrado junto a Diffuse para añadir un Bitmap.',
      'Arrastra el material al objeto (o Assign to Selection).',
      'Añade un Bump al 30% para detalle superficial.',
    ] }],
    [{ ul: [
      'Create → Lights → Target Spot. Coloca fuente arriba y objetivo sobre el sujeto.',
      'Activa Cast Shadows (Shadow Map). Ajusta Hotspot / Falloff.',
      'Rendering → Render Setup. 1280×720, PNG, Render.',
    ] }],
    [{ ul: [
      'Importa un personaje FBX con animación (Mixamo funciona directo).',
      'Abre el panel Bones — clic en un bone para seleccionar.',
      'Activa Auto Key, arrastra la timeline, rota el bone en el frame 20 — la clave se graba sola.',
      'Abre Track View → Curve Editor para afinar tangentes.',
    ] }],
    [{ ul: [
      'Selecciona una Sphere con segmentos suficientes (32+).',
      'Añade el modificador WaltSculpt — el cursor de pincel aparece sobre la malla.',
      'Elige Draw, ajusta Radio y Fuerza, activa Simetría X.',
      'Pinta sobre la malla para esculpir.',
    ] }],
    [{ ul: [
      'Create → Print3D → Print Bed. Elige el preset Elegoo Mars 2 Pro.',
      'Suelta el modelo sobre la mesa — el overlay indica si cabe.',
      'Panel Print3D → Auto-Orient, luego Hollow (2mm) y Add Supports.',
      'Exporta STL para el slicer (o usa la previsualización interna).',
    ] }],
    [{ ul: [
      'File → Import. Elige un .zip descargado de Sketchfab.',
      'Walt3D extrae cada archivo, resuelve texturas y buffers .bin automáticamente.',
      'Si el modelo aparece sin texturas, revisa que el ZIP contenga los archivos referenciados en alguna subcarpeta — Walt3D también empareja por nombre.',
    ] }],
  ],
};

const shortcuts_es: HelpPage = {
  title: 'Atajos de Teclado',
  intro: 'Atajos predeterminados. Todas las teclas se pueden personalizar en Customize → Customize UI → Hotkeys.',
  sectionTitles: ['Archivo y Edición', 'Selección y Transformación', 'Viewport', 'Animación', 'Sub-Objetos', 'Paneles'],
  sections: [
    [{ ul: ['Ctrl+N — Nueva Escena', 'Ctrl+O — Abrir', 'Ctrl+S — Guardar', 'Ctrl+Shift+S — Guardar Como', 'Ctrl+Z — Deshacer', 'Ctrl+Y — Rehacer', 'Delete — Eliminar selección'] }],
    [{ ul: ['Q — Seleccionar', 'W — Mover', 'E — Rotar', 'R — Escalar', 'Ctrl+A — Seleccionar Todo', 'Ctrl+D — Deseleccionar', 'Ctrl+I — Invertir', 'S — Snap Toggle', 'H — Seleccionar por Nombre'] }],
    [{ ul: ['Alt+W — Alternar Viewport Activo', 'Ctrl+P — Perspectiva', 'Ctrl+T — Top', 'Ctrl+F — Front', 'Ctrl+L — Left', 'Z — Zoom Extents', 'F3 — Wireframe / Suave', 'F4 — Edged Faces'] }],
    [{ ul: ['N — Auto Key', 'K — Set Key', ', — Frame Anterior', '. — Frame Siguiente', '/ — Play / Pausa'] }],
    [{ ul: ['1 — Vértice', '2 — Arista', '3 — Cara', '4 — Polígono', '5 — Elemento'] }],
    [{ ul: ['M — Material Editor', 'F10 — Render Setup', 'Shift+Q — Render Rápido', 'F11 — Pantalla Completa'] }],
  ],
};

const whatsNew_es: HelpPage = {
  title: 'Novedades de Walt3D',
  intro: 'Adiciones y mejoras recientes en Walt3D.',
  sectionTitles: ['Modelado', 'Animación', 'Materiales e Iluminación', 'Importar/Exportar', 'UI y Preferencias'],
  sections: [
    [{ ul: [
      'Sistema de escultura híbrida WaltSculpt con dyntopo y simetría.',
      'Editable Spline / Editable Mesh con todos los sub-niveles.',
      'Set completo de modificadores con controles Gizmo/Center en la viewport.',
      'Print3D Toolkit con preset Elegoo Mars 2 Pro.',
    ] }],
    [{ ul: [
      'Track View con Dope Sheet y Curve Editor.',
      'Pista Gantt de clips con crossfade de animaciones baked.',
      'Undo con alcance en la timeline: las ediciones de claves ya no pierden modelos importados.',
    ] }],
    [{ ul: [
      'Material Editor R3 completo con materiales compuestos.',
      'Sistema de luces estilo 3ds Max con atenuación, projector maps y sombras.',
    ] }],
    [{ ul: [
      'Importación de bundles ZIP (estilo Sketchfab) con resolución automática de texturas.',
      'Importación DWG / DXF.',
    ] }],
    [{ ul: [
      'Multi-idioma: inglés, portugués, español.',
      'Customize UI: editor de hotkeys y colores por token.',
      'Quad view por defecto y layouts alternativos.',
    ] }],
  ],
};

// ---------------------------------------------------------------------------
// Aggregate.
// ---------------------------------------------------------------------------
const PAGES: Record<HelpTopic, Record<Lang, HelpPage>> = {
  'user-reference':      { en: userRef_en,   pt: userRef_pt,   es: userRef_es },
  'maxscript-reference': { en: maxscript_en, pt: maxscript_pt, es: maxscript_es },
  'tutorials':           { en: tutorials_en, pt: tutorials_pt, es: tutorials_es },
  'shortcuts':           { en: shortcuts_en, pt: shortcuts_pt, es: shortcuts_es },
  'whats-new':           { en: whatsNew_en,  pt: whatsNew_pt,  es: whatsNew_es },
};

// ---------------------------------------------------------------------------
// Component.
// ---------------------------------------------------------------------------
export const HelpDialog = ({ open, topic, onClose }: {
  open: boolean;
  topic: HelpTopic;
  onClose: () => void;
}) => {
  const { lang } = useLanguage();
  const page = useMemo(() => PAGES[topic][lang] ?? PAGES[topic].en, [topic, lang]);
  const [active, setActive] = useState(0);

  // Reset section index when topic changes.
  useMemo(() => setActive(0), [topic, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <R3Dialog open={open} onClose={onClose} title={page.title} width={780}>
      <div className="flex gap-2" style={{ minHeight: 420 }}>
        {/* TOC */}
        <div className="bevel-inset bg-white p-1" style={{ width: 220, overflowY: 'auto', maxHeight: 500 }}>
          {page.sectionTitles.map((tt, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`w-full text-left text-[11px] px-2 py-1 ${active === i ? 'bg-menu-active text-menu-hover-fg' : 'hover:bg-menu-hover hover:text-menu-hover-fg'}`}
              style={{ borderRadius: 0 }}
            >
              {tt}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bevel-inset bg-white flex-1 p-3" style={{ overflowY: 'auto', maxHeight: 500 }}>
          {active === 0 && (
            <div className="mb-3 text-[11px] italic text-win-text/80 border-b border-win-shadow pb-2">
              {page.intro}
            </div>
          )}
          <h2 className="text-[13px] font-bold text-win-text mb-2">{page.sectionTitles[active]}</h2>
          <div className="space-y-2">
            {(page.sections[active] ?? []).map((b, i) => (
              <div key={i}>
                {b.h && <h3 className="text-[11px] font-bold text-win-text mt-2">{b.h}</h3>}
                {b.p && <p className="text-[11px] text-win-text leading-relaxed">{b.p}</p>}
                {b.ul && (
                  <ul className="list-disc pl-5 text-[11px] text-win-text space-y-0.5">
                    {b.ul.map((it, j) => <li key={j}>{it}</li>)}
                  </ul>
                )}
                {b.code && (
                  <pre className="bg-black text-green-300 text-[10px] p-2 mt-1 overflow-x-auto font-mono whitespace-pre">
                    {b.code}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </R3Dialog>
  );
};
