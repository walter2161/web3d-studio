## Objetivo
Restringir iluminação, sombras e texturas apenas às viewports que **não** estão em modo wireframe, economizando memória e processamento.

## Mudanças

**`src/components/3ds/Viewport.tsx`**
- Detectar se o `displayMode` da viewport é `wireframe` (ou variantes tipo `hidden-line` sem shading).
- Quando wireframe:
  - Desativar `shadows` no `<Canvas>` (passar `shadows={false}` ou `shadowMap.enabled=false`).
  - Não renderizar `ContactShadows`, `ShadowMapRefresh`, nem luzes default de fallback.
  - Forçar todos os materiais visíveis a rodarem como `MeshBasicMaterial`-like (sem lighting) OU simplesmente ocultar texturas via override `flatShading` + cor sólida do wire.
- Quando smooth/texture+shadow: manter comportamento atual (shadows soft, ContactShadows, refresh).

**`src/components/3ds/Object3D.tsx`**
- No path de `forceViewportShadowAndTexture` / `repairMaterialForViewport`, só aplicar quando a viewport atual não for wireframe.
- Em wireframe, setar `castShadow=false` e `receiveShadow=false` nas meshes daquela viewport para pular o shadow pass.

## Resultado
- Viewports Top/Front/Left (wireframe padrão do Quad View) deixam de calcular shadow maps e texturas → menos GPU/memória.
- Somente a Perspective (smooth + texture+shadow) processa iluminação e sombras completas.
- Trocar o displayMode de uma viewport para smooth reativa iluminação/textura dinamicamente.
