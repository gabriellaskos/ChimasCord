// src/index.ts
// Ponto de entrada do Worker. So existem duas responsabilidades aqui:
// 1. Se a URL for /room/:id -> encaminhar pro Durable Object daquela sala
// 2. Qualquer outra coisa -> deixar o binding de assets servir o front-end
//    (isso ja acontece automaticamente, nao precisamos codar)

export { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Rota: /room/geral -> pega (ou cria) o Durable Object "geral"
    const match = url.pathname.match(/^\/room\/([a-zA-Z0-9_-]+)$/);
    if (match) {
      const roomName = match[1];

      // idFromName garante que o mesmo nome de sala sempre bate no
      // MESMO objeto, em qualquer lugar do mundo que a requisicao chegue.
      const id = env.ROOM.idFromName(roomName);
      const stub = env.ROOM.get(id);

      return stub.fetch(request);
    }

    // Qualquer outra rota: serve o front-end estatico
    return env.ASSETS.fetch(request);
  },
};
