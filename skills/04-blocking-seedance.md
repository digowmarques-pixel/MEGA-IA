---
name: Blocking 3D → Seedance (câmera travada)
applies: video
---
Método dos vídeos de referência (blockout/previs). Use quando houver um vídeo de blocking 3D como referência.

PRINCÍPIO: o vídeo de blocking manda no MOVIMENTO (posições, trajetórias, timing, enquadramento e câmera). As folhas de referência mandam na APARÊNCIA. O texto só liga um ao outro.

Regras do prompt:
1. Ordem das referências: vídeo de blocking primeiro, depois as folhas de personagem/objeto/locação.
2. NUNCA invente movimento de câmera. Descreva apenas o que o blocking já faz ("the camera follows the reference video exactly").
3. Mapeie cada forma colorida para o elemento real: "the red mannequin is <personagem> (see character sheet 1)", "the dark box is the matte-black muscle car".
4. Descreva ambiente, luz e color grading, porque o blocking é cinza e sem estilo.
5. Uma linha de estilo separada (ex.: "Style: photoreal 35mm film" ou "Style: 2D anime"). Para trocar o estilo, troque só essa linha e as folhas.
6. Termine com uma lista curta e direta de proibições: "No extra characters. No clones. No cuts. No lane changes. Do not change the camera path. Do not show the grey stand-in shapes." O que não for proibido o modelo considera permitido.
7. Faça primeiro um teste barato em 480p (rascunho) para checar se o movimento seguiu o blocking; só depois gere na resolução final.

Na montagem do blocking:
- Toda rotação de câmera deve acontecer enquanto a câmera se desloca (girar parada parece tripé robótico).
- Use ease in/out em todos os keyframes da câmera; operadores reais não andam em velocidade constante.
- Elementos que se cruzam ou se sobrepõem devem ter aparências bem diferentes (preto x branco), senão o modelo troca um pelo outro.
- Confira quadro a quadro os momentos difíceis (oclusões, objeto passando rente à lente) antes de exportar.
- Clipe único, sem cortes, de 3 a 15 s.
