import { describe, it, expect, vi } from "vitest";
import { criarBaixador } from "../src/acervo/baixador.js";
import { instagram } from "../src/adapters/instagram.js";
import { criarPost, criarPosts, criarMidia } from "./apoio/fabrica.js";

function ambiente(sobrescrever = {}) {
  const escritos = new Map();
  const textos = new Map();
  const marcados = [];

  const abrirDestino = vi.fn(async (nome) => {
    const pedacos = [];
    escritos.set(nome, pedacos);
    return new WritableStream({ write: (p) => { pedacos.push(p); } });
  });

  const escreverTexto = vi.fn(async (nome, texto) => { textos.set(nome, texto); });

  const buscarMidia = vi.fn(async (url) => new Blob([`conteudo:${url}`]));

  const repo = {
    baixados: { async marcar(regs) { marcados.push(...regs); } },
    jobs: { salvar: vi.fn(async () => {}) },
  };

  return {
    escritos, textos, marcados, abrirDestino, escreverTexto, buscarMidia, repo,
    baixador: criarBaixador({
      adaptador: instagram, buscarMidia, abrirDestino, escreverTexto, repo,
      ...sobrescrever,
    }),
  };
}

const posicoesDe = (posts, inicio = 1) =>
  new Map(posts.map((p, i) => [p.key, inicio + i]));

// A fábrica monta as chaves como "ig:@perfil#ID", então o profileKey do pedido
// tem que ser o mesmo, senão nada casa.
const PERFIL = "perfil";
const CHAVE_PERFIL = "ig:@perfil";

const pedido = (posts, extra = {}) => ({
  jobId: "j1",
  perfil: PERFIL,
  profileKey: CHAVE_PERFIL,
  posts,
  posicoes: posicoesDe(posts),
  opcoes: { filtro: "ambos", incluirCapaReel: false },
  ...extra,
});

describe("baixar", () => {
  it("escreve um ZIP por parte de 100 posts", async () => {
    const env = ambiente();
    const posts = criarPosts(250);
    const r = await env.baixador.baixar(pedido(posts));

    expect(r.partes).toHaveLength(3);
    expect([...env.escritos.keys()]).toEqual([
      "parte-01_posts-001-100.zip",
      "parte-02_posts-101-200.zip",
      "parte-03_posts-201-250.zip",
    ]);
  });

  it("respeita o tamanho de partição customizado", async () => {
    const env = ambiente();
    const r = await env.baixador.baixar(pedido(criarPosts(10), { tamanhoParte: 4 }));
    expect(r.partes).toHaveLength(3);
  });

  it("baixa cada mídia uma vez só", async () => {
    const env = ambiente();
    await env.baixador.baixar(pedido(criarPosts(5)));
    expect(env.buscarMidia).toHaveBeenCalledTimes(5);
    const urls = env.buscarMidia.mock.calls.map((c) => c[0]);
    expect(new Set(urls).size).toBe(5);
  });

  it("expande o carrossel em vários arquivos dentro da mesma parte", async () => {
    const env = ambiente();
    const carrossel = criarPost({ id: "CAR", seq: 1, tipo: "carrossel", midias: [
      criarMidia({ ordem: 0, kind: "foto" }),
      criarMidia({ ordem: 1, kind: "foto" }),
      criarMidia({ ordem: 2, kind: "video" }),
    ]});
    const r = await env.baixador.baixar(pedido([carrossel]));
    expect(env.buscarMidia).toHaveBeenCalledTimes(3);
    expect(r.arquivos).toBe(3);
  });

  it("aplica o filtro de mídia dentro do carrossel", async () => {
    const env = ambiente();
    const carrossel = criarPost({ id: "CAR", seq: 1, tipo: "carrossel", midias: [
      criarMidia({ ordem: 0, kind: "foto" }),
      criarMidia({ ordem: 1, kind: "video" }),
    ]});
    await env.baixador.baixar(
      pedido([carrossel], { opcoes: { filtro: "fotos", incluirCapaReel: false } }),
    );
    expect(env.buscarMidia).toHaveBeenCalledTimes(1);
  });

  it("numera os arquivos pela posição, preenchendo com zeros", async () => {
    const env = ambiente();
    const posts = criarPosts(5);
    // posições 998..1002: quatro dígitos no lote inteiro, então 998 vira 0998
    await env.baixador.baixar(pedido(posts, { posicoes: posicoesDe(posts, 998) }));
    const csv = env.textos.get("acervo.csv");
    expect(csv).toContain("0998_");
    expect(csv).toContain("1002_");
  });

  it("marca como baixado só o post cujas mídias todas deram certo", async () => {
    const env = ambiente();
    const bom = criarPost({ id: "BOM", seq: 1 });
    const ruim = criarPost({ id: "RUIM", seq: 2, tipo: "carrossel", midias: [
      criarMidia({ ordem: 0, kind: "foto", url: "https://cdn.test/ok.jpg" }),
      criarMidia({ ordem: 1, kind: "foto", url: "https://cdn.test/quebrado.jpg" }),
    ]});

    env.buscarMidia.mockImplementation(async (url) => {
      if (url.includes("quebrado")) throw new Error("404");
      return new Blob(["x"]);
    });

    const r = await env.baixador.baixar(pedido([bom, ruim]));
    expect(env.marcados.map((m) => m.key)).toEqual(["ig:@perfil#BOM"]);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].motivo).toContain("404");
  });

  it("uma mídia morta não derruba o resto do lote", async () => {
    const env = ambiente();
    env.buscarMidia.mockImplementation(async (url) =>
      url.includes("video-3") ? Promise.reject(new Error("morreu")) : new Blob(["x"]),
    );
    const posts = criarPosts(5, (i) => ({
      id: `P${i}`,
      midias: [criarMidia({ ordem: 0, kind: "video", url: `https://cdn.test/video-${i}.mp4` })],
    }));
    const r = await env.baixador.baixar(pedido(posts));
    expect(r.arquivos).toBe(4);
    expect(r.falhas).toHaveLength(1);
    expect(env.escritos.size).toBe(1);
  });

  it("reinicia o resolvedor de colisão a cada parte", async () => {
    const env = ambiente();
    // template fixo força todos os nomes a colidirem
    const posts = criarPosts(4);
    await env.baixador.baixar(pedido(posts, { template: "igual", tamanhoParte: 2 }));
    const csv = env.textos.get("acervo.csv");
    // duas partes, cada uma com "igual" e "igual-2"
    expect([...csv.matchAll(/igual-2/g)]).toHaveLength(2);
    expect([...csv.matchAll(/igual-3/g)]).toHaveLength(0);
  });

  it("escreve o acervo.csv com uma linha por post baixado", async () => {
    const env = ambiente();
    await env.baixador.baixar(pedido(criarPosts(3)));
    const linhas = env.textos.get("acervo.csv").trim().split("\r\n");
    expect(linhas).toHaveLength(4); // cabeçalho + 3
  });

  it("escreve o relatorio.json com as partes e as falhas", async () => {
    const env = ambiente();
    env.buscarMidia.mockRejectedValueOnce(new Error("timeout"));
    await env.baixador.baixar(pedido(criarPosts(2)));
    const rel = JSON.parse(env.textos.get("relatorio.json"));
    expect(rel.partes).toHaveLength(1);
    expect(rel.totalDeFalhas).toBe(1);
    expect(rel.perfil).toBe(CHAVE_PERFIL);
  });

  it("registra no relatório o que saiu com marca d'água", async () => {
    const env = ambiente();
    const comMarca = criarPost({ id: "TT", seq: 1, comMarcaDagua: true });
    await env.baixador.baixar(pedido([comMarca]));
    const rel = JSON.parse(env.textos.get("relatorio.json"));
    expect(rel.comMarcaDagua).toEqual(["ig:@perfil#TT"]);
  });

  it("reporta progresso por arquivo e por parte", async () => {
    const aoProgresso = vi.fn();
    const env = ambiente({ aoProgresso });
    await env.baixador.baixar(pedido(criarPosts(3), { tamanhoParte: 2 }));
    const tipos = aoProgresso.mock.calls.map((c) => c[0].tipo);
    expect(tipos).toContain("arquivo");
    expect(tipos).toContain("parte");
  });

  it("respeita o limite de concorrência", async () => {
    let emVoo = 0;
    let pico = 0;
    const env = ambiente();
    env.buscarMidia.mockImplementation(async () => {
      pico = Math.max(pico, ++emVoo);
      await new Promise((r) => setTimeout(r, 3));
      emVoo--;
      return new Blob(["x"]);
    });
    await env.baixador.baixar(pedido(criarPosts(20), { concorrencia: 3 }));
    expect(pico).toBeLessThanOrEqual(3);
  });

  it("aceita seleção vazia sem escrever nada", async () => {
    const env = ambiente();
    const r = await env.baixador.baixar(pedido([]));
    expect(r.partes).toEqual([]);
    expect(env.abrirDestino).not.toHaveBeenCalled();
  });

  it("cancela quando o sinal aborta", async () => {
    const ctrl = new AbortController();
    const env = ambiente();
    env.buscarMidia.mockImplementation(async () => { ctrl.abort(); return new Blob(["x"]); });
    await expect(
      env.baixador.baixar(pedido(criarPosts(50), { sinal: ctrl.signal })),
    ).rejects.toThrow(/cancelado/i);
  });
});
