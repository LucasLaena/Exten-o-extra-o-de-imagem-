// Content script clássico: não aceita `import`. Só carrega o módulo de verdade,
// que é web-accessible e pode usar ES modules à vontade.
(async () => {
  try {
    const { iniciar } = await import(chrome.runtime.getURL("src/content/app.js"));
    iniciar();
  } catch (erro) {
    console.error("[Acervo] falhei ao iniciar:", erro);
  }
})();
