# Character Animation System — Bones / Biped / Rig

O escopo completo (Bones + Skin + Envelopes + Biped com Figure/Footstep/Freeform + Rig com Constraints/Controllers/Wiring/Reaction Manager + Retarget + Pose Library) é gigante — equivalente ao Character Studio inteiro. Vou entregar em **3 fases**, cada uma utilizável por si só. Confirme a fase (ou aprove tudo em sequência) para eu começar.

---

## Fase 1 — Bones + Skin básico + IK simples

**Menu**
- `Create → Systems → Bones` (nova aba "Systems" no SidePanel, junto com Helpers)
- `Create → Systems → Biped` (fica arm-only nesta fase; commit na Fase 2)

**Bones**
- Ferramenta de criação encadeada estilo Line: clique cria osso, move mouse define comprimento, próximo clique inicia filho, RMB termina a cadeia.
- Novo tipo `bone` em `Object3DData` com `boneKind`, `length`, `width`, `height`, `taper`, `fins`, `parentBoneId`.
- Renderer: helper visual "◄──►" (dois cones + linha) em `src/components/3ds/r3/BoneGizmo.tsx`. Cor amarela padrão, branca quando selecionado.
- Hierarquia real via `parentBoneId` — Scene Hierarchy exibe árvore com ícone de osso.
- FK nativo: rotação do pai propaga para filhos (já ganho porque usamos `THREE.Object3D` aninhado).
- **Bone Edit Mode**: toggle no painel Modify que permite reeditar comprimento/orientação sem quebrar keys.
- **Bone On**: converter qualquer objeto selecionado em osso (adiciona flag `boneOn` e o Skin passa a reconhecê-lo).

**Skin Modifier** (não-destrutivo, entra no Modifier Stack existente)
- `SkinModifier` com `bones[]` e `vertexWeights[]`.
- Botão **Add Bones** abre picker (Select By Name filtrado por type=bone).
- **Auto Weight** por distância (heat weighting simplificado — proximidade ao segmento do osso, decaimento suave).
- Substitui a `Mesh` por `THREE.SkinnedMesh` em runtime, mantendo a geometria original para toggle de exibição do modificador.
- Painel de **Envelopes**: sliders Inner/Outer radius por osso, visualização de cápsulas semi-transparentes na viewport.

**IK (HI Solver simplificado)**
- Botão "Add IK" no painel do osso final de uma cadeia.
- Cria helper `IK_Target` (diamante ciano) e `Pole_Vector` (seta) automaticamente.
- Solver: usa `THREE.CCDIKSolver` (nativo no three.js). Chain length parametrizável.
- FK/IK Blend slider (0 = FK puro, 1 = IK puro).

**Arquivos novos/alterados**
- novo: `src/components/3ds/rig/bones.ts` (tipos, defaults, criação de cadeia)
- novo: `src/components/3ds/rig/skin.ts` (modifier, auto-weight, bind pose)
- novo: `src/components/3ds/rig/ik.ts` (wrapper CCDIKSolver, FK/IK blend)
- novo: `src/components/3ds/r3/BoneGizmo.tsx`
- novo: `src/components/3ds/r3/SkinEnvelopeGizmo.tsx`
- editado: `SidePanel.tsx` (nova aba Systems + rollouts Skin/IK no Modify)
- editado: `Object3D.tsx` (case `bone`, integração SkinnedMesh)
- editado: `Studio3D.tsx` (creation controller para bones, IK update no frame)
- editado: `SceneHierarchy.tsx` (ícone e agrupamento de bones)

---

## Fase 2 — Biped (Character Studio simplificado)

**Criação**
- `Create → Systems → Biped`: clique-arrasta define altura; ao soltar, gera esqueleto humanoide completo.
- Estrutura: `Bip01 → Pelvis → Spine01/02 → Neck → Head`, `Clavicle → UpperArm → Forearm → Hand → Fingers[]`, `Thigh → Calf → Foot → Toe`.
- Parâmetros pré-criação (rollout Creation): Height, Arms(1/2/4), Fingers (0–5), Toes (0–5), Tail (bones), Ponytails (0–2), Spine Links (2–5), Neck Links (1–3).

**Modos** (toggle no painel do Biped)
- **Figure Mode**: edição de proporções (altera bind pose, invalida animações → warn dialog).
- **Freeform Mode**: animação padrão (Auto Key existente já funciona).
- **Footstep Mode**: ferramenta na viewport para colocar marcadores de pegada (L/R alternando); ao rodar, gera automaticamente ciclo de caminhada com IK dos pés travando em cada pegada.

**Rig automático**
- Ao commit do Biped, gera controls: `Hand_CTRL` (círculo), `Foot_CTRL` (retângulo), `Pelvis_CTRL` (caixa), `Head_CTRL` (círculo), `Elbow_Pole`, `Knee_Pole` (setas).
- IK/FK Switch por membro (slider 0–1) no rollout Motion.
- **Foot Roll / Toe Roll / Heel Pivot** como custom sliders no `Foot_CTRL`.

**Skin com Biped**
- Botão "Bind to Biped" no painel Modify da mesh: aplica Skin Modifier já com todos os bones do Biped adicionados e auto-weight.

**Test Animations panel**
- Aba "Animations" na sidebar com clips embutidos: Idle, Walk, Run, Jump, Sit, Wave, Turn L/R.
- Cada clip = `AnimationClip` procedural (curvas de rotação por bone).
- `AnimationMixer` no Studio3D, blend com `crossFadeTo(0.3s)`.
- Play/Stop/Loop por clip.

**Arquivos novos**
- `src/components/3ds/rig/biped.ts` (builder do esqueleto, defaults)
- `src/components/3ds/rig/bipedAnimations.ts` (clips procedurais)
- `src/components/3ds/rig/footstep.ts` (footstep planner → walk cycle)
- `src/components/3ds/r3/BipedGizmos.tsx` (controls visuais)
- `src/components/3ds/rig/RigControlsPanel.tsx` (sliders IK/FK, Foot Roll etc.)

---

## Fase 3 — Rig avançado (Constraints, Controllers, Wiring, Pose Library, Retarget)

**Constraints** (Animation menu → Constraints)
- Position, Orientation, LookAt, Path Constraint.
- Aplicados via novo campo `Object3DData.constraints[]` avaliado por-frame no Studio3D.

**Controllers por track**
- Bezier Position, Euler XYZ, TCB Rotation, Noise Position/Rotation.
- Trocáveis pelo curve editor existente (Track View).

**Custom Attributes + Wiring Parameters**
- Dialog "Add Custom Attribute" (slider/checkbox) anexa parâmetro a qualquer objeto.
- **Wiring Parameters**: dialog com dois painéis (source/target), expressão `output = f(input)`, avaliado por-frame.

**Reaction Manager**
- Dialog master/slave: gravar estados A→B, interpolação spline entre reactions.

**Pose Library**
- Painel lateral: Save Pose (grava rotações de todos os bones selecionados), Load Pose, Mirror Pose (L↔R por nome).

**Retarget**
- Dialog Retarget: source Biped → target Biped, mapping por nome; converte clips.

**Mirror Pose, Bone Layers**
- Layer Manager já existe — só adicionar categorias padrão Geometry/Bones/Controls/Helpers para novos Bipeds.

---

## Dependências

- `three.CCDIKSolver`, `three.SkeletonHelper`, `three.SkinnedMesh`, `three.AnimationMixer` — já disponíveis no three instalado.
- Nenhum pacote novo necessário.

---

## Como quero prosseguir

Recomendo começar pela **Fase 1** (Bones + Skin + IK básico) e validar o fluxo antes de partir pro Biped. Confirme:

1. **Fase 1 completa agora** (Bones, Skin, envelopes, IK, FK/IK blend) — recomendado.
2. **Fase 1 + 2 juntas** (adiciona Biped com Footstep e test animations) — bem maior, mais tempo.
3. **Só uma parte específica** — diga qual (ex.: "só Bones + FK" ou "só Biped sem Footstep").
