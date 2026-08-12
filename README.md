# Discord de Pobre 🎧

Fase 1 + 2 do desafio: entrada em sala, presença online e chat de texto,
rodando 100% na Cloudflare (Workers + Durable Objects), sem servidor
nenhum no seu PC e sem gastar nada.

## Como funciona (o modelo mental)

Esquece a ideia de "servidor Node.js rodando o tempo todo". Aqui é
diferente:

- O **Worker** (`src/index.ts`) é só um roteador: toda request que bate
  em `/room/geral` ele encaminha pro Durable Object da sala "geral".
  Qualquer outra rota, ele deixa o Cloudflare servir os arquivos
  estáticos de `public/` direto.
- O **Durable Object** (`src/room.ts`) é um "servidor" que só existe
  enquanto tem gente conectado nele. Cada sala vira uma instância
  própria, com seu próprio estado (quem tá conectado), rodando na borda
  da rede da Cloudflare, o mais perto possível de onde a galera tá.
- Quando a última pessoa sai da sala, o Durable Object "dorme"
  (hiberna) e não custa nada. Quando alguém entra de novo, ele acorda.

Isso é o motivo de termos usado a **WebSocket Hibernation API**
(`ctx.acceptWebSocket`, `ws.serializeAttachment`) em vez de guardar as
conexões numa lista comum — assim o estado sobrevive mesmo se o objeto
hibernar no meio do caminho.

## Rodando local

```bash
npm install
npm run dev
```

Abre `http://localhost:8787` em duas abas, mesmo nome de sala, dá pra
testar entrada/saída e chat.

## Deploy (de verdade, na internet, R$0)

```bash
npx wrangler login   # abre o navegador pra autenticar com sua conta Cloudflare
npm run deploy
```

Em segundos você recebe uma URL tipo
`https://discord-de-pobre.<seu-usuario>.workers.dev` — já é HTTPS,
já tem WSS (WebSocket seguro), já tá na internet, sem você hospedar
nada em lugar nenhum.

## O que já temos pronto para a Fase 3 (WebRTC)

O `room.ts` já tem um tipo de mensagem `"signal"` que faz **relay
direcionado** — manda uma mensagem só para um `id` específico dentro
da sala. Isso é exatamente o mecanismo que o WebRTC precisa para
trocar as mensagens de `offer`/`answer`/`ice-candidate` entre dois
navegadores. Ou seja: a parte mais chata (sinalização) já tá pronta,
só falta plugar o `RTCPeerConnection` no cliente reaproveitando esse
canal — que é o código de `getUserMedia` + `RTCPeerConnection` que eu
já te mostrei no protótipo anterior.

## Roadmap

- [x] Fase 1 — esqueleto (entrar numa sala, ver quem está online)
- [x] Fase 2 — WebSocket (presença em tempo real + chat de texto)
- [ ] Fase 3 — WebRTC (voz) usando o canal `"signal"` já existente
- [ ] Fase 4 — STUN/TURN para os casos de NAT mais fechado
      (aqui dá pra usar o Cloudflare Calls, que tem um serviço TURN
      gratuito até um certo limite — vale pesquisar quando chegar lá)
- [ ] Login/autenticação (JWT ou senha simples por sala)
- [ ] Persistência: hoje a lista de usuários é só em memória no
      Durable Object; nomes de sala, histórico de chat etc. podem ir
      pro D1 (banco SQL da Cloudflare, também no free tier)
- [ ] CI/CD: GitHub Actions rodando `wrangler deploy` a cada push
- [ ] Domínio próprio (opcional, e barato quando chegar nessa fase)
