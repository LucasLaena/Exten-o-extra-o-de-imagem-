/**
 * Lê o que interessa do HTML de um perfil público do Instagram.
 *
 * Existe para permitir a coleta sem abrir aba nenhuma: a extensão busca a
 * página do perfil como qualquer outra requisição e tira daqui o id numérico,
 * que é o que a API de feed exige. Sem isto seria preciso ou abrir a aba do
 * perfil, ou consultar web_profile_info, que devolve 429 com facilidade.
 */

/** Escapa o handle para uso em regex: um ponto no nome não pode virar coringa. */
function escapar(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extrairIdDoPerfil(html, handle) {
  const texto = String(html ?? "");
  const seguro = escapar(handle ?? "");

  const padroes = [
    ...(seguro
      ? [
          new RegExp(`"id":"(\\d+)","username":"${seguro}"`, "i"),
          new RegExp(`"username":"${seguro}","id":"(\\d+)"`, "i"),
        ]
      : []),
    /"profilePage_(\d+)"/,
    /"user_id":"(\d+)"/,
    /"owner":\{"id":"(\d+)"/,
    /"props":\{"id":"(\d+)"/,
  ];

  for (const padrao of padroes) {
    const achado = texto.match(padrao);
    if (achado?.[1]) return achado[1];
  }
  return null;
}

/** O perfil é privado? Aí a coleta sem sessão não vai a lugar nenhum. */
export function ehPrivado(html) {
  return /"is_private":\s*true/.test(String(html ?? ""));
}

/** A página existe? O Instagram devolve 200 com uma página de erro. */
export function pareceInexistente(html) {
  const texto = String(html ?? "");
  return (
    /Esta página não está disponível|Sorry, this page isn't available/i.test(texto) ||
    texto.length < 500
  );
}
