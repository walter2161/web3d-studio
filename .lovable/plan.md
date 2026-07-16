## Objetivo

Transformar a timeline atual em um **Track View** no estilo 3ds Max, com **Dope Sheet** e **Curve Editor**, capaz de:

1. Abrir um personagem importado (Mixamo/FBX/GLB) e mostrar cada bone/canal como uma track editável.
2. Converter os `AnimationClip`s que já vieram no arquivo em keyframes reais editáveis (position/rotation/scale por bone).
3. Editar tangentes (Bezier, Linear, Step, Smooth, Fast, Slow) com Key Info.
4. Ferramentas úteis vindas do fluxo Mixamo (root motion bake, mirror, retime, loop cyclic, offset).

---

## O que muda na UI

Timeline reformada em três abas dentro do painel inferior:

```text
[ Dope Sheet ] [ Curve Editor ] [ Motion Panel ]
```

- **Hierarchy tree à esquerda** (fixa nas duas primeiras abas): árvore expansível `Objeto → Bones → Position/Rotation/Scale → X/Y/Z`, cada canal com toggle de visibilidade e "solo".
- **Dope Sheet**: blocos horizontais mostrando keys por track (sem curva). Multi-seleção com box-select, mover/copiar/colar/escala de tempo.
- **Curve Editor**: canvas SVG com uma curva por canal selecionado, handles Bezier arrastáveis, snap opcional em frames.
- **Motion Panel** (lateral direita quando um canal está selecionado): controllers (`Bezier`, `Linear`, `TCB`, `Noise`), Out-of-Range types (`Constant`, `Loop`, `Cycle`, `Ping Pong`, `Relative Repeat`), e Key Info (Time, Value, In/Out tangent, Ease In/Out).

Barra superior mantém: Auto Key (vermelho), Set Key, Play/Stop, Loop, playhead atual.

---

## Importar animações do modelo

Ao selecionar um objeto `imported` que traga `animations: AnimationClip[]`:

- Aparece um botão **"Bake clip → tracks"** na timeline (e um dropdown se houver múltiplos clips).
- Ao clicar, cada `KeyframeTrack` do clip é convertido em uma `AnimationTrack` por nó/canal:
  - `.position` → 3 tracks (X/Y/Z).
  - `.quaternion` → convertida para Euler XYZ (3 tracks) para casar com o modelo Max.
  - `.scale` → 3 tracks.
  - `.morphTargetInfluences[i]` → 1 track por morph.
- Sampling: se o clip usa `InterpolateSmooth`, aproximamos tangentes Bezier a partir das derivadas amostradas; `InterpolateDiscrete` vira Step; `InterpolateLinear` vira Linear.
- Frame rate: converter `time` (segundos) para frames usando 30 fps (configurável).
- Os keyframes ficam vinculados ao `nodeUuid` de cada bone via `subTargets` dentro do `AnimationTrack` (extensão do tipo atual).

Play/Scrub: quando um objeto importado tem tracks nossos, o `AnimationMixer` do three.js é desativado e os bones passam a ser dirigidos pela nossa amostragem — assim as edições aparecem no viewport imediatamente.

---

## Ferramentas estilo Mixamo / retargeting-friendly

Painel "Clip Tools" no topo da timeline quando um imported está selecionado:

- **In-Place / Root Motion toggle**: zera as tracks de `Hips.position` (ou re-injeta a partir de curva salva).
- **Mirror animation** (L↔R): mapeamento de nomes `Left*` ↔ `Right*` e negação de `rotation.x`/`position.x` conforme o eixo do rig.
- **Loop cyclic**: ajusta primeiro/último keyframe para casarem (média das poses) e aplica Out-of-Range = Cycle.
- **Retime**: escala uniforme do tempo (0.5x / 2x / valor livre) preservando tangentes.
- **Offset per-bone**: aplica delta de rotação em todos os keyframes de um bone (útil para corrigir T-pose vs A-pose do Mixamo).
- **Trim range**: define frame inicial/final e descarta keys fora.

---

## Detalhes técnicos

**Tipos atualizados** (`AnimationTimeline.tsx`):

```ts
type Channel = 'pos' | 'rot' | 'scale' | 'morph' | 'custom';
type Axis = 'x' | 'y' | 'z' | number;
type TangentKind = 'bezier' | 'linear' | 'step' | 'smooth' | 'fast' | 'slow';

interface ChannelKey {
  id: string; frame: number; value: number;
  inTan: TangentKind; outTan: TangentKind;
  inHandle?: [number, number];  // (frameOffset, valueOffset) para custom Bezier
  outHandle?: [number, number];
}

interface ChannelTrack {
  id: string;                    // `${objectId}:${nodeUuid}:${channel}:${axis}`
  objectId: string;
  nodeUuid?: string;             // vazio = root do objeto
  channel: Channel; axis: Axis;
  keys: ChannelKey[];
  controller: 'bezier'|'linear'|'tcb'|'noise';
  outOfRange: 'constant'|'loop'|'cycle'|'pingpong'|'relativeRepeat';
  muted?: boolean; solo?: boolean;
}
```

O tipo antigo `AnimationTrack` vira uma view derivada agrupando `ChannelTrack`s por objeto, para não quebrar o `TrajectoryRenderer`.

**Amostragem por frame** (`utils/animationRender.ts`): estende para consultar `ChannelTrack`s e escrever direto em `THREE.Object3D` por `nodeUuid` (usa o mesmo `getImportedModel().root.traverse` já usado no rig undo).

**Curve Editor**: SVG com viewport pan/zoom (wheel + middle-drag). Handles Bezier em pixels; conversão frame↔px e value↔px baseada em bbox dos keys selecionados. Snap opcional.

**Undo**: cada edição (mover key, mudar tangente, bake, mirror, retime) passa pela pilha `undoOrderRef` existente marcando `'objects'` (pois `animationTracks` já será migrado para dentro do state undoable — hoje é `useState` separado; passará por `saveState`).

---

## Arquivos afetados

Novos:
- `src/components/3ds/timeline/TrackView.tsx` — container com abas Dope/Curve/Motion.
- `src/components/3ds/timeline/DopeSheet.tsx`
- `src/components/3ds/timeline/CurveEditor.tsx`
- `src/components/3ds/timeline/MotionPanel.tsx`
- `src/components/3ds/timeline/TrackHierarchy.tsx`
- `src/components/3ds/timeline/clipBake.ts` — converte `AnimationClip` → `ChannelTrack[]`.
- `src/components/3ds/timeline/clipTools.ts` — mirror, retime, loop cyclic, root motion.
- `src/components/3ds/timeline/sampler.ts` — avalia `ChannelTrack` em um dado frame com tangentes/out-of-range.

Editados:
- `src/components/3ds/AnimationTimeline.tsx` — vira um shell fino que renderiza `TrackView`; mantém tipos legados por compatibilidade.
- `src/components/3ds/Studio3D.tsx` — integra tracks no undo, roteia sampling via novo `sampler`, expõe `onBakeImportedAnimation`.
- `src/components/3ds/utils/animationRender.ts` — usa o novo sampler para bones/canais internos.
- `src/components/3ds/TrajectoryRenderer.tsx` — lê a view agrupada por objeto (sem mudanças de comportamento).

---

## Fases de entrega

1. Nova estrutura `ChannelTrack` + sampler + backwards-compat com `AnimationTrack` atual. Timeline continua funcionando igual.
2. Track hierarchy tree + Dope Sheet novo (substitui a linha única atual).
3. Bake de `AnimationClip` do modelo importado → tracks por bone; playback dirigido pelo sampler.
4. Curve Editor com edição de tangentes e Motion Panel (controllers + out-of-range + Key Info).
5. Clip Tools (mirror, retime, loop cyclic, root motion, offset, trim).

Cada fase é entregável isolada; a fase 3 já habilita o pedido central (editar animação vinda do Mixamo).
