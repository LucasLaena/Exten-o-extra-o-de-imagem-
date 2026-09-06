import { describe, it, expect } from "vitest";
import { criarRegistro } from "../src/acervo/registro.js";

// Um relogio parado em 09:48:12 de um dia qualquer, para a hora nao depender
// de quando o teste roda.
const AS_9H48 = new Date(2026, 8, 6, 9, 48, 12).getTime();
const relogio = (inicio = AS_9H48, passo = 1000) => {
  let t = inicio - passo;
  return () => (t += passo);
};

describe("registro do que aconteceu", () => {
  it("guarda as linhas em ordem, com hora", () => {
    const r = criarRegistro({ agora: relogio() });
    r.anotar("lendo o perfil");
    r.anotar("id 223666448");

    expect(r.todas().map((l) => l.texto)).toEqual(["lendo o perfil", "id 223666448"]);
    expect(r.todas()[0].hora).toBe("09:48:12");
    expect(r.todas()[1].hora).toBe("09:48:13");
  });

  it("marca erro e fim, para a tela poder destacar", () => {
    const r = criarRegistro({ agora: relogio() });
    r.anotar("abrindo o canal");
    r.anotarErro("nao veio consulta nenhuma");
    r.anotarFim("parou em 0");

    expect(r.todas().map((l) => l.tipo)).toEqual(["passo", "erro", "fim"]);
  });

  it("nada e sobrescrito: e essa a razao de existir", () => {
    // A linha de estado some no passo seguinte e o redesenho repunha
    // "Catalogo vazio" por cima do erro. Aqui as duas coisas convivem.
    const r = criarRegistro({ agora: relogio() });
    r.anotar("buscando pagina 1");
    r.anotarErro("o Instagram respondeu 500");
    r.anotar("buscando pagina 2");

    expect(r.todas()).toHaveLength(3);
    expect(r.todas()[1].texto).toContain("500");
  });

  it("da o texto puro, para colar em vez de mandar print", () => {
    const r = criarRegistro({ agora: relogio() });
    r.anotar("lendo o perfil");
    r.anotarErro("falhou");

    expect(r.texto()).toBe("09:48:12 lendo o perfil\n09:48:13 falhou");
  });

  it("uma coleta longa nao vira vazamento de memoria", () => {
    const r = criarRegistro({ agora: relogio(), limite: 5 });
    for (let i = 1; i <= 20; i++) r.anotar(`passo ${i}`);

    expect(r.todas()).toHaveLength(5);
    expect(r.todas().at(-1).texto).toBe("passo 20");
    expect(r.todas()[0].texto).toBe("passo 16");
  });

  it("limpar zera, para uma indexacao nao herdar a anterior", () => {
    const r = criarRegistro({ agora: relogio() });
    r.anotar("coleta velha");
    r.limpar();

    expect(r.todas()).toEqual([]);
    expect(r.texto()).toBe("");
  });

  it("meia-noite e uma casa so continuam com dois digitos", () => {
    const r = criarRegistro({ agora: () => new Date(2026, 8, 6, 0, 5, 9).getTime() });
    expect(r.anotar("x").hora).toBe("00:05:09");
  });
});
