/** @typedef {import("./tipos.js").Post} Post */

export const NOME_BANCO = "acervo";
export const VERSAO = 1;

const promessa = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const fim = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transação abortada"));
  });

/** Faixa que cobre um perfil inteiro num índice composto [profileKey, x]. */
const faixaDoPerfil = (Range, profileKey) =>
  Range.bound([profileKey, -Infinity], [profileKey, Infinity]);

function migrar(db) {
  const perfis = db.createObjectStore("profiles", { keyPath: "key" });
  perfis.createIndex("plataforma", "plataforma");

  const posts = db.createObjectStore("posts", { keyPath: "key" });
  // Índices compostos: toda leitura da UI é "deste perfil, nesta ordem".
  posts.createIndex("perfil_seq", ["profileKey", "seq"]);
  posts.createIndex("perfil_curtidas", ["profileKey", "curtidas"]);
  posts.createIndex("perfil_views", ["profileKey", "views"]);
  posts.createIndex("perfil_data", ["profileKey", "timestamp"]);
  posts.createIndex("perfil_tipo", ["profileKey", "tipo"]);

  const baixados = db.createObjectStore("baixados", { keyPath: "key" });
  baixados.createIndex("perfil", "profileKey");

  const jobs = db.createObjectStore("jobs", { keyPath: "jobId" });
  jobs.createIndex("perfil", "profileKey");

  db.createObjectStore("handles");
}

export async function abrirAcervo(idb = globalThis.indexedDB, Range = globalThis.IDBKeyRange) {
  const req = idb.open(NOME_BANCO, VERSAO);
  req.onupgradeneeded = () => migrar(req.result);
  const db = await promessa(req);

  const escrita = (store) => db.transaction(store, "readwrite").objectStore(store);
  const leitura = (store) => db.transaction(store, "readonly").objectStore(store);

  return {
    db,
    fechar: () => db.close(),

    perfis: {
      async salvar(perfil) {
        const store = escrita("profiles");
        store.put(perfil);
        await fim(store.transaction);
      },
      obter: (key) => promessa(leitura("profiles").get(key)),
      listar: () => promessa(leitura("profiles").getAll()),
    },

    posts: {
      /** Usa put: reindexar sobrescreve, nunca duplica. */
      async salvarLote(posts) {
        if (posts.length === 0) return;
        const store = escrita("posts");
        for (const post of posts) store.put(post);
        await fim(store.transaction);
      },
      listarPorPerfil: (profileKey) =>
        promessa(
          leitura("posts").index("perfil_seq").getAll(faixaDoPerfil(Range, profileKey)),
        ),
      contar: (profileKey) =>
        promessa(
          leitura("posts").index("perfil_seq").count(faixaDoPerfil(Range, profileKey)),
        ),
      async maiorSeq(profileKey) {
        const cursor = await promessa(
          leitura("posts")
            .index("perfil_seq")
            .openCursor(faixaDoPerfil(Range, profileKey), "prev"),
        );
        return cursor ? cursor.value.seq : 0;
      },
      async limpar(profileKey) {
        const store = escrita("posts");
        const req = store.index("perfil_seq").openCursor(faixaDoPerfil(Range, profileKey));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
        await fim(store.transaction);
      },
    },

    baixados: {
      async marcar(registros) {
        if (registros.length === 0) return;
        const store = escrita("baixados");
        const agora = Date.now();
        for (const reg of registros) store.put({ baixadoEm: agora, ...reg });
        await fim(store.transaction);
      },
      listarPorPerfil: (profileKey) =>
        promessa(leitura("baixados").index("perfil").getAll(profileKey)),
      async chavesDoPerfil(profileKey) {
        const chaves = await promessa(
          leitura("baixados").index("perfil").getAllKeys(profileKey),
        );
        return new Set(chaves);
      },
    },

    jobs: {
      async salvar(job) {
        const store = escrita("jobs");
        store.put(job);
        await fim(store.transaction);
      },
      obter: (jobId) => promessa(leitura("jobs").get(jobId)),
      listar: () => promessa(leitura("jobs").getAll()),
    },

    handles: {
      async salvar(nome, valor) {
        const store = escrita("handles");
        store.put(valor, nome);
        await fim(store.transaction);
      },
      obter: (nome) => promessa(leitura("handles").get(nome)),
    },
  };
}
