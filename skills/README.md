# Skills do Hub

Cada arquivo `.md` desta pasta é uma "skill" carregada no enhance de prompt e no assistente Claude.

Cabeçalho obrigatório (frontmatter):

```
---
name: Nome da skill
applies: video        # image | video | audio | avatar | all
---
```

Coloque aqui as skills da produtora (ex.: cinema-ia-storyboard, seedance-director, prompt-foto-realista).
O conteúdo é enviado ao Claude como instrução. Não precisa reiniciar o servidor: as skills são relidas a cada pedido.
