import { abrirAcervo as abrirBanco } from "../core/db.js";
import { adaptadorPorId } from "../adapters/index.js";
import { resolverSelecao } from "../core/selection.js";
import { criarIndexador } from "./indexador.js";
import { criarBaixador } from "./baixador.js";
import { criarGrade } from "./grid.js";
import { criarTransporteViaHook } from "./transporte.js";
import { estadoDaTela } from "./mensagens.js";
import {
  escolherPasta, reautorizar, criarDestinoEmPasta, criarDestinoEmMemoria,
  temFileSystemAccess,
} from "./destino.js";

const params = new URLSearchParams(location.search);
const profileKey = params.get("perfil");
const abaAlvo = params.get("aba") ? Number(params.get("aba")) : null;
const acao = params.get("acao");

const $ = (id) => document.getElementById(id);
const numero = (n) => new Intl.NumberFormat("pt-BR").format(n);
const dizer = (texto) => { $("estado").textContent = texto; };

const PREFIXO_PARA_ID = { ig: "instagram", tt: "tiktok" };

let repo;
let adaptador;
let posts = [];
let grade;
let cancelador = null;
let pastaDestino = null;

/** Ordena e filtra segundo os controles, e devolve o recorte pedido. */
function selecaoAtual(baixados) {
  const marcadas = grade.selecionadas();
  return resolverSelecao({
    posts,
    filtro: $("filtro").value,
    ordenacao: $("ordenacao").value,
    modo: marcadas.size > 0 ? "manual" : "faixa",
    de: Number($("de").value) || 1,
    ate: Number($("ate").value) || 1,
    manuais: marcadas,
    pularBaixados: $("pularBaixados").checked,
    baixados,
  });
}

async function redesenhar() {
  const baixados = await repo.baixados.chavesDoPerfil(profileKey);
  const { posicoes, total } = selecaoAtual(baixados);

  const ordenados = posts
    .map((p) => ({ ...p, posicao: posicoes.get(p.key) }))
    .filter((p) => p.posicao != null)
    .sort((a, b) => a.posicao - b.posicao);

  grade.definirItens(
    ordenados.map((p) => ({
      chave: p.key,
      posicao: p.posicao,
      post: p,
      jaBaixado: baixados.has(p.key),
    })),
  );

  const perfil = await repo.perfis.obter(profileKey);
  const tela = estadoDaTela({
    total,
    baixados: baixados.size,
    temAssinatura: Boolean(perfil?.assinatura),
    temAba: abaAlvo != null,
  });

  dizer(tela.resumo);
  mostrarVazio(tela.vazio);
}

/** Uma grade vazia sem explicação é o pior estado possível. */
function mostrarVazio(vazio) {
  const caixa = $("vazio");
  caixa.hidden = !vazio;
  $("grade").hidden = Boolean(vazio);
  if (!vazio) return;

  $("vazioTitulo").textContent = vazio.titulo;
  $("vazioPorque").textContent = vazio.porque;

  const passos = $("vazioPassos");
  passos.innerHTML = "";
  for (const passo of vazio.passos) {
    const li = document.createElement("li");
    li.textContent = passo;
    passos.append(li);
  }
}

function renderizarItem(item, el) {
  const { post } = item;
  el.classList.toggle("baixado", item.jaBaixado);

  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = post.capaUrl;
  img.alt = "";

  const posicao = document.createElement("span");
  posicao.className = "posicao";
  posicao.textContent = `#${item.posicao}`;

  const metricas = document.createElement("span");
  metricas.className = "metricas";
  metricas.textContent =
    `${numero(post.curtidas)} curtidas` + (post.views ? ` · ${numero(post.views)} views` : "");

  const seq = document.createElement("span");
  seq.className = "seq";
  seq.textContent = `seq ${post.seq}`;

  el.append(img, posicao, metricas, seq);
}

async function indexar() {
  if (abaAlvo == null) {
    dizer(
      "Não sei de qual aba indexar. Volte para a aba do perfil e abra o " +
      "Acervo pelo botão que fica no canto inferior direito da página.",
    );
    return;
  }

  const perfil = await repo.perfis.obter(profileKey);
  if (!perfil?.assinatura) {
    dizer(
      "Ainda não vi o feed deste perfil. Volte para a aba do perfil, " +
      "recarregue com F5, role a grade por alguns segundos e tente de novo.",
    );
    return;
  }

  const controle = new AbortController();
  cancelador = controle;
  $("cancelar").hidden = false;

  const indexador = criarIndexador({
    adaptador,
    repo,
    transporte: criarTransporteViaHook({
      abaAlvo,
      enviar: (msg) => chrome.runtime.sendMessage(msg),
    }),
    aoProgresso: ({ indexados, paginas }) =>
      dizer(`Indexando… ${numero(indexados)} publicações em ${paginas} páginas`),
  });

  try {
    const r = await indexador.indexar({
      profileKey,
      assinatura: perfil.assinatura,
      cursor: perfil.cursor ?? null,
      seqInicial: await repo.posts.maiorSeq(profileKey),
      sinal: controle.signal,
    });
    dizer(
      r.completo
        ? `Catálogo completo: ${numero(r.indexados)} publicações.`
        : `Parou em ${numero(r.indexados)}. Clique em Indexar para continuar de onde parou.`,
    );
  } catch (erro) {
    dizer(
      `Indexação interrompida: ${erro.message}. ` +
      "Espere alguns minutos antes de tentar de novo.",
    );
  } finally {
    cancelador = null;
    $("cancelar").hidden = true;
    posts = await repo.posts.listarPorPerfil(profileKey);
    await redesenhar();
  }
}

async function baixar() {
  const baixados = await repo.baixados.chavesDoPerfil(profileKey);
  const { selecionados, posicoes } = selecaoAtual(baixados);
  if (selecionados.length === 0) {
    dizer("Nada selecionado para baixar.");
    return;
  }

  const carimbo = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  const handle = profileKey.split("@")[1];
  const segmentos = ["Acervo", adaptador.id, `@${handle}`, carimbo];

  const destino = pastaDestino
    ? await criarDestinoEmPasta(pastaDestino, segmentos)
    : criarDestinoEmMemoria({
        baixar: (opcoes) => chrome.downloads.download(opcoes),
        subpasta: segmentos.join("/"),
      });

  if (!pastaDestino) {
    dizer("Sem pasta escolhida: baixando em modo memória, com partes limitadas a 500 MB.");
  }

  const controle = new AbortController();
  cancelador = controle;
  $("cancelar").hidden = false;
  $("progresso").hidden = false;
  $("partes").innerHTML = "";

  const baixador = criarBaixador({
    adaptador,
    repo,
    buscarMidia: async (url, sinal) => {
      const resposta = await fetch(url, { signal: sinal });
      if (!resposta.ok) throw new Error(`CDN respondeu ${resposta.status}`);
      return resposta.blob();
    },
    abrirDestino: destino.abrirDestino,
    escreverTexto: destino.escreverTexto,
    aoProgresso: (evento) => {
      if (evento.tipo === "arquivo") {
        $("progressoTexto").textContent = `${numero(evento.arquivos)} arquivos · ${evento.nome}`;
      } else {
        const li = document.createElement("li");
        li.textContent = `${evento.nome} — parte ${evento.n} de ${evento.de}`;
        $("partes").append(li);
      }
    },
  });

  try {
    const r = await baixador.baixar({
      jobId: `job-${Date.now()}`,
      perfil: handle,
      profileKey,
      posts: selecionados,
      posicoes,
      opcoes: {
        filtro: $("filtro").value,
        incluirCapaReel: $("incluirCapaReel").checked,
        ordenacao: $("ordenacao").value,
      },
      sinal: controle.signal,
    });
    dizer(
      `Pronto: ${r.partes.length} partes, ${numero(r.arquivos)} arquivos` +
      (r.falhas.length ? `, ${r.falhas.length} falhas (veja relatorio.json)` : "") +
      ".",
    );
  } catch (erro) {
    dizer(`Download interrompido: ${erro.message}`);
  } finally {
    cancelador = null;
    $("cancelar").hidden = true;
    await redesenhar();
  }
}

async function iniciar() {
  // Recarregar a extensão não recarrega uma aba chrome-extension:// já aberta.
  // Mostrar a versão torna óbvio quando esta aba está rodando código velho.
  const versao = chrome.runtime.getManifest().version;
  $("versao").textContent = "v" + versao;
  console.log("[Acervo] aba v" + versao);

  repo = await abrirBanco();

  if (!profileKey) {
    dizer("Abra um perfil do Instagram ou do TikTok e clique no botão do Acervo.");
    return;
  }

  adaptador = adaptadorPorId(PREFIXO_PARA_ID[profileKey.split(":")[0]]);
  $("perfil").textContent = profileKey;

  grade = criarGrade({
    container: $("grade"),
    alturaLinha: 260,
    colunas: 5,
    renderizar: renderizarItem,
    aoMudarSelecao: (marcadas) => {
      $("baixar").textContent =
        marcadas.size > 0 ? `Baixar ${numero(marcadas.size)} marcadas` : "Baixar";
    },
  });

  // Recupera a pasta escolhida numa sessão anterior, se o usuário reautorizar.
  // Só consulta. Pedir permissão exige gesto do usuário e lançaria aqui,
  // derrubando a inicialização inteira em silêncio.
  const guardada = await repo.handles.obter("pastaDestino");
  if (guardada && (await reautorizar(guardada, { pedir: false }))) {
    pastaDestino = guardada;
  }

  posts = await repo.posts.listarPorPerfil(profileKey);
  await redesenhar();

  for (const id of ["filtro", "ordenacao", "de", "ate", "pularBaixados"]) {
    $(id).addEventListener("change", redesenhar);
  }
  $("indexar").addEventListener("click", indexar);
  $("baixar").addEventListener("click", baixar);
  $("cancelar").addEventListener("click", () => cancelador?.abort());

  $("escolherPasta").addEventListener("click", async () => {
    if (!temFileSystemAccess()) {
      dizer("Este navegador não tem File System Access; o download usará o modo memória.");
      return;
    }
    try {
      const guardadaAgora = await repo.handles.obter("pastaDestino");
      if (guardadaAgora && (await reautorizar(guardadaAgora, { pedir: true }))) {
        pastaDestino = guardadaAgora;
        dizer("Pasta anterior reautorizada.");
        return;
      }
      pastaDestino = await escolherPasta();
      await repo.handles.salvar("pastaDestino", pastaDestino);
      dizer("Pasta de destino guardada.");
    } catch {
      dizer("Nenhuma pasta escolhida. O download vai usar o modo memória.");
    }
  });

  chrome.runtime.onMessage.addListener((mensagem) => {
    // Quem grava a assinatura é o service worker, que a higieniza antes: a
    // carga crua carrega o header cookie e não pode ir para o banco.
    if (mensagem?.tipo === "capturou") {
      // O service worker acabou de gravar a assinatura; a tela precisa refletir
      // que agora dá para indexar.
      redesenhar();
    }
  });

  if (acao === "indexar") indexar();
}

iniciar().catch((erro) => {
  // Sem isto a página fica em "Carregando…" para sempre e não há como saber
  // o que quebrou. Um erro visível é sempre melhor que uma tela morta.
  console.error("[Acervo] falhei ao iniciar a aba:", erro);
  const estado = document.getElementById("estado");
  if (estado) estado.textContent = `Erro ao abrir o Acervo: ${erro?.message ?? erro}`;
  mostrarVazio({
    titulo: "O Acervo não conseguiu abrir",
    passos: [
      "Recarregue esta aba (F5).",
      "Se continuar, abra o console desta aba (F12) e me mande a linha que começa com [Acervo].",
    ],
    porque: String(erro?.stack ?? erro),
  });
});
