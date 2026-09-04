import { instagram } from "./instagram.js";
import { tiktok } from "./tiktok.js";

export const ADAPTADORES = [instagram, tiktok];

export function adaptadorDaUrl(url) {
  return ADAPTADORES.find((a) => a.ehPerfil(url)) ?? null;
}

export function adaptadorPorId(id) {
  return ADAPTADORES.find((a) => a.id === id) ?? null;
}

/** "ig:@fulano" — o formato usado como chave em todo o banco. */
export function chaveDePerfil(adaptador, handle) {
  const limpo = String(handle).replace(/^@/, "").toLowerCase();
  return `${adaptador.prefixo}:@${limpo}`;
}
