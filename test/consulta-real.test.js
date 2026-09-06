import { describe, it, expect } from "vitest";
import { montarAssinatura } from "../src/core/assinatura.js";
import { instagram } from "../src/adapters/instagram.js";

//
// A consulta real do Instagram, observada no trafego do navegador em
// 2026-09-06 (PolarisProfilePostsTabContentQuery_connection).
//
// Este arquivo existe porque trocar o cursor significa remontar o corpo, e
// remontar corpo e onde se perde campo sem perceber: o pedido continua
// saindo, o servidor e que recusa. Sao fatos de protocolo, nao chute.
//

const DOC_ID = "39535953862670189";
const CURSOR = "3967423918213900688_223666448";

/** As variaveis como a pagina as manda. */
const variaveis = (after) => ({
  after,
  before: null,
  data: {
    count: 12,
    include_reel_media_seen_timestamp: true,
    include_relationship_info: true,
    latest_besties_reel_media: true,
    latest_reel_media: true,
  },
  first: 12,
  include_multi_captions: true,
  last: null,
  username: "jorgekotz",
  // Bandeiras que o Relay exige. Perder qualquer uma faz o servidor recusar.
  __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: true,
  __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
  __relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider: false,
});

/**
 * O corpo inteiro, com a infraestrutura do Facebook junto: fb_dtsg e lsd sao
 * anti-falsificacao, e sem eles a requisicao e recusada.
 */
const corpoReal = (after = CURSOR) =>
  new URLSearchParams({
    av: "17841478475263986",
    __d: "www",
    __user: "0",
    __a: "1",
    __req: "16",
    __hs: "20702.HYP:instagram_web_pkg.2.1...0",
    dpr: "1",
    __ccg: "EXCELLENT",
    __rev: "1046917461",
    __s: "8c5d5hj;5kp7ju3m8pb",
    __hsi: "7682416219178194352",
    jazoest: "26408",
    lsd: "kr8ad3O87vFekv4aNK_TZG",
    __spin_r: "1046917461",
    __spin_b: "trunk",
    __spin_t: "1788701913",
    __crn: "comet.igweb.PolarisProfilePostsTabRoute",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "PolarisProfilePostsTabContentQuery_connection",
    fb_dtsg: "NAfyIGIBjasprIs7nRn1r4NuZF4eIn4rkdfgBqqaU3buptUVo86N4LA",
    server_timestamps: "true",
    variables: JSON.stringify(variaveis(after)),
    doc_id: DOC_ID,
  }).toString();

const capturaReal = () => ({
  url: "https://www.instagram.com/graphql/query",
  metodo: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    "x-ig-app-id": "936619743392459",
    "x-csrftoken": "T0K3N",
    "x-fb-friendly-name": "PolarisProfilePostsTabContentQuery_connection",
    cookie: "sessionid=segredo",
  },
  corpo: corpoReal(),
});

const corpoDe = (init) => new URLSearchParams(init.body);

describe("a consulta real do perfil", () => {
  it("é reconhecida, e o cursor vai dentro de variables", () => {
    const a = montarAssinatura(capturaReal());
    expect(a).not.toBeNull();
    expect(a.paramCursor).toBe("after");
    expect(a.ondeVaiOCursor).toBe("form");
  });

  it("troca o cursor sem tocar em mais nada de variables", () => {
    const a = montarAssinatura(capturaReal());
    const { init } = instagram.proximaPagina(a, "NOVO_CURSOR_123");

    const vars = JSON.parse(corpoDe(init).get("variables"));
    expect(vars.after).toBe("NOVO_CURSOR_123");
    expect(vars.username).toBe("jorgekotz");
    expect(vars.first).toBe(12);
    expect(vars.data.count).toBe(12);
    expect(vars.include_multi_captions).toBe(true);
  });

  it("preserva as bandeiras do Relay, sem as quais o servidor recusa", () => {
    const a = montarAssinatura(capturaReal());
    const { init } = instagram.proximaPagina(a, "X");
    const vars = JSON.parse(corpoDe(init).get("variables"));

    expect(vars.__relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider)
      .toBe(true);
    expect(vars.__relay_internal__pv__PolarisShortDramaEnabledrelayprovider)
      .toBe(false);
    expect(vars.__relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider)
      .toBe(false);
  });

  it("preserva doc_id, fb_dtsg, lsd e jazoest", () => {
    // Anti-falsificacao: perder qualquer um derruba a requisicao inteira, e o
    // erro que volta nao diz qual faltou.
    const a = montarAssinatura(capturaReal());
    const { init } = instagram.proximaPagina(a, "X");
    const corpo = corpoDe(init);

    expect(corpo.get("doc_id")).toBe(DOC_ID);
    expect(corpo.get("fb_dtsg")).toBe(
      "NAfyIGIBjasprIs7nRn1r4NuZF4eIn4rkdfgBqqaU3buptUVo86N4LA",
    );
    expect(corpo.get("lsd")).toBe("kr8ad3O87vFekv4aNK_TZG");
    expect(corpo.get("jazoest")).toBe("26408");
  });

  it("mantém o nome amigável, que é como eles roteiam a consulta", () => {
    const a = montarAssinatura(capturaReal());
    const { init } = instagram.proximaPagina(a, "X");
    expect(corpoDe(init).get("fb_api_req_friendly_name")).toBe(
      "PolarisProfilePostsTabContentQuery_connection",
    );
    expect(init.headers["x-fb-friendly-name"]).toBe(
      "PolarisProfilePostsTabContentQuery_connection",
    );
  });

  it("não reenvia o cookie: quem anexa a sessão é o navegador", () => {
    const a = montarAssinatura(capturaReal());
    expect(Object.keys(a.headers)).not.toContain("cookie");
    expect(a.headers["x-csrftoken"]).toBe("T0K3N");
  });

  it("o cursor devolvido pelo Instagram serve como está", () => {
    // Formato <id>_<usuario>. Nada de escapar ou fatiar: vai inteiro.
    const a = montarAssinatura(capturaReal());
    const { init } = instagram.proximaPagina(a, CURSOR);
    expect(JSON.parse(corpoDe(init).get("variables")).after).toBe(CURSOR);
  });
});
