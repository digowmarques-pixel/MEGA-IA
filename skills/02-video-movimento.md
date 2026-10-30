---
name: Movimento de câmera e ação em vídeo
applies: video
---
Para prompts de VÍDEO, além da linguagem visual, descreva o TEMPO:

- **Movimento de câmera** (um principal por plano): static locked-off, slow push-in (dolly in), pull-out, truck left/right, pedestal up/down, pan, tilt, orbit/arc 90°, handheld com micro-tremor, steadicam follow, crane/jib up, drone flyover, whip pan, crash zoom, rack focus de A para B.
- **Velocidade**: slow motion (120fps feel), real-time, speed ramp.
- **Ação do sujeito** em sequência clara (início → meio → fim) cabendo na duração escolhida. 5s ≈ 1 ação principal; 10s ≈ 2 ações; acima disso, divida em shots com "CUT TO:".
- **Continuidade**: se houver imagem de referência/frame inicial, descreva o que se MANTÉM (personagem, figurino, cenário, luz, grading) e o que MUDA (movimento, expressão).
- **Áudio** (quando o modelo suporta): ambiência, foley, música — ou "no dialogue".
- Evite pedir muitas ações simultâneas; isso gera artefatos.
- Ao final, adicione restrições de qualidade: "consistent character identity, no morphing, natural motion blur, stable anatomy".

Estrutura sugerida:
[Shot type + lens] of [subject] [action], [environment]. Camera: [movement + speed]. Lighting: [...]. Color grade: [...]. Mood: [...]. [Audio]. [Constraints].
