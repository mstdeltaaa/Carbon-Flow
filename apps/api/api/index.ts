import { createNestApp } from "../src/server";

let cachedServer: ((request: unknown, response: unknown) => void) | undefined;

async function getServer() {
  if (!cachedServer) {
    const app = await createNestApp();
    await app.init();
    cachedServer = app.getHttpAdapter().getInstance();
  }

  return cachedServer;
}

export default async function handler(request: unknown, response: unknown) {
  const server = await getServer();

  return server(request, response);
}
