// Content script clássico: não aceita `import`. Só carrega o módulo de verdade,
// que é web-accessible e pode usar ES modules à vontade.
//
// As duas linhas de log existem para diagnóstico: se o console da página não
// mostra nenhuma delas, o content script não chegou a rodar — problema de
// injeção, não de detecção de perfil.
(async () => {
  try {
    const { iniciar } = await import(chrome.runtime.getURL("src/content/app.js"));
    iniciar();
    console.log("[Acervo] v" + chrome.runtime.getManifest().version + " ativo em", location.href);
  } catch (erro) {
    console.error("[Acervo] falhei ao iniciar:", erro);
  }
})();
