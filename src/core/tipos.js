// Só typedefs. Este arquivo não emite runtime nenhum; existe para que o editor
// e quem lê o código saibam o formato exato dos objetos que circulam.

/**
 * @typedef {"foto"|"video"} TipoMidia
 * @typedef {"foto"|"video"|"carrossel"} TipoPost
 * @typedef {"ambos"|"fotos"|"videos"} FiltroMidia
 * @typedef {"sequencia"|"curtidas"|"views"|"recentes"|"antigos"} Ordenacao
 */

/**
 * Um arquivo baixável dentro de um post.
 * @typedef {Object} Midia
 * @property {number} ordem      Posição dentro do carrossel. 0 se post simples.
 * @property {TipoMidia} kind
 * @property {string} url
 * @property {number} [largura]
 * @property {number} [altura]
 * @property {number} [duracao]  Segundos. Só em vídeo.
 */

/**
 * Um post catalogado.
 * @typedef {Object} Post
 * @property {string} key         "ig:@perfil#C4xY9k". Chave primária global.
 * @property {string} profileKey  "ig:@perfil".
 * @property {string} id          Código curto do post na plataforma.
 * @property {number} seq         Posição na ordem entregue pela plataforma, base 1.
 * @property {TipoPost} tipo
 * @property {number} curtidas
 * @property {number} views       0 quando a plataforma não informa.
 * @property {number} comentarios
 * @property {number} timestamp   Epoch em segundos.
 * @property {string} legenda
 * @property {string} capaUrl
 * @property {boolean} fixado     Post fixado no topo do perfil.
 * @property {Midia[]} midias
 */

/**
 * Um arquivo já resolvido, pronto para entrar num ZIP.
 * @typedef {Object} ItemDownload
 * @property {string} postKey
 * @property {string} url
 * @property {string} nome     Nome final dentro do ZIP.
 * @property {TipoMidia} kind
 * @property {boolean} ehCapa  Capa de Reel acompanhando o vídeo.
 */

/**
 * A assinatura aprendida de um request real do app, usada para paginar.
 * @typedef {Object} Assinatura
 * @property {string} url
 * @property {string} metodo
 * @property {Record<string,string>} headers
 * @property {string|null} corpo
 * @property {string} paramCursor  Nome do campo que carrega o cursor.
 * @property {"query"|"form"|"json"} ondeVaiOCursor
 */

/**
 * @typedef {Object} OpcoesMidia
 * @property {FiltroMidia} filtro
 * @property {boolean} incluirCapaReel
 */

export {};
