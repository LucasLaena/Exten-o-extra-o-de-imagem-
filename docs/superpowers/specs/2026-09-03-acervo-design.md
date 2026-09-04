# Acervo — Design

Extensão de navegador para catalogar perfis do Instagram e do TikTok e baixar
publicações em lote, com ordenação por relevância e entrega em ZIPs particionados.

- **Data:** 2026-09-03
- **Status:** aprovado, pronto para o plano de implementação
- **Plataforma:** Chrome / Edge, Manifest V3, instalação local descompactada

## 1. Problema

Baixar centenas de publicações de um perfil é hoje um trabalho manual. As
ferramentas existentes baixam na ordem em que os posts aparecem na página e não
sabem responder a pedidos como "quero os posts 500 a 1000 desse perfil de 3000,
ordenados pelos mais vistos". O motivo é estrutural: a grade de um perfil não
exibe curtidas nem visualizações, então qualquer ferramenta que só lê o HTML da
grade é incapaz de ordenar por relevância.

O Acervo resolve isso separando o trabalho em duas fases. Primeiro cataloga o
perfil inteiro num banco local, com as métricas de cada post. Depois usa esse
catálogo para filtrar, ordenar e selecionar o que baixar.

## 2. Escopo

**Dentro do escopo**

- Instagram e TikTok, ambos na primeira entrega.
- Indexação do perfil inteiro (milhares de posts), persistida localmente.
- Filtro por tipo de mídia: fotos, vídeos/Reels, ou ambos.
- Ordenação por sequência do perfil, curtidas, visualizações ou data.
- Seleção por faixa numérica, por escolha manual, ou tudo.
- Download particionado em ZIPs de 100 posts, gravados em streaming no disco.
- Garantia de não repetição, dentro de uma rodada e entre rodadas.
- Nome de arquivo por template configurável.

**Fora do escopo**

- Publicação em loja de extensões.
- Qualquer servidor, API paga ou serviço externo. O projeto roda inteiramente
  na máquina do usuário e não tem custo de operação.
- Stories, destaques, conteúdo de perfis privados que o usuário não segue,
  e conteúdo pago ou restrito.
- Firefox e Safari.

## 3. Restrições

- **Custo zero, permanente.** Sem backend, sem chave de API, sem dependência
  paga. Todas as bibliotecas são open-source e ficam embutidas no pacote.
- **Sem passo de build.** JS puro com ES modules. O usuário edita um arquivo e
  recarrega a extensão. Nenhum `npm run build` entre editar e rodar.
- **A sessão é a do usuário.** A extensão nunca pede, armazena ou transmite
  credenciais. Ela opera sobre a sessão já logada no navegador.
- **Ritmo humanizado.** Volume alto contra as plataformas pode disparar
  rate-limit ou challenge de segurança. O design minimiza o risco, mas não o
  elimina.

## 4. Arquitetura

Quatro componentes, cada um com uma responsabilidade única.

### 4.1 `page/hook.js` — mundo MAIN

Roda no contexto JavaScript da própria página, injetado via `content_scripts`
com `world: "MAIN"`. Só o mundo MAIN enxerga o `window.fetch` que o app do
Instagram/TikTok usa.

Responsabilidade: embrulhar `window.fetch` e `XMLHttpRequest.prototype.send`,
clonar as respostas que casam com os padrões de URL conhecidos, e reportar duas
coisas ao content script via `window.postMessage`:

1. O corpo JSON da resposta.
2. A **assinatura do request**: URL, método, headers relevantes, corpo, e o
   nome do parâmetro de cursor. É isso que permite continuar a paginação sem
   nada hardcoded.

O hook nunca modifica requests nem respostas alheias. Ele observa e repassa.

**O hook também executa a paginação.** Sob demanda, ele dispara o request da
próxima página a partir do contexto da própria plataforma e devolve o JSON. Os
endpoints de feed verificam origem e cabeçalhos de contexto de navegação; um
request disparado da aba do Acervo seria de outra origem e falharia ou seria
tratado como suspeito. Executado no mundo MAIN da aba do perfil, o request é
indistinguível do que o próprio app faz.

### 4.2 `content/` — mundo ISOLATED

Injetado nas URLs de perfil das duas plataformas. Responsabilidades:

- Detectar que a página atual é um perfil e montar o botão flutuante.
- Renderizar botão e modal dentro de um **Shadow DOM**, isolando o CSS da
  extensão do CSS do site, que muda constantemente e usa classes ofuscadas.
- Reagir a navegação SPA: as duas plataformas trocam de página sem recarregar,
  então o boot escuta `history.pushState` e `popstate` e reavalia a URL.
- Rolar a página quando a estratégia de indexação exigir.
- Encaminhar as mensagens do hook para a aba do Acervo.

### 4.3 `background/sw.js` — service worker

Deliberadamente magro. Responsabilidades:

- Abrir e focar a aba do Acervo.
- Rotear mensagens entre content scripts e a aba do Acervo.
- Registrar as regras de `declarativeNetRequest` que corrigem headers de
  download.

Nenhum trabalho longo vive aqui. O service worker do MV3 é encerrado após cerca
de 30 segundos de inatividade e não tem DOM nem File System Access.

### 4.4 `acervo/` — a aba do Acervo

Uma página da extensão (`chrome-extension://…/acervo.html`) aberta em aba
inteira. É o processo principal do sistema.

Responsabilidades: orquestrar a indexação, guardar o catálogo, renderizar a
grade dos posts, aplicar filtro, ordenação e seleção, e executar o download com
zip em streaming.

**Justificativa da escolha.** Uma aba real não é encerrada por inatividade, tem
DOM, IndexedDB, Web Workers e File System Access, e pode mostrar progresso
detalhado. Concentrar o trabalho pesado aqui elimina a classe inteira de bugs
de service worker morto no meio de uma operação longa.

## 5. Estratégia de coleta

Híbrido de observação passiva e paginação ativa, com auto-descoberta.

1. O usuário abre o perfil e aciona a indexação.
2. A extensão provoca o primeiro carregamento natural do feed com uma rolagem
   curta.
3. O hook captura essa primeira resposta **e a assinatura do request**.
4. A aba do Acervo passa a comandar a paginação, mas quem dispara cada request
   é o hook, no contexto da aba do perfil. A assinatura recém-aprendida é
   reusada trocando apenas o cursor, com intervalo aleatório entre 800 e
   2000 ms.
5. A cada página, os posts são normalizados e gravados no IndexedDB, e a UI
   atualiza o contador.
6. Termina quando a plataforma indica fim de paginação, quando o usuário
   interrompe, ou quando o teto de posts é atingido. O teto é configurável e
   vem desligado por padrão: a indexação vai até o fim do perfil.

A aba do perfil precisa ficar aberta durante a indexação, mas pode ficar em
segundo plano. Fechá-la interrompe a indexação, que retoma pelo cursor salvo na
próxima vez.

**Por que auto-descoberta em vez de endpoints fixos.** Os identificadores de
query do Instagram (`doc_id`) mudam sem aviso. Uma extensão que os codifica
diretamente quebra numa manhã qualquer e exige manutenção. Aprendendo a
assinatura do próprio app em tempo de execução, o Acervo se reajusta sozinho
quando a plataforma muda.

**Interrupção e retomada.** O cursor da última página bem-sucedida é gravado no
registro do perfil. Uma indexação interrompida retoma exatamente daquele ponto.

**Detecção de bloqueio.** Respostas 429, 401 e 403, ou um corpo de challenge,
param a indexação imediatamente, aplicam backoff exponencial e avisam na tela.
A extensão nunca insiste contra um bloqueio.

## 6. Modelo de dados

IndexedDB, banco `acervo`.

### `profiles`

Chave: `"ig:@perfil"` ou `"tt:@perfil"`.

```
{ key, plataforma, handle, userId, displayName, avatarUrl,
  totalPostsDeclarado, totalIndexado, cursor, completo, indexadoEm }
```

### `posts`

Chave: `"ig:@perfil#C4xY9k"`.

```
{ key, profileKey, seq, tipo, curtidas, views, comentarios,
  timestamp, legenda, capaUrl,
  midias: [ { ordem, kind: "foto"|"video", url, largura, altura, duracao } ] }
```

Índices: `[profileKey+seq]`, `[profileKey+curtidas]`, `[profileKey+views]`,
`[profileKey+timestamp]`, `[profileKey+tipo]`.

`seq` é a posição do post **na ordem em que a plataforma o entregou** durante a
indexação, começando em 1. É a ordem "sequência do perfil" e viaja com o post
como metadado.

**O número que o usuário digita no campo de faixa é a posição, não o `seq`.**
A faixa é aplicada sobre a lista **já filtrada e já ordenada**. Pedir "500 a
1000" ordenando por views significa "do 500º ao 1000º mais visto", e pedir a
mesma faixa ordenando por sequência do perfil significa `seq` 500 a 1000, já
que nesse caso posição e `seq` coincidem. É essa distinção que torna útil
ordenar por relevância: "1 a 100" ordenado por views é o top 100 do perfil.

A grade mostra os dois números: a posição atual em destaque e o `seq` do perfil
como metadado, para que o usuário nunca fique em dúvida sobre o que está
pedindo.

Três consequências que precisam estar explícitas:

- Posts fixados no topo do perfil aparecem fora da ordem cronológica na grade.
  `seq` segue a grade, não a data, porque é isso que o usuário vê. Posts
  fixados carregam a flag `fixado` para que a ordenação por data continue
  correta.
- `seq` é **congelado no momento da indexação**. Se o perfil publicar algo
  novo depois, o `seq` gravado não muda. Isso é proposital: a faixa 500–1000
  que o usuário viu na tela continua sendo exatamente os mesmos posts quando
  ele mandar baixar.
- Reindexar recalcula `seq` para todo o perfil e a UI avisa quando isso
  desloca uma seleção salva.

### `baixados`

Chave: a mesma chave do post. Registra `{ key, baixadoEm, jobId, arquivos }`.

### `jobs`

```
{ jobId, profileKey, filtroMidia, ordenacao, selecao, incluirCapaReel,
  partes: [ { n, faixaSeq, posts, status, bytes, arquivoZip } ],
  status, criadoEm, concluidoEm }
```

### `handles`

Guarda o `FileSystemDirectoryHandle` da pasta de destino escolhida pelo
usuário, para reuso entre sessões.

## 7. Garantia de não repetição

Requisito explícito do usuário, tratado como propriedade estrutural e não como
verificação pontual.

1. **No banco.** A chave primária de um post é `plataforma:@perfil#id`.
   Reindexar o mesmo perfil sobrescreve registros; não cria duplicatas.
2. **No lote.** A seleção é um `Set` de chaves. Faixa e seleção manual
   convergem para o mesmo `Set`, então pedir a faixa 1–500 e também marcar
   manualmente o post 300 resulta em 500 posts, não 501.
3. **Entre rodadas.** O store `baixados` alimenta a opção "pular já baixados",
   ligada por padrão. O que já saiu aparece marcado na grade.
4. **Dentro do ZIP.** Se dois arquivos resolverem para o mesmo nome, um sufixo
   `-2`, `-3` é aplicado. Nomes de arquivo são sanitizados para o sistema de
   arquivos do Windows.

## 8. Particionamento e ZIP

**Regra de particionamento: 100 posts por parte, nunca 100 arquivos.** Um
carrossel de 10 fotos conta como um post e jamais é dividido entre dois ZIPs.
Uma parte pode portanto conter mais de 100 arquivos.

O tamanho da partição é configurável; 100 é o padrão.

**Motor de zip.** `client-zip` (MIT), que produz um `ReadableStream` de ZIP a
partir de um iterável assíncrono de arquivos. O stream é canalizado direto para
um `FileSystemWritableFileStream`. O consumo de memória é constante e
independente do tamanho total.

Vídeos e JPEGs já são comprimidos, então o ZIP usa modo *store*. Comprimir de
novo gastaria CPU sem reduzir o tamanho.

**Paralelismo com memória limitada.** Um buffer de no máximo três arquivos
adiante alimenta o iterável, permitindo quatro downloads simultâneos sem que a
memória cresça com o tamanho do lote. A concorrência é configurável de 1 a 8.

**Destino.** O usuário escolhe a pasta uma vez, via `showDirectoryPicker()`
disparado por gesto na aba do Acervo. O handle é persistido e reautorizado nas
sessões seguintes.

**Fallback.** Sem File System Access, ou se o usuário recusar a pasta, o ZIP é
montado em memória e entregue por `chrome.downloads` na pasta de Downloads
padrão. Nesse modo a parte fecha ao atingir **100 posts ou 500 MB, o que vier
primeiro**, e a UI explica que está no modo limitado e por quê. O teto de
500 MB existe para não estourar a memória da aba; é o único ponto do sistema em
que o lote inteiro de uma parte precisa caber na RAM.

**Estrutura de saída.**

```
Acervo/instagram/@perfil/2026-09-03_1430/
  parte-01_posts-0500-0599.zip
  parte-02_posts-0600-0699.zip
  acervo.csv
  relatorio.json
```

`acervo.csv` traz id, seq, tipo, curtidas, views, data, legenda e arquivos de
cada post baixado. `relatorio.json` lista o que falhou e por quê.

## 9. Nomenclatura

Template configurável. Padrão:

```
{seq}_{data}_{tipo}_{id}.{ext}   →   0500_2024-03-12_reel_C4xY9k.mp4
```

Tokens: `{seq}` `{perfil}` `{id}` `{data}` `{hora}` `{tipo}` `{curtidas}`
`{views}` `{idx}` `{legenda:N}`.

`{seq}` é preenchido com zeros à esquerda conforme o maior número do lote, para
que a ordenação alfabética do explorador de arquivos coincida com a ordem real.
`{idx}` é a posição dentro de um carrossel. `{legenda:N}` trunca em N
caracteres e remove o que o sistema de arquivos não aceita.

## 10. Adaptadores

Interface comum, uma implementação por plataforma. Adicionar uma plataforma no
futuro significa acrescentar um arquivo, sem tocar no núcleo.

```
matches(url)                          → é uma URL de perfil desta plataforma?
detectProfile(doc)                    → { handle, userId, displayName, avatarUrl, totalPosts }
isFeedResponse(url)                   → esta resposta interessa?
parseResponse(json)                   → { posts, cursor, temMais }
buildNextRequest(assinatura, cursor)  → Request
resolveMedia(post, opcoes)            → DownloadItem[]
```

### 10.1 Instagram

Trata três tipos: foto, vídeo/Reel e carrossel. Extrai curtidas,
visualizações, comentários, timestamp, legenda e todas as mídias filhas de um
carrossel.

**Regra de carrossel.** Com o filtro "só fotos", um carrossel misto contribui
apenas com suas fotos, não com o carrossel inteiro. Com "só vídeos",
simetricamente. Um carrossel cujo conteúdo é inteiramente filtrado não gera
arquivo algum e não ocupa vaga na partição.

**Capa de Reel.** A opção "incluir capa do Reel" adiciona a imagem de capa
junto ao vídeo, nomeada com o mesmo `{seq}` e sufixo `_capa`.

### 10.2 TikTok

Extrai `playCount`, `diggCount`, `commentCount`, `shareCount`, data, capa e
endereço do vídeo.

**Correção ao brief original.** O usuário descreveu o TikTok como "só vídeos".
O TikTok hoje também tem *photo posts*, os slideshows de imagem. O filtro
foto/vídeo é portanto implementado no TikTok com a mesma nomenclatura e o mesmo
comportamento do Instagram.

**Marca d'água.** Quando o payload oferece um endereço sem marca d'água, ele é
preferido. Caso contrário, usa-se o disponível e o `relatorio.json` registra
que aquele arquivo saiu com marca d'água.

### 10.3 Headers de download

Os CDNs das duas plataformas recusam requests sem `Referer` da origem
correspondente. Regras de `declarativeNetRequest` ajustam os headers dos
requests de mídia feitos pela extensão. Sem isso, todos os downloads retornam
403.

## 11. Interface

### 11.1 Botão flutuante

Pill no canto inferior direito, visível apenas em URL de perfil. Identidade
visual distinta por plataforma: gradiente rosa e roxo no Instagram, ciano e
magenta sobre preto no TikTok. Renderizado em Shadow DOM.

### 11.2 Modal

Cabeçalho com avatar, `@perfil` e estado do catálogo, no formato
"1.240 de ~3.000 indexados".

**Aba Mídia:** Fotos + Vídeos / Só fotos / Só vídeos, mais o toggle "incluir
capa do Reel".

**Aba Seleção:** Faixa (De # → Até #) / Manual / Tudo.

**Ordenação:** sequência do perfil / mais curtidas / mais views / mais recentes
/ mais antigos.

Botão primário com rótulo explícito do que vai acontecer, por exemplo
"Baixar posts 500–1000". Rodapé com acesso à configuração de nomenclatura e ao
Acervo completo.

Ordenar por curtidas ou views exige catálogo completo. Se o perfil ainda não
foi totalmente indexado, essas opções ficam desabilitadas com o motivo escrito
na tela e um atalho para indexar.

### 11.3 Aba do Acervo

Grade **virtualizada** — 3.000 miniaturas não podem estar todas no DOM.
Cabeçalhos de coluna clicáveis para ordenar, filtros de tipo, seleção por faixa
e por clique com suporte a Shift, contador de seleção, e painel de download com
o estado de cada parte.

## 12. Resiliência

- Concorrência de download: 4 simultâneos, configurável de 1 a 8.
- Intervalo entre páginas de indexação: aleatório entre 800 e 2000 ms.
- Backoff exponencial em 429, 401 e 403, com teto e aviso na UI.
- Três tentativas por arquivo; após isso, registro em `relatorio.json` e
  seguimento do lote. Uma mídia morta não derruba a rodada.
- Detecção de challenge ou sessão expirada interrompe tudo e explica o motivo.
- Partes concluídas já estão no disco. Uma interrupção no meio da parte 3 não
  compromete as partes 1 e 2.

## 13. Testes

Vitest sobre *fixtures*: payloads reais salvos em JSON, com dados de perfil
anonimizados. Desenvolvimento orientado a testes, teste antes do código.

Cobertura por unidade:

- **Adaptadores** — parsing de cada tipo de post, carrossel misto, paginação,
  campo ausente, payload malformado.
- **Seleção** — filtro de mídia, as cinco ordenações, faixa, seleção manual,
  união de faixa com manual sem duplicar.
- **Particionamento** — múltiplo exato de 100, resto, carrossel na fronteira,
  lote menor que uma parte.
- **Nomenclatura** — todos os tokens, truncamento de legenda, sanitização para
  Windows, colisão de nomes, preenchimento de zeros.
- **Zip** — pipeline com blobs sintéticos, verificando a integridade do ZIP
  resultante e o consumo de memória constante.
- **Fila** — limite de concorrência, backoff, retentativa, cancelamento.

Fluxos que dependem de sessão real logada não são automatizados; ficam em
checklist manual de verificação.

## 14. Estrutura de arquivos

```
manifest.json
src/
  core/        db.js  queue.js  naming.js  partition.js  selection.js  zipper.js
  adapters/    index.js  instagram.js  tiktok.js
  content/     boot.js  button.js  modal.js  scroller.js  styles.css
  page/        hook.js
  background/  sw.js
  acervo/      acervo.html  acervo.js  grid.js  acervo.css
  vendor/      client-zip.js
test/
  fixtures/    *.json
  *.test.js
docs/superpowers/specs/
```

## 15. Riscos assumidos

- **Ação da plataforma sobre a conta.** Volume alto pode gerar rate-limit ou
  challenge. Mitigado por ritmo humanizado, backoff e parada automática, mas
  não eliminado. Recomenda-se conta secundária para indexação pesada.
- **Termos de uso.** Download em massa contorna os termos das duas
  plataformas. Decisão consciente do usuário, registrada aqui.
- **Mudança de schema.** Mitigada pela auto-descoberta, mas uma reformulação
  profunda de payload ainda exigiria atualizar o adaptador. Os testes com
  fixtures tornam essa manutenção rápida e localizada.
