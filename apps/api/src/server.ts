import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";

function normalizeOrigin(origin: string) {
  return origin.replace(/\/$/, "");
}

function getAllowedCorsOrigins(config: ConfigService) {
  const configuredOrigins = [
    config.get<string>("CORS_ORIGINS"),
    config.get<string>("NEXT_PUBLIC_APP_URL"),
    config.get<string>("APP_URL")
  ]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim())
    .filter((value): value is string => value.length > 0)
    .map(normalizeOrigin);

  return new Set([
    ...configuredOrigins,
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]);
}

export async function createNestApp() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const allowedOrigins = getAllowedCorsOrigins(config);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }

      callback(new Error("Origem não permitida pelo CORS."));
    },
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Carbon Flow API")
    .setDescription("API para gestão de produção, custos, estoque e vendas.")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  return app;
}
