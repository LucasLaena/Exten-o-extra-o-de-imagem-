// No TikTok o perfil é sempre /@handle, então basta exigir o arroba e recusar
// qualquer segmento a mais (que seria /video/, /live, etc).
const HANDLE = /^[A-Za-z0-9._]{1,24}$/;

function segmentos(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)tiktok\.com$/.test(u.hostname)) return null;
    return u.pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
}

export const tiktok = {
  id: "tiktok",
  prefixo: "tt",
  rotulo: "TikTok",

  ehPerfil(url) {
    return tiktok.handleDaUrl(url) !== null;
  },

  handleDaUrl(url) {
    const partes = segmentos(url);
    if (!partes || partes.length !== 1) return null;
    const [primeiro] = partes;
    if (!primeiro.startsWith("@")) return null;
    const handle = primeiro.slice(1);
    return HANDLE.test(handle) ? handle : null;
  },
};
