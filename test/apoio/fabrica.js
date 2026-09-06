let contador = 0;

/** @returns {import("../../src/core/tipos.js").Midia} */
export function criarMidia(parcial = {}) {
  const kind = parcial.kind ?? "video";
  return {
    ordem: 0,
    kind,
    url: `https://cdn.exemplo.test/${kind}-${++contador}.${kind === "video" ? "mp4" : "jpg"}`,
    largura: 1080,
    altura: 1350,
    ...(kind === "video" ? { duracao: 15 } : {}),
    ...parcial,
  };
}

/** @returns {import("../../src/core/tipos.js").Post} */
export function criarPost(parcial = {}) {
  const id = parcial.id ?? `C${(++contador).toString(36).padStart(5, "x")}`;
  const perfil = parcial.perfil ?? "perfil";
  const tipo = parcial.tipo ?? "video";

  const midiasPadrao =
    tipo === "carrossel"
      ? [criarMidia({ ordem: 0, kind: "foto" }), criarMidia({ ordem: 1, kind: "video" })]
      : [criarMidia({ kind: tipo === "foto" ? "foto" : "video" })];

  return {
    key: `ig:@${perfil}#${id}`,
    profileKey: `ig:@${perfil}`,
    id,
    seq: 1,
    tipo,
    curtidas: 0,
    views: 0,
    comentarios: 0,
    timestamp: 1_700_000_000,
    legenda: "legenda de exemplo",
    capaUrl: "https://cdn.exemplo.test/capa.jpg",
    fixado: false,
    midias: midiasPadrao,
    ...parcial,
  };
}

/** @returns {import("../../src/core/tipos.js").Post[]} */
export function criarPosts(n, personalizar = () => ({})) {
  return Array.from({ length: n }, (_, i) =>
    criarPost({ seq: i + 1, ...personalizar(i) }),
  );
}
