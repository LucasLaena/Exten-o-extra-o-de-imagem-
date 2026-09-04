# Verificação manual do Acervo

Nenhum teste automatizado prova que o Acervo funciona contra o Instagram de
verdade — login real não se automatiza de forma sã, e as fixtures travam o
contrato, não a realidade.

Rode este roteiro inteiro antes de considerar a implementação terminada, e de
novo depois de qualquer mudança nos adaptadores. Use uma conta secundária.

Um item que falha é bug, não "comportamento da plataforma".

## Preparo

- [ ] `npm test` passa inteiro
- [ ] A extensão carrega em `chrome://extensions` sem erro em vermelho
- [ ] O console do service worker não mostra exceção

## Botão e navegação

- [ ] O botão aparece em `instagram.com/<perfil>/`
- [ ] O botão **não** aparece em `instagram.com/p/<código>/`
- [ ] Ir do perfil para um post e voltar faz o botão sumir e reaparecer
- [ ] O botão aparece em `tiktok.com/@<perfil>` e some em `/foryou`
- [ ] O filete do botão muda de cor entre as duas plataformas
- [ ] O CSS do site não deforma o botão

## Indexação — Instagram

- [ ] Rolar o perfil e abrir o modal: o catálogo aparece com contagem
- [ ] Clicar em **Indexar perfil inteiro** começa a contar publicações
- [ ] A contagem bate, com margem pequena, com o total mostrado no perfil
- [ ] Fechar a aba do Acervo no meio e reabrir retoma de onde parou, sem
      duplicar nem pular
- [ ] Reindexar o mesmo perfil não duplica nada: a contagem não dobra
- [ ] O intervalo entre páginas é visível, não é uma rajada
- [ ] Publicações fixadas aparecem com o `seq` da ordem da grade

## Indexação — TikTok

- [ ] Indexa um perfil com mais de 200 vídeos até o fim
- [ ] Um perfil que tem *photo post* traz o slideshow como carrossel de fotos

## Catálogo e seleção

- [ ] A grade abre 3.000 publicações sem travar a aba
- [ ] Rolar até o fim é fluido
- [ ] Ordenar por **mais visualizações** põe o vídeo mais visto do perfil em #1
- [ ] Ordenar por **mais curtidas** bate com o que o perfil mostra
- [ ] Com catálogo incompleto, as opções de relevância aparecem desabilitadas
      **com o motivo escrito na tela**
- [ ] A régua do modal mostra a janela certa ao digitar a faixa
- [ ] Faixa "1 a 100" ordenada por views devolve exatamente o top 100
- [ ] Shift-clique marca a faixa entre dois itens
- [ ] Filtrar "só fotos" renumera as posições

## Download

- [ ] Escolher a pasta funciona e a extensão lembra dela na sessão seguinte
- [ ] Baixar 250 publicações gera exatamente 3 ZIPs
- [ ] Os nomes das partes trazem a faixa de posições correta
- [ ] Os arquivos abrem: o MP4 toca, o JPEG abre
- [ ] Um carrossel de 10 fotos vira 10 arquivos, todos no **mesmo** ZIP
- [ ] Com "só fotos", um carrossel misto traz apenas as fotos dele
- [ ] "Incluir capa" gera o arquivo `_capa` junto de cada vídeo
- [ ] `acervo.csv` abre no Excel **com os acentos certos**
- [ ] `relatorio.json` existe e lista as partes
- [ ] Nenhum arquivo repetido entre os ZIPs de uma mesma rodada
- [ ] Rodar de novo com "pular já baixados" ligado não rebaixa nada
- [ ] A memória da aba não cresce sem parar durante um lote de 500
      (Gerenciador de tarefas do Chrome, aba do Acervo)

## Resiliência

- [ ] Cancelar no meio para o download e mantém as partes já concluídas
- [ ] Cortar a rede no meio: a extensão tenta de novo e continua
- [ ] Um post apagado durante o lote vira linha no `relatorio.json` e o lote
      continua
- [ ] Em bloqueio da plataforma, a indexação para e explica o motivo, sem
      insistir

## Higiene

- [ ] Nenhuma requisição para domínio que não seja Instagram, TikTok ou CDNs
      deles (aba Network, filtro por domínio)
- [ ] `grep -ri "sessionid\|document.cookie" src/` não retorna nada
- [ ] No DevTools da aba do Acervo, `Application → IndexedDB → acervo →
      profiles`: o registro do perfil **não** contém nenhum cookie
- [ ] Toda a interface está em português

## Substituir as fixtures por capturas reais

As fixtures em `test/fixtures/` foram escritas à mão a partir do formato
conhecido. Com a extensão rodando num perfil real, abra o console da aba do
perfil e salve um payload de verdade:

```javascript
addEventListener("message", (e) => {
  if (e.data?.fonte === "acervo/pagina" && e.data?.tipo === "capturou") {
    console.log(JSON.stringify(e.data.carga.json));
  }
});
```

Anonimize handles e URLs, substitua os arquivos e rode `npm test`. Se algum
teste de parsing quebrar, a fixture escrita à mão divergia do real — conserte o
adaptador, não o teste.
