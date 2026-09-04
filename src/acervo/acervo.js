import { abrirAcervo as abrirBanco } from "../core/db.js";
import { resolverSelecao } from "../core/selection.js";
import { criarBaixador } from "./baixador.js";
import { criarGrade } from "./grid.js";
import { criarExecutor } from "./executor.js";
import { criarColetor } from "./coletor.js";
import { resolverAlvo } from "./alvo.js";
import { rodarDiagnostico } from "./diagnostico.js";
import { estadoDaTela } from "./mensagens.js";
import {
  escolherPasta, reautorizar, criarDestinoEmPasta, criarDestinoEmMemoria,
  temFileSystemAccess,
} from "./destino.js";

const $ = (id) => document.getElementById(id);
const numero = (n) => new Intl.NumberFormat("pt-BR").format(n ?? 0);
const dizer = (texto) => { $("estado").textContent = texto; };

let repo;
let executor;
let grade;
let alvo = null;
let posts = [];
let cancelador = null;
let pastaDestino = null;

// --- grade e estado da tela -------------------------------------------------

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

/** Uma grade vazia sem explicação é o pior estado possível. */
function mostrarVazio(vazio) {
  $("vazio").hidden = !vazio;
  $("grade").hidden = Boolean(vazio);
  if (!vazio) return;

  $("vazioTitulo").textContent = vazio.titulo;
  $("vazioPorque").textContent = vazio.porque ?? "";

  const passos = $("vazioPassos");
  passos.innerHTML = "";
  for (const passo of vazio.passos) {
    const li = document.createElement("li");
    li.textContent = passo;
    passos.append(li);
  }
}

async function redesenhar() {
  if (!alvo?.ok) {
    grade.definirItens([]);
    dizer("Nenhum perfil escolhido");
    mostrarVazio({
      titulo: "Escolha um perfil",
      passos: [
        "Cole o endereço do perfil no campo acima, ou só o @ dele.",
        "Clique em Indexar perfil.",
      ],
      porque:
        "O Acervo abre o perfil numa aba e cataloga a partir de lá, usando a sua " +
        "sessão já logada no navegador. Nenhuma senha passa por aqui.",
    });
    return;
  }

  const baixados = await repo.baixados.chavesDoPerfil(alvo.profileKey);
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

  const tela = estadoDaTela({
    total,
    baixados: baixados.size,
    // Nesta arquitetura não há assinatura a aprender: basta conhecer o perfil.
    temAssinatura: true,
    temAba: true,
  });
  dizer(tela.resumo);
  mostrarVazio(total === 0 ? tela.vazio : null);
}

// --- perfil alvo ------------------------------------------------------------

async function trocarAlvo(entrada, { redesenha = true } = {}) {
  const resolvido = resolverAlvo(entrada);

  if (!resolvido.ok) {
    alvo = null;
    posts = [];
    $("perfil").textContent = "nenhum perfil escolhido";
    dizer(resolvido.erro);
    if (redesenha) await redesenhar();
    return false;
  }

  alvo = resolvido;
  $("perfil").textContent = `${alvo.profileKey} · ${alvo.urlDoPerfil}`;
  posts = await repo.posts.listarPorPerfil(alvo.profileKey);
  if (redesenha) await redesenhar();
  return true;
}

// --- ações ------------------------------------------------------------------

async function indexar() {
  if (!(await trocarAlvo($("urlPerfil").value, { redesenha: false }))) return;

  const controle = new AbortController();
  cancelador = controle;
  $("cancelar").hidden = false;
  $("indexar").disabled = true;

  const coletor = criarColetor({
    executor,
    repo,
    aoProgresso: ({ indexados, paginas, total, aviso, rolando, paradas, limite }) => {
      if (aviso) {
        dizer(`${aviso} (${numero(indexados)} até agora)`);
        return;
      }

      // Com o total declarado dá para dizer quanto falta; sem ele, só o quanto
      // já veio. Nos dois casos o número precisa mudar, senão parece travado.
      const quanto = total
        ? `${numero(indexados)} de ~${numero(total)} (${Math.min(100, Math.round((indexados / total) * 100))}%)`
        : `${numero(indexados)} publicações`;

      const como = rolando
        ? `rolando a página${paradas > 0 ? `, ${paradas}/${limite} rodadas sem novidade` : ""}`
        : `${paginas} páginas`;

      dizer(`Indexando… ${quanto} · ${como}`);
    },
  });

  try {
    dizer("Abrindo a aba do perfil…");
    const r = await coletor.coletar({
      adaptador: alvo.adaptador,
      handle: alvo.handle,
      profileKey: alvo.profileKey,
      urlDoPerfil: alvo.urlDoPerfil,
      seqInicial: await repo.posts.maiorSeq(alvo.profileKey),
      sinal: controle.signal,
    });
    const comoVeio = r.recuouParaRolagem ? " (coletado pela rolagem da página)" : "";
    const doTotal = r.total ? ` de ~${numero(r.total)} que o perfil declara` : "";
    dizer(
      r.completo
        ? `Catálogo completo: ${numero(r.indexados)} publicações${doTotal}.` + comoVeio
        : `Parou em ${numero(r.indexados)}${doTotal}.` + comoVeio +
          " Clique em Indexar perfil para continuar de onde parou.",
    );
  } catch (erro) {
    dizer(erro.message);
    mostrarVazio({
      titulo: "A indexação parou",
      passos: [erro.message, "Clique em Diagnóstico para ver qual passo falhou."],
      porque: String(erro.causa?.message ?? ""),
    });
  } finally {
    cancelador = null;
    $("cancelar").hidden = true;
    $("indexar").disabled = false;
    if (alvo?.ok) posts = await repo.posts.listarPorPerfil(alvo.profileKey);
    await redesenhar();
  }
}

async function diagnosticar() {
  const lista = $("diagLista");
  $("diagPainel").hidden = false;
  lista.innerHTML = "";

  const testando = document.createElement("li");
  testando.textContent = "Testando…";
  lista.append(testando);

  const passos = await rodarDiagnostico({
    executor,
    repo,
    alvo: resolverAlvo($("urlPerfil").value),
  });

  lista.innerHTML = "";
  for (const passo of passos) {
    const li = document.createElement("li");
    li.className = `passo ${passo.estado}`;

    const nome = document.createElement("strong");
    nome.textContent = passo.nome;
    const detalhe = document.createElement("span");
    detalhe.textContent = passo.detalhe;

    li.append(nome, detalhe);
    lista.append(li);
  }
}

async function baixar() {
  if (!alvo?.ok) {
    dizer("Escolha um perfil antes de baixar.");
    return;
  }

  const baixados = await repo.baixados.chavesDoPerfil(alvo.profileKey);
  const { selecionados, posicoes } = selecaoAtual(baixados);
  if (selecionados.length === 0) {
    dizer("Nada selecionado para baixar.");
    return;
  }

  const carimbo = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  const segmentos = ["Acervo", alvo.adaptador.id, `@${alvo.handle}`, carimbo];

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
    adaptador: alvo.adaptador,
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
      perfil: alvo.handle,
      profileKey: alvo.profileKey,
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
      (r.falhas.length ? `, ${r.falhas.length} falhas (veja relatorio.json)` : "") + ".",
    );
  } catch (erro) {
    dizer(`Download interrompido: ${erro.message}`);
  } finally {
    cancelador = null;
    $("cancelar").hidden = true;
    await redesenhar();
  }
}

// --- início -----------------------------------------------------------------

async function iniciar() {
  const versao = chrome.runtime.getManifest().version;
  $("versao").textContent = `v${versao}`;
  console.log("[Acervo] aba v" + versao);

  repo = await abrirBanco();
  executor = criarExecutor(chrome);

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

  // Só consulta: pedir permissão exige gesto do usuário e lançaria aqui.
  const guardada = await repo.handles.obter("pastaDestino");
  if (guardada && (await reautorizar(guardada, { pedir: false }))) pastaDestino = guardada;

  // O perfil pode vir da URL (clique no botão da página) ou ser digitado.
  const params = new URLSearchParams(location.search);
  const inicial = params.get("perfil");
  if (inicial) {
    $("urlPerfil").value = inicial;
    await trocarAlvo(inicial);
  } else {
    await redesenhar();
  }

  for (const id of ["filtro", "ordenacao", "de", "ate", "pularBaixados"]) {
    $(id).addEventListener("change", redesenhar);
  }
  $("urlPerfil").addEventListener("change", () => trocarAlvo($("urlPerfil").value));
  $("urlPerfil").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") indexar();
  });
  $("indexar").addEventListener("click", indexar);
  $("diagnostico").addEventListener("click", diagnosticar);
  $("baixar").addEventListener("click", baixar);
  $("cancelar").addEventListener("click", () => cancelador?.abort());
  $("fecharDiag").addEventListener("click", () => { $("diagPainel").hidden = true; });
  $("fecharProgresso").addEventListener("click", () => { $("progresso").hidden = true; });

  $("escolherPasta").addEventListener("click", async () => {
    if (!temFileSystemAccess()) {
      dizer("Este navegador não tem File System Access; o download usará o modo memória.");
      return;
    }
    try {
      pastaDestino = await escolherPasta();
      await repo.handles.salvar("pastaDestino", pastaDestino);
      dizer("Pasta de destino guardada.");
    } catch {
      dizer("Nenhuma pasta escolhida. O download vai usar o modo memória.");
    }
  });

  if (params.get("acao") === "indexar") indexar();
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
