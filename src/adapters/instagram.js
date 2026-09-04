// Primeiro segmento do caminho que o Instagram usa para rotas próprias. Sem
// essa lista, /explore/ e /accounts/ seriam lidos como nome de usuário.
const RESERVADOS = new Set([
  "p", "reel", "reels", "tv", "s", "explore", "accounts", "direct", "stories",
  "challenge", "about", "developer", "legal", "privacy", "terms", "emails",
  "session", "ajax", "api", "graphql", "web", "your_activity", "lite",
  "favorites", "archive", "blog", "business", "creators", "directory", "igtv",
  "locations", "press", "qr", "threads", "sitemap", "topics", "help",
]);

// Sufixos que o próprio perfil aceita depois do handle.
const SUFIXOS = new Set(["", "reels", "tagged", "saved", "channel", "feed"]);

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

function segmentos(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    return u.pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
}

export const instagram = {
  id: "instagram",
  prefixo: "ig",
  rotulo: "Instagram",

  ehPerfil(url) {
    return instagram.handleDaUrl(url) !== null;
  },

  handleDaUrl(url) {
    const partes = segmentos(url);
    if (!partes || partes.length === 0 || partes.length > 2) return null;
    const [handle, sufixo = ""] = partes;
    if (RESERVADOS.has(handle.toLowerCase())) return null;
    if (!HANDLE.test(handle)) return null;
    if (!SUFIXOS.has(sufixo.toLowerCase())) return null;
    return handle;
  },
};
