/** A plataforma nos barrou. Insistir piora a situação da conta: parar é a resposta. */
export class ErroBloqueio extends Error {
  constructor(status, mensagem = `plataforma respondeu ${status}`) {
    super(mensagem);
    this.name = "ErroBloqueio";
    this.status = status;
  }
}

/** Cancelamento. DOMException nem sempre existe em Node antigo, então é nossa. */
export class ErroCancelado extends Error {
  constructor() {
    super("cancelado");
    this.name = "AbortError";
  }
}

export const ehStatusDeBloqueio = (status) =>
  status === 429 || status === 401 || status === 403;

export function dormir(ms, sinal) {
  return new Promise((resolve, reject) => {
    if (sinal?.aborted) {
      reject(new ErroCancelado());
      return;
    }
    const id = setTimeout(() => {
      sinal?.removeEventListener("abort", aoAbortar);
      resolve();
    }, ms);
    function aoAbortar() {
      clearTimeout(id);
      reject(new ErroCancelado());
    }
    sinal?.addEventListener("abort", aoAbortar, { once: true });
  });
}

/** Espera com jitter, para o tráfego não ter cadência de robô. */
export function esperaAleatoria(min, max, aleatorio = Math.random) {
  return Math.round(min + aleatorio() * (max - min));
}

/**
 * Repete `fn` com backoff exponencial. Bloqueio da plataforma e cancelamento
 * não são repetidos.
 */
export async function comRetentativa(fn, opcoes = {}) {
  const { tentativas = 3, baseMs = 500, sinal, aoTentar } = opcoes;
  let ultimo;

  for (let n = 1; n <= tentativas; n++) {
    try {
      return await fn(n);
    } catch (erro) {
      ultimo = erro;
      if (erro instanceof ErroBloqueio) throw erro;
      if (erro?.name === "AbortError" || sinal?.aborted) throw erro;
      if (n === tentativas) break;

      const espera = baseMs * 2 ** (n - 1);
      aoTentar?.(n, espera, erro);
      await dormir(espera, sinal);
    }
  }
  throw ultimo;
}

/**
 * Executa `trabalhador` sobre `itens` com paralelismo, entregando os resultados
 * na ordem de entrada e sem deixar o pipeline correr indefinidamente à frente
 * do consumidor.
 *
 * Emite `{ indice, valor }` no sucesso e `{ indice, erro }` na falha — falha de
 * um item nunca derruba o lote. Só cancelamento interrompe.
 *
 * @param {Iterable<any>} itens
 * @param {(item:any, indice:number)=>Promise<any>} trabalhador
 * @param {{concorrencia?:number, buffer?:number, sinal?:AbortSignal}} [opcoes]
 */
export async function* pipelineOrdenado(itens, trabalhador, opcoes = {}) {
  const { concorrencia = 4, buffer = 3, sinal } = opcoes;
  const lista = [...itens];
  const emVoo = new Map();
  const prontos = new Map();
  const adiantamentoMaximo = concorrencia + buffer;

  let aDisparar = 0;
  let aEmitir = 0;

  const dispararSePuder = () => {
    while (
      aDisparar < lista.length &&
      emVoo.size < concorrencia &&
      aDisparar - aEmitir < adiantamentoMaximo
    ) {
      const i = aDisparar++;
      emVoo.set(
        i,
        Promise.resolve()
          .then(() => trabalhador(lista[i], i))
          .then(
            (valor) => ({ indice: i, valor }),
            (erro) => ({ indice: i, erro }),
          ),
      );
    }
  };

  dispararSePuder();

  while (aEmitir < lista.length) {
    if (sinal?.aborted) throw new ErroCancelado();

    if (prontos.has(aEmitir)) {
      const resultado = prontos.get(aEmitir);
      prontos.delete(aEmitir);
      aEmitir++;
      dispararSePuder();
      yield resultado;
      continue;
    }

    const resultado = await Promise.race(emVoo.values());
    emVoo.delete(resultado.indice);
    prontos.set(resultado.indice, resultado);
    dispararSePuder();
  }
}
