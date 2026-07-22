## Objetivo
Resolver 3 problemas:
1. Wireframe das viewports ficando preto — deve manter a cor de cada objeto.
2. Luzes vindas de GLB importado sem ícone/gizmo para selecionar e mover.
3. Cena não persiste ao recarregar a página (sem autosave).

O sub-agente de exploração ainda está mapeando os pontos exatos; a implementação fará os ajustes nos arquivos que ele apontar. A causa raiz de cada item será confirmada antes de mudar código.

## 1. Wireframe colorido por objeto
Em `Scene3D.tsx` / `Object3D.tsx`, no ramo do `renderMode === 'wireframe'`:
- Ao invés de um material único preto/cinza global, usar a cor do próprio material do objeto (`material.color` do standard/multi-sub, ou `wireColor` salvo no objeto, ou fallback para uma paleta 3ds Max: amarelo p/ selecionados, verde-oliva para geometry, azul-claro para shapes/splines, roxo p/ lights, ciano p/ cameras).
- Aplicar via `MeshBasicMaterial({ color, wireframe: true, fog: true })` ou setando `wireframe=true` no material clonado preservando a cor.
- Objetos importados (GLB) que não têm cor definida no state usam a cor do material original.

## 2. Ícone/gizmo para luzes de GLB
Em `modelImport.ts`:
- Ao percorrer o `gltf.scene`, detectar nós `isLight` (DirectionalLight, PointLight, SpotLight, HemisphereLight) e emitir objetos de cena equivalentes (`light_direct`, `light_omni`, `light_spot`) com `lightData` preenchido (color, intensity, distance, angle, penumbra, castShadow, posição/rotação world).
- Remover essas luzes do subgrafo importado para não duplicar (a cena renderiza a luz a partir do objeto emitido).
- Cada luz emitida entra na hierarquia como filho do nó pai importado (ou raiz do modelo) para manter a estrutura.
- Isso faz o `HelperGizmo` / ícone padrão já existente aparecer automaticamente e permite mover/editar pelo painel de parâmetros.

## 3. Autosave da cena no localStorage
Em `Studio3D.tsx` (ou onde vive o estado principal — `objects`, `selectedIds`, `animationTracks`, timeline, environment, ativação de viewport):
- Debounced `useEffect` (300–500 ms) que serializa `{ version, objects, animationTracks, environment, viewportLayout, currentFrame, totalFrames }` em `localStorage['walt3d.autosave']`.
- No mount, hidratar a partir dessa chave se existir (fallback para o estado inicial atual).
- Sanitizar antes de salvar: remover referências a `THREE.Object3D`/`Texture`/blobs; manter só dados serializáveis. Geometrias paramétricas já são recriadas pelo `Object3D`; para meshes importadas (GLB/OBJ) armazenar somente metadados leves — o modelo importado real fica no `modelStorage` (IndexedDB) já existente, referenciado por id.
- Menu Edit → "Reset Scene" limpa a chave. Import/New também substitui.
- Guardar no máximo ~4 MB; se exceder, cair só para hierarquia + parâmetros sem thumbnails.

## Sequência
1. Ler os arquivos apontados pela exploração (Scene3D/Object3D/modelImport/Studio3D).
2. Aplicar 1, 2 e 3 em edições separadas.
3. Verificar que troca de renderMode ainda funciona por-viewport, e que reload preserva cena e seleção.
