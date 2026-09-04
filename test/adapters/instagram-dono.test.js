import { describe, it, expect } from "vitest";
import { instagram } from "../../src/adapters/instagram.js";

describe("idDoDono", () => {
  it("acha no formato REST, em items[].user.pk", () => {
    expect(instagram.idDoDono({
      items: [{ pk: "1", user: { pk: "555", username: "fulano" } }],
    })).toBe("555");
  });

  it("aceita pk numérico, devolvendo string", () => {
    expect(instagram.idDoDono({ items: [{ user: { pk: 555 } }] })).toBe("555");
  });

  it("acha no formato graphql atual, no node.user", () => {
    expect(instagram.idDoDono({
      data: {
        xdt_api__v1__feed__user_timeline_graphql_connection: {
          edges: [{ node: { user: { pk: "777" } } }],
        },
      },
    })).toBe("777");
  });

  it("acha no formato legado, em data.user.id", () => {
    expect(instagram.idDoDono({
      data: { user: { id: "888", edge_owner_to_timeline_media: { edges: [] } } },
    })).toBe("888");
  });

  it("acha no owner do node legado", () => {
    expect(instagram.idDoDono({
      data: {
        user: {
          edge_owner_to_timeline_media: {
            edges: [{ node: { owner: { id: "999" } } }],
          },
        },
      },
    })).toBe("999");
  });

  it("devolve null quando não há dono nenhum", () => {
    expect(instagram.idDoDono({ items: [{ pk: "1" }] })).toBeNull();
    expect(instagram.idDoDono({})).toBeNull();
    expect(instagram.idDoDono(null)).toBeNull();
  });

  it("ignora id que não é numérico, para não pegar lixo", () => {
    expect(instagram.idDoDono({ items: [{ user: { pk: "abc" } }] })).toBeNull();
  });
});
