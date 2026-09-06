import { abrirAcervo as abrirBanco } from "../core/db.js";
import { resolverSelecao } from "../core/selection.js";
import { criarBaixador } from "./baixador.js";
import { criarGrade } from "./grid.js";
import { criarExecutor } from "./executor.js";
import { criarColetor } from "./coletor.js";
import { criarColetorDireto } from "./direto.js";
import { criarAprendiz } from "./assinatura-aba.js";
import { abrirCanal } from "./canal.js";
import { criarRegistro } from "./registro.js";
import { resumirCatalogo, textoDoResumo } from "../core/resumo.js";
import { resolverAlvo } from "./alvo.js";
import { destaques } from "../adapters/destaques.js";
import { rodarDiagnostico } from "./diagnostico.js";
import { tetoDaIndexacao, porQueIndexaTudo } from "./escopo.js";
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

/**
 * A ultima falha da indexacao, ou null.
 *
 * Guardada porque o redesenho roda DEPOIS do catch, no finally, e reescreve a
 * tela inteira: sem lembrar a falha, ela era apagada no mesmo instante em que
 * aparecia.
 */
let falhaAtual = null;

const registro = criarRegistro();

/**
 * Escreve o registro na tela.
 *
 * Nunca passa por redesenhar(): foi justamente o redesenho que vinha apagando
 * o erro no instante em que ele aparecia.
 */
function desenharRegistro() {
  const linhas = registro.todas();
  $("registro").hidden = linhas.length === 0;

  const lista = $("registroLinhas");
  lista.textContent = "";
  for (const linha of linhas) {
    const item = document.createElement("li");
    if (linha.tipo !== "passo") item.className = linha.tipo;

    const hora = document.createElement("span");
    hora.className = "hora";
    hora.textContent = linha.hora;

    const texto = document.createElement("span");
    texto.className = "texto";
    texto.textContent = linha.texto;

    item.append(hora, texto);
    lista.append(item);
  }
  lista.scrollTop = lista.scrollHeight;
}

/**
 * Copia o registro como texto.
 *
 * Serve para o relato chegar colavel em vez de print: numero de versao, hora
 * e mensagem inteira, sem depender de a imagem estar legivel.
 */
async function copiarRegistro() {
  const texto = registro.texto();
  if (!texto) return;

  const botao = $("copiarRegistro");
  const rotulo = botao.textContent;
  try {
    await navigator.clipboard.writeText(texto);
    botao.textContent = "Copiado";
  } catch {
    // Area de transferencia negada: selecionar o texto ainda funciona.
    botao.textContent = "Selecione e copie";
  }
  setTimeout(() => { botao.textContent = rotulo; }, 2000);
}

const anotar = (texto, tipo = "passo") => {
  registro.anotar(texto, tipo);
  desenharRegistro();
};
const anotarErro = (texto) => anotar(texto, "erro");
const anotarFim = (texto) => anotar(texto, "fim");
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
    pularBaixados: false,
    baixados,
  });
}

const ROTULO_TIPO = { foto: "Foto", video: "Vídeo", carrossel: "Carrossel" };

/** O que a publicação é, em uma linha: tipo e, no carrossel, quantas páginas. */
function descreverTipo(post) {
  const base = ROTULO_TIPO[post.tipo] ?? post.tipo;
  if (post.tipo !== "carrossel") return base;
  return `${base} · ${post.midias.length}`;
}

function renderizarItem(item, el) {
  const { post } = item;
  el.classList.toggle("baixado", item.jaBaixado);
  el.dataset.tipo = post.tipo;

  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = post.capaUrl;
  img.alt = "";

  const selo = document.createElement("span");
  selo.className = "selo";
  selo.textContent = descreverTipo(post);

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

  el.append(img, selo, posicao, metricas, seq);
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

  const contagem = resumirCatalogo(posts);
  const resumo = textoDoResumo(contagem);
  $("resumo").hidden = !resumo;
  $("resumo").textContent = resumo;

  const tela = estadoDaTela({
    total,
    baixados: baixados.size,
    // Nesta arquitetura não há assinatura a aprender: basta conhecer o perfil.
    temAssinatura: true,
    temAba: true,
  });
  // A falha manda enquanto nada entrou: dizer "Catalogo vazio" por cima de
  // um erro esconde justamente a informacao que o usuario precisa.
  if (falhaAtual && total === 0) {
    dizer(falhaAtual.mensagem);
    mostrarVazio(falhaAtual);
  } else {
    dizer(tela.resumo);
    mostrarVazio(total === 0 ? tela.vazio : null);
  }
  atualizarNotaDeEscopo();
}

/** O que os controles da tela dizem sobre até onde catalogar. */
function pedidoDeEscopo() {
  return {
    escopo: $("escopo").value,
    modo: grade.selecionadas().size > 0 ? "manual" : "faixa",
    ordenacao: $("ordenacao").value,
    de: Number($("de").value) || 1,
    ate: Number($("ate").value) || 1,
  };
}

/** Diz na tela quando o teto não vale, e por quê. */
function atualizarNotaDeEscopo() {
  const pedido = pedidoDeEscopo();
  const teto = tetoDaIndexacao(pedido);
  const nota = $("notaEscopo");

  if (teto != null) {
    nota.hidden = false;
    nota.textContent =
      `Vai catalogar só as ${numero(teto)} primeiras publicações — ` +
      "é rápido e não precisa rolar a página.";
    return;
  }

  const motivo = porQueIndexaTudo(pedido);
  nota.hidden = !motivo;
  if (motivo) nota.textContent = motivo;
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

/**
 * Por que a busca direta não deu conta.
 *
 * Fica numa nota fixa porque a linha de estado é sobrescrita pelo progresso
 * da coleta seguinte em menos de um segundo — e este é justamente o texto que
 * explica por que a aba precisou abrir.
 */
function avisarRecuo(motivo) {
  const nota = $("recuo");
  nota.hidden = false;
  nota.textContent =
    `A busca em segundo plano não deu conta: ${motivo} ` +
    "Clique em Diagnóstico para ver os detalhes.";
}

function limparRecuo() {
  $("recuo").hidden = true;
  $("recuo").textContent = "";
}

/** O que dizer enquanto a coleta anda, venha ela de qual caminho vier. */
function relatarProgresso({ indexados, paginas, total, aviso, rolando, paradas, limite, semAba }) {
  if (aviso) {
    dizer(`${aviso} (${numero(indexados ?? 0)} até agora)`);
    return;
  }

  const quanto = total
    ? `${numero(indexados)} de ~${numero(total)} ` +
      `(${Math.min(100, Math.round((indexados / total) * 100))}%)`
    : `${numero(indexados)} publicações`;

  const como = semAba
    ? "sem abrir aba"
    : rolando
      ? `rolando a página${paradas > 0 ? `, ${paradas}/${limite} sem novidade` : ""}`
      : `${paginas} páginas`;

  dizer(`Buscando… ${quanto} · ${como}`);
}

async function indexar({ eDepoisBaixar = false } = {}) {
  registro.limpar();
  anotar(`indexar: ${$("urlPerfil").value || "(campo vazio)"}`);

  if (!(await trocarAlvo($("urlPerfil").value, { redesenha: false }))) {
    anotarErro("endereço de perfil não reconhecido — a indexação nem começou");
    return;
  }

  const controle = new AbortController();
  cancelador = controle;
  $("cancelar").hidden = false;
  $("indexar").disabled = true;

  const coletor = criarColetor({
    executor,
    repo,
    aoProgresso: relatarProgresso,
  });

  try {
    // Indexar substitui, nao soma. Somar em cima do que ja existia misturava
    // coletas de filtros diferentes e a lista so crescia, sem nunca refletir
    // o que foi pedido agora.
    limparRecuo();
    falhaAtual = null;
    anotar("limpando o catálogo anterior");
    dizer("Limpando o catálogo anterior…");
    await repo.posts.limparTudo();
    await repo.perfis.salvar({
      key: alvo.profileKey,
      cursor: null,
      completo: false,
      totalIndexado: 0,
    });
    posts = [];
    await redesenhar();

    const teto = tetoDaIndexacao(pedidoDeEscopo());
    let r = null;
    let motivoDoRecuo = null;

    // A coleta direta não abre aba nenhuma e não toma a tela: o computador
    // continua seu enquanto ela roda. Só quando ela não dá conta é que
    // caímos para o caminho que abre a aba do perfil.
    if (alvo.adaptador.id === "instagram") {
      let canal = null;
      try {
        // A página do perfil responde a qualquer um: é dela que saem o
        // identificador, o total declarado e a resposta sobre ser privado.
        dizer("Lendo o perfil…");
        anotar("lendo a página do perfil");
        const perfil = await criarColetorDireto({ repo }).identificar(alvo.handle);
        anotar(
          `perfil id ${perfil.userId}` +
          (perfil.total ? `, ${perfil.total} publicações declaradas` : ""),
        );
        await repo.perfis.salvar({ key: alvo.profileKey, userId: perfil.userId });

        // A aba nasce escondida e fica parada. Ela não existe para rolar: é só
        // o endereço de rede de onde as consultas saem como sendo do próprio
        // site. Quem comanda é esta aba aqui, de fora.
        anotar("abrindo aba em segundo plano");
        canal = await abrirCanal({ executor, urlDoPerfil: alvo.urlDoPerfil });
        anotar(`aba ${canal.abaId} aberta e parada`);

        dizer("Aprendendo a consulta do perfil…");
        anotar("procurando a consulta que a página faz (até 30s)");
        const { assinatura, pagina } = await criarAprendiz().aprender({
          canal,
          idDoDono: perfil.userId,
          adaptador: alvo.adaptador,
          aoProgresso: relatarProgresso,
          sinal: controle.signal,
        });

        anotar(
          `consulta aprendida: ${String(assinatura.url).replace(/^https?:\/\/[^/]+/, "")}` +
          `, ${pagina.itens.length} na primeira página`,
        );
        dizer("Buscando em segundo plano, sem rolagem…");
        r = await criarColetorDireto({
          repo,
          aoProgresso: relatarProgresso,
          buscar: canal.buscar,
        }).coletarComAssinatura({
          adaptador: alvo.adaptador,
          assinatura,
          paginaInicial: pagina,
          profileKey: alvo.profileKey,
          total: perfil.total,
          teto,
          sinal: controle.signal,
        });
      } catch (erro) {
        if (erro.recuperavel === false) throw erro;

        // Numa nota fixa, não na linha de estado: o progresso da aba
        // sobrescreveria a mensagem em menos de um segundo e o motivo se
        // perderia justamente quando mais importa.
        motivoDoRecuo = erro.message;
        anotarErro(erro.message);
        avisarRecuo(erro.message);
      } finally {
        if (canal) {
          await canal.fechar();
          anotar("aba de segundo plano fechada");
        }
      }
    }

    // Nada de rolar a pagina do Instagram: foi pedido explicitamente, mais
    // de uma vez. Se a busca em segundo plano nao deu conta, o certo e dizer
    // o motivo e parar — nao fazer justamente o que nao foi pedido.
    if (!r && alvo.adaptador.id === "instagram") {
      throw new Error(
        `${motivoDoRecuo ?? "A busca em segundo plano nao deu conta."} ` +
        "Clique em Diagnostico para ver qual passo falhou.",
      );
    }

    if (!r) {
      r = await coletor.coletar({
        adaptador: alvo.adaptador,
        handle: alvo.handle,
        profileKey: alvo.profileKey,
        urlDoPerfil: alvo.urlDoPerfil,
        seqInicial: 0,
        teto,
        sinal: controle.signal,
      });
    }
    const comoVeio = r.recuouParaRolagem ? " (coletado pela rolagem da página)" : "";
    const doTotal = r.total ? ` de ~${numero(r.total)} que o perfil declara` : "";
    dizer(
      r.completo
        ? `Catálogo completo: ${numero(r.indexados)} publicações${doTotal}.` + comoVeio
        : `Parou em ${numero(r.indexados)}${doTotal}.` + comoVeio +
          " Clique em Indexar perfil para continuar de onde parou.",
    );
  } catch (erro) {
    anotarErro(erro.message);
    falhaAtual = {
      mensagem: erro.message,
      titulo: "A indexação parou",
      passos: [erro.message, "Clique em Diagnóstico para ver qual passo falhou."],
      porque: String(erro.causa?.message ?? ""),
    };
    dizer(erro.message);
    mostrarVazio(falhaAtual);
  } finally {
    cancelador = null;
    $("cancelar").hidden = true;
    $("indexar").disabled = false;
    if (alvo?.ok) posts = await repo.posts.listarPorPerfil(alvo.profileKey);
    await redesenhar();
  }

  // No caminho por faixa não há nada para escolher: buscar e baixar são o
  // mesmo gesto, e parar no meio faria a aba virar trampolim de novo.
  if (!eDepoisBaixar) return;

  if (cancelador) {
    dizer("Cancelado antes de baixar.");
    return;
  }
  if (posts.length === 0) {
    dizer(
      "Nada foi catalogado, então não há o que baixar. " +
      "Clique em Diagnóstico para ver qual passo falhou.",
    );
    return;
  }

  dizer(`Catalogadas ${numero(posts.length)}. Preparando o download…`);
  await baixar();
}

/**
 * Baixa um destaque inteiro. É deliberadamente mais curto que o caminho do
 * feed: a coleção é pequena e fechada, então não há faixa, ordem nem escolha.
 */
async function baixarDestaque(idDestaque, urlDoDestaque) {
  const controle = new AbortController();
  cancelador = controle;
  $("cancelar").hidden = false;
  $("indexar").disabled = true;

  const coletor = criarColetor({
    executor,
    repo,
    aoProgresso: ({ indexados }) => dizer(`Lendo o destaque… ${numero(indexados)} itens`),
  });

  try {
    dizer("Abrindo o destaque…");
    const r = await coletor.coletarDestaque({
      adaptador: destaques,
      idDestaque,
      profileKey: alvo?.profileKey ?? "ig:@destaque",
      urlDoPerfil: urlDoDestaque,
      sinal: controle.signal,
    });

    alvo = {
      ok: true,
      adaptador: destaques,
      handle: r.titulo || `destaque-${idDestaque}`,
      profileKey: r.profileKey,
      urlDoPerfil: urlDoDestaque,
    };
    $("perfil").textContent = `Destaque "${r.titulo}" · ${numero(r.indexados)} itens`;
    $("urlPerfil").value = urlDoDestaque;

    posts = await repo.posts.listarPorPerfil(r.profileKey);
    $("de").value = "1";
    $("ate").value = String(Math.max(1, posts.length));
    await redesenhar();

    dizer(`Destaque "${r.titulo}": ${numero(r.indexados)} itens. Baixando…`);
  } catch (erro) {
    dizer(erro.message);
    mostrarVazio({
      titulo: "Não consegui ler este destaque",
      passos: [erro.message, "Abra o destaque na aba do Instagram e tente de novo."],
      porque: "",
    });
    return;
  } finally {
    cancelador = null;
    $("cancelar").hidden = true;
    $("indexar").disabled = false;
  }

  if (posts.length > 0) await baixar();
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
  const { selecionados, posicoes, total } = selecaoAtual(baixados);

  if (selecionados.length === 0) {
    dizer(
      total === 0
        ? "O catálogo está vazio: não há o que baixar."
        : `A faixa pedida não bate com o catálogo: há ${numero(total)} publicações ` +
          "depois do filtro de mídia. Ajuste a faixa ou o tipo de mídia.",
    );
    return;
  }

  const arquivosPrevistos = selecionados.reduce(
    (soma, post) =>
      soma +
      alvo.adaptador.midiasParaBaixar(post, {
        filtro: $("filtro").value,
        incluirCapaReel: $("incluirCapaReel").checked,
      }).length,
    0,
  );
  dizer(
    `Baixando ${numero(selecionados.length)} publicações ` +
    `(${numero(arquivosPrevistos)} arquivos)…`,
  );

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
      `Pronto: ${numero(selecionados.length)} publicações em ${numero(r.arquivos)} arquivos, ` +
      `${r.partes.length} ${r.partes.length === 1 ? "parte" : "partes"}` +
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

/**
 * Aplica nos controles o que o modal pediu.
 *
 * Sem isto o modal era decorativo: ele empacotava as escolhas na URL e esta
 * aba as jogava fora, indexando sempre do mesmo jeito.
 */
function aplicarPedido(bruto) {
  if (!bruto) return null;

  let pedido;
  try {
    pedido = JSON.parse(bruto);
  } catch {
    return null;
  }

  const definir = (id, valor) => {
    if (valor == null) return;
    const campo = $(id);
    if (campo.type === "checkbox") campo.checked = Boolean(valor);
    else campo.value = String(valor);
  };

  definir("filtro", pedido.filtro);
  definir("ordenacao", pedido.ordenacao);
  definir("de", pedido.de);
  definir("ate", pedido.ate);
  definir("escopo", pedido.escopo);
  definir("incluirCapaReel", pedido.incluirCapaReel);

  return pedido;
}

// --- início -----------------------------------------------------------------

async function iniciar() {
  const versao = chrome.runtime.getManifest().version;
  $("versao").textContent = `v${versao}`;
  console.log("[Acervo] aba v" + versao);

  repo = await abrirBanco();
  executor = criarExecutor(chrome);

  // O catálogo é de sessão: existe para escolher e baixar, e some quando a
  // aba fecha. Guardá-lo entre sessões trazia de volta dados velhos que se
  // misturavam com a coleta nova — inclusive de outros perfis.
  await repo.posts.limparTudo();
  await repo.perfis.limparTudo();

  grade = criarGrade({
    container: $("grade"),
    colunas: Number($("porLinha").value) || 6,
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

  for (const id of ["filtro", "ordenacao", "de", "ate", "escopo"]) {
    $(id).addEventListener("change", redesenhar);
  }
  for (const id of ["de", "ate"]) {
    $(id).addEventListener("input", atualizarNotaDeEscopo);
  }
  $("urlPerfil").addEventListener("change", () => trocarAlvo($("urlPerfil").value));
  $("urlPerfil").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") indexar();
  });
  $("porLinha").addEventListener("change", () => {
    grade.definirColunas(Number($("porLinha").value) || 6);
  });
  addEventListener("resize", () => grade.definirColunas(grade.colunas()));

  $("indexar").addEventListener("click", indexar);
  $("copiarRegistro").addEventListener("click", copiarRegistro);
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

  const pedido = aplicarPedido(params.get("pedido"));
  if (pedido) {
    atualizarNotaDeEscopo();
    await redesenhar();
  }

  // A aba abre já executando o que foi pedido, em vez de ser um trampolim.
  const acao = params.get("acao");
  if (acao === "indexar") indexar();
  if (acao === "baixar") indexar({ eDepoisBaixar: true });
  if (acao === "destaque" && pedido?.destaque) {
    baixarDestaque(pedido.destaque, pedido.urlDoDestaque);
  }
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
