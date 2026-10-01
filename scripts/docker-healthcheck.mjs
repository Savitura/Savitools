#!/usr/bin/env node
/**
 * Container healthcheck for the api service in docker-compose.dev.yml
 * (Savitura/Savitools#250).
 *
 * A TCP connect is the right question here: the *web* container's
 * `condition: service_healthy` only needs to know that the API is listening
 * before it starts issuing requests. Probing an HTTP route would additionally
 * depend on the API prefix and on Swagger being enabled, neither of which is
 * this check's business.
 *
 * Exit code is what Compose reads: 0 = healthy, anything else = unhealthy.
 */
import net from "node:net";

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
const socket = net.connect({ host: "127.0.0.1", port });

socket.setTimeout(2000);
socket.once("connect", () => {
  socket.end();
  process.exit(0);
});
socket.once("error", () => process.exit(1));
socket.once("timeout", () => {
  socket.destroy();
  process.exit(1);
});
