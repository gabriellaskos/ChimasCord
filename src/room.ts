// src/room.ts
//
// Cada sala (ex: "geral", "jogos") vira UMA instancia deste Durable Object,
// identificada pelo nome (veja idFromName no index.ts). Ele guarda em
// memoria quem esta conectado e faz o papel de "sinalizador" pro WebRTC:
//
// - broadcast de presenca (quem entrou / quem saiu / quem mutou)
// - relay de mensagens "signal" ponto-a-ponto, que carrega o SDP/ICE
//   do WebRTC pra abrir a chamada de voz P2P entre os navegadores
//
// Usamos a "WebSocket Hibernation API": em vez de guardar as conexoes
// numa lista na mao (que se perde se o objeto hibernar por inatividade),
// a gente usa ctx.getWebSockets() e ws.serializeAttachment(), que
// sobrevivem a hibernacao.

import { DurableObject } from "cloudflare:workers";

interface Attachment {
  id: string;
  name: string;
  muted: boolean;
}

export class Room extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Esperado uma conexao WebSocket", { status: 426 });
    }

    const url = new URL(request.url);
    const name = url.searchParams.get("name")?.slice(0, 40) || "Anonimo";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const attachment: Attachment = { id: crypto.randomUUID(), name, muted: false };
    server.serializeAttachment(attachment);

    // Registra o socket no Durable Object (isso e o que faz ele
    // "aceitar" a conexao e permite que sobreviva a hibernacao)
    this.ctx.acceptWebSocket(server);

    // Manda pro recem-chegado a lista de quem ja esta na sala
    const others = this.ctx
      .getWebSockets()
      .filter((ws) => ws !== server)
      .map((ws) => ws.deserializeAttachment() as Attachment);

    server.send(JSON.stringify({ type: "room-users", users: others }));

    // Avisa todo mundo que ja estava la que alguem novo chegou
    this.broadcast(
      { type: "user-joined", id: attachment.id, name: attachment.name, muted: attachment.muted },
      server
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(data: unknown, exclude?: WebSocket) {
    const msg = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(msg);
      } catch {
        // socket morto, ignora - o webSocketClose vai limpar
      }
    }
  }

  // Chamado automaticamente pelo runtime toda vez que chega mensagem
  // de QUALQUER cliente conectado neste Durable Object.
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    const attachment = ws.deserializeAttachment() as Attachment;
    if (!attachment) return;

    if (data.type === "signal" && typeof data.to === "string") {
      // Relay direcionado: so o destinatario recebe.
      // Aqui trafega o offer/answer/ice-candidate do WebRTC.
      const target = this.ctx
        .getWebSockets()
        .find((w) => (w.deserializeAttachment() as Attachment)?.id === data.to);

      if (target) {
        target.send(
          JSON.stringify({ type: "signal", from: attachment.id, data: data.data })
        );
      }
      return;
    }

    if (data.type === "status" && typeof data.muted === "boolean") {
      // Atualiza o proprio attachment (persiste mesmo se o DO hibernar)
      attachment.muted = data.muted;
      ws.serializeAttachment(attachment);
      this.broadcast({ type: "status", id: attachment.id, muted: attachment.muted });
      return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const attachment = ws.deserializeAttachment() as Attachment;
    if (attachment) {
      this.broadcast({ type: "user-left", id: attachment.id });
    }
  }

  async webSocketError(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as Attachment;
    if (attachment) {
      this.broadcast({ type: "user-left", id: attachment.id });
    }
  }
}
