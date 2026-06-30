import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import { createHmac, timingSafeEqual } from "crypto";

import { SubscriptionsService } from "./subscriptions.service";

type MercadoPagoWebhookBody = {
  action?: string;
  data?: {
    id?: string;
  };
  id?: string;
  resource?: string;
  type?: string;
};

@ApiExcludeController()
@Controller("webhooks/mercado-pago")
export class MercadoPagoWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Post()
  async handleWebhook(
    @Body() body: MercadoPagoWebhookBody,
    @Query() query: Record<string, string | undefined>,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-signature") signature?: string,
  ) {
    const eventId = this.getEventId(body, query);
    const eventType = this.getEventType(body, query);

    this.assertValidSignature(eventId, requestId, signature);

    if (!eventId) {
      throw new BadRequestException(
        "Webhook do Mercado Pago sem identificador do evento.",
      );
    }

    if (
      eventType.includes("subscription_preapproval") ||
      eventType.includes("preapproval")
    ) {
      const result =
        await this.subscriptionsService.syncMercadoPagoSubscription(eventId);

      return {
        received: true,
        result,
      };
    }

    return {
      received: true,
    };
  }

  private getEventId(
    body: MercadoPagoWebhookBody,
    query: Record<string, string | undefined>,
  ) {
    return (
      body.data?.id ??
      body.id ??
      query["data.id"] ??
      query.id ??
      this.getIdFromResource(body.resource)
    );
  }

  private getEventType(
    body: MercadoPagoWebhookBody,
    query: Record<string, string | undefined>,
  ) {
    return (body.type ?? query.type ?? query.topic ?? body.action ?? "")
      .toLowerCase()
      .trim();
  }

  private getIdFromResource(resource?: string) {
    if (!resource) {
      return undefined;
    }

    return resource.split("/").filter(Boolean).at(-1);
  }

  private assertValidSignature(
    eventId?: string,
    requestId?: string,
    signature?: string,
  ) {
    const secret = this.config.get<string>("MERCADO_PAGO_WEBHOOK_SECRET");

    if (!secret) {
      return;
    }

    const timestamp = this.getSignatureValue(signature, "ts");
    const receivedSignature = this.getSignatureValue(signature, "v1");

    if (!eventId || !requestId || !timestamp || !receivedSignature) {
      throw new UnauthorizedException("Assinatura do webhook invalida.");
    }

    const manifest = `id:${eventId};request-id:${requestId};ts:${timestamp};`;
    const expectedSignature = createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");

    if (!this.safeCompare(receivedSignature, expectedSignature)) {
      throw new UnauthorizedException("Assinatura do webhook invalida.");
    }
  }

  private getSignatureValue(signature: string | undefined, key: string) {
    return signature
      ?.split(",")
      .map((entry) => entry.trim().split("="))
      .find(([entryKey]) => entryKey === key)?.[1];
  }

  private safeCompare(received: string, expected: string) {
    const receivedBuffer = Buffer.from(received, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    return (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    );
  }
}
