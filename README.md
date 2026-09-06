# Acervo

Extensão de navegador que cataloga perfis do Instagram e do TikTok e baixa
publicações em lote, com ordenação por relevância e entrega em ZIPs
particionados.

## O que ela faz

Primeiro **cataloga** o perfil inteiro num banco local, com curtidas,
visualizações, data e legenda de cada publicação. Depois usa esse catálogo para
você escolher o que baixar: filtrar por tipo de mídia, ordenar por sequência ou
relevância, e pegar uma faixa exata — "do 500º ao 1000º mais visto", por
exemplo.

O download sai em ZIPs de 100 publicações, gravados direto no disco em
streaming. Nada é repetido, nem dentro de uma rodada nem entre rodadas.

Por que catalogar antes: a grade de um perfil não mostra curtidas nem
visualizações. Sem o catálogo completo, ordenar por relevância é impossível —
e é por isso que nenhuma outra ferramenta faz isso.

## Instalação

1. `npm install` (só para rodar os testes; a extensão não precisa de build)
2. `npm run vendor`
3. Abra `chrome://extensions`, ligue **Modo do desenvolvedor**
4. **Carregar sem compactação** e aponte para esta pasta

## Uso

1. Abra um perfil do Instagram ou do TikTok
2. Role um pouco a página, para a extensão ver o feed carregar
3. Clique no botão **Acervo** no canto inferior direito
4. **Indexar perfil inteiro** — leva alguns minutos num perfil grande e fica
   salvo para sempre. Ordenar por curtidas ou visualizações exige esta etapa
5. Escolha mídia, ordenação e faixa, e clique em baixar
6. Na primeira vez, escolha a pasta de destino. A extensão lembra depois

A aba do perfil precisa ficar aberta durante a indexação, mas pode ficar em
segundo plano. Fechar interrompe; reabrir e clicar em Indexar retoma de onde
parou.

## Saída

```
Acervo/instagram/@perfil/2026-09-04_1430/
  parte-01_posts-0500-0599.zip
  parte-02_posts-0600-0699.zip
  acervo.csv        métricas de tudo que foi baixado
  relatorio.json    o que falhou e por quê
```

## Custo

Zero, para sempre. Sem servidor, sem API paga, sem chave de nada. Tudo roda na
sua máquina, na sua sessão já logada. A extensão nunca lê, guarda ou transmite
senha, token ou cookie.

## Limites e riscos

- **Rate-limit.** Volume alto pode disparar bloqueio temporário ou challenge de
  segurança na sua conta. A extensão usa ritmo humanizado e para sozinha ao
  detectar bloqueio, mas o risco não é zero. Para indexação pesada, considere
  uma conta secundária.
- **Termos de uso.** Download em massa contraria os termos das duas
  plataformas. A decisão é sua.
- **Mudança de formato.** A extensão aprende a assinatura do request em tempo
  de execução, o que a torna resistente a mudanças. Uma reformulação profunda
  de payload ainda exigiria atualizar o adaptador.
- Não baixa stories, destaques, nem conteúdo de perfis privados que você não
  segue.

## Desenvolvimento

```bash
npm test          # suíte completa
npm run test:watch
```

`src/core/` não importa nada do navegador — é onde mora a lógica e é testável
em Node. `src/adapters/` isola o que é específico de cada plataforma: acrescentar
uma terceira rede é acrescentar um arquivo.

Documentos: [spec](docs/superpowers/specs/2026-09-03-acervo-design.md) ·
[plano](docs/superpowers/plans/2026-09-03-acervo.md) ·
[verificação manual](docs/verificacao-manual.md)
