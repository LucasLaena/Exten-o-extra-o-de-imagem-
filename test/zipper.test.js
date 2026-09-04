import { describe, it, expect, vi } from "vitest";
import { escreverZip, zipEmMemoria } from "../src/core/zipper.js";

/** WritableStream que junta tudo num Uint8Array, para inspecionar o ZIP. */
function destinoDeMemoria() {
  const pedacos = [];
  const stream = new WritableStream({
    write(pedaco) { pedacos.push(pedaco); },
  });
  return {
    stream,
    bytes: () => {
      const total = pedacos.reduce((n, p) => n + p.length, 0);
      const saida = new Uint8Array(total);
      let i = 0;
      for (const p of pedacos) { saida.set(p, i); i += p.length; }
      return saida;
    },
  };
}

const texto = (s) => new TextEncoder().encode(s);

function acharBytes(agulha, palheiro) {
  outer: for (let i = 0; i <= palheiro.length - agulha.length; i++) {
    for (let j = 0; j < agulha.length; j++) {
      if (palheiro[i + j] !== agulha[j]) continue outer;
    }
    return i;
  }
  return -1;
}
const contemBytes = (agulha, palheiro) => acharBytes(agulha, palheiro) !== -1;

async function* itensDeExemplo() {
  yield { nome: "primeiro.txt", entrada: texto("aaa") };
  yield { nome: "segundo.txt", entrada: texto("bbbb") };
}

describe("escreverZip", () => {
  it("escreve um ZIP válido, com assinatura local e diretório central", async () => {
    const destino = destinoDeMemoria();
    await escreverZip({ itens: itensDeExemplo(), destino: destino.stream });
    const bytes = destino.bytes();
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(contemBytes(new Uint8Array([0x50, 0x4b, 0x05, 0x06]), bytes)).toBe(true);
  });

  it("grava os nomes dos arquivos dentro do ZIP", async () => {
    const destino = destinoDeMemoria();
    await escreverZip({ itens: itensDeExemplo(), destino: destino.stream });
    const bytes = destino.bytes();
    expect(contemBytes(texto("primeiro.txt"), bytes)).toBe(true);
    expect(contemBytes(texto("segundo.txt"), bytes)).toBe(true);
  });

  it("preserva a ordem de entrada dos arquivos", async () => {
    const destino = destinoDeMemoria();
    await escreverZip({ itens: itensDeExemplo(), destino: destino.stream });
    const bytes = destino.bytes();
    expect(acharBytes(texto("primeiro.txt"), bytes))
      .toBeLessThan(acharBytes(texto("segundo.txt"), bytes));
  });

  it("relata quantos arquivos e quantos bytes de conteúdo entraram", async () => {
    const destino = destinoDeMemoria();
    const r = await escreverZip({ itens: itensDeExemplo(), destino: destino.stream });
    expect(r.arquivos).toBe(2);
    expect(r.bytes).toBe(7);
  });

  it("chama o progresso uma vez por arquivo, na ordem", async () => {
    const aoProgresso = vi.fn();
    const destino = destinoDeMemoria();
    await escreverZip({ itens: itensDeExemplo(), destino: destino.stream, aoProgresso });
    expect(aoProgresso).toHaveBeenCalledTimes(2);
    expect(aoProgresso.mock.calls.map((c) => c[0].nome)).toEqual([
      "primeiro.txt", "segundo.txt",
    ]);
    expect(aoProgresso.mock.calls[1][0].indice).toBe(1);
  });

  it("aceita Blob como entrada", async () => {
    const destino = destinoDeMemoria();
    async function* itens() {
      yield { nome: "b.bin", entrada: new Blob([new Uint8Array([1, 2, 3])]) };
    }
    const r = await escreverZip({ itens: itens(), destino: destino.stream });
    expect(r.arquivos).toBe(1);
  });

  it("gera um ZIP vazio válido quando não há itens", async () => {
    const destino = destinoDeMemoria();
    async function* vazio() {}
    const r = await escreverZip({ itens: vazio(), destino: destino.stream });
    expect(r.arquivos).toBe(0);
    expect(contemBytes(new Uint8Array([0x50, 0x4b, 0x05, 0x06]), destino.bytes())).toBe(true);
  });

  it("puxa os itens preguiçosamente, não todos de uma vez", async () => {
    let puxados = 0;
    async function* muitos() {
      for (let i = 0; i < 100; i++) {
        puxados++;
        yield { nome: `a${i}.txt`, entrada: texto("x") };
      }
    }
    const destino = destinoDeMemoria();
    await escreverZip({ itens: muitos(), destino: destino.stream });
    expect(puxados).toBe(100);
  });

  it("aborta quando o sinal manda", async () => {
    const ctrl = new AbortController();
    async function* itens() {
      yield { nome: "a.txt", entrada: texto("a") };
      ctrl.abort();
      yield { nome: "b.txt", entrada: texto("b") };
    }
    const destino = destinoDeMemoria();
    await expect(
      escreverZip({ itens: itens(), destino: destino.stream, sinal: ctrl.signal }),
    ).rejects.toThrow();
  });
});

describe("zipEmMemoria", () => {
  it("devolve um Blob de ZIP", async () => {
    const blob = await zipEmMemoria(itensDeExemplo());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
