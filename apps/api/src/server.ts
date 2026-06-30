import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";

import { AppModule } from "./app.module";

function normalizeOrigin(origin: string) {
  return origin.replace(/\/$/, "");
}

function isProduction(config: ConfigService) {
  return config.get<string>("NODE_ENV") === "production";
}

function getAllowedCorsOrigins(config: ConfigService) {
  const configuredOrigins = [
    config.get<string>("CORS_ORIGINS"),
    config.get<string>("NEXT_PUBLIC_APP_URL"),
    config.get<string>("APP_URL"),
  ]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim())
    .filter((value): value is string => value.length > 0)
    .map(normalizeOrigin);

  const localOrigins = isProduction(config)
    ? []
    : ["http://localhost:3000", "http://127.0.0.1:3000"];

  return new Set([...configuredOrigins, ...localOrigins]);
}

function hasAnyConfig(config: ConfigService, keys: string[]) {
  return keys.some((key) => Boolean(config.get<string>(key)));
}

function assertProductionEnvironment(config: ConfigService) {
  if (!isProduction(config)) {
    return;
  }

  const missing: string[] = [];

  if (!config.get<string>("SUPABASE_URL")) {
    missing.push("SUPABASE_URL");
  }

  if (
    !hasAnyConfig(config, [
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ])
  ) {
    missing.push("SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY");
  }

  if (
    !hasAnyConfig(config, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"])
  ) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (
    !hasAnyConfig(config, ["CORS_ORIGINS", "NEXT_PUBLIC_APP_URL", "APP_URL"])
  ) {
    missing.push("CORS_ORIGINS ou NEXT_PUBLIC_APP_URL");
  }

  if (missing.length) {
    throw new Error(
      `Variaveis obrigatorias ausentes em producao: ${missing.join(", ")}.`,
    );
  }
}

function applySecurityHeaders(response: Response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
}

function configureSecurity(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
) {
  const expressInstance = app.getHttpAdapter().getInstance();

  if (typeof expressInstance.disable === "function") {
    expressInstance.disable("x-powered-by");
  }

  app.use((_request: Request, response: Response, next: NextFunction) => {
    applySecurityHeaders(response);
    next();
  });
}

export async function createNestApp() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  assertProductionEnvironment(config);
  configureSecurity(app);
  const allowedOrigins = getAllowedCorsOrigins(config);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }

      callback(new Error("Origem não permitida pelo CORS."));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const shouldEnableSwagger =
    !isProduction(config) || config.get<string>("ENABLE_SWAGGER") === "true";

  if (shouldEnableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Carbon Flow API")
      .setDescription("API para gestão de produção, custos, estoque e vendas.")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();

    SwaggerModule.setup(
      "docs",
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  return app;
}
