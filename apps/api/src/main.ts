import { ConfigService } from "@nestjs/config";

import { createNestApp } from "./server";

async function bootstrap() {
  const app = await createNestApp();
  const config = app.get(ConfigService);
  const port = config.get<number>("API_PORT", 3333);

  await app.listen(port);
}

void bootstrap();
