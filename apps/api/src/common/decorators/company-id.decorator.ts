import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CompanyId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const header = request.headers["x-company-id"];

    return Array.isArray(header) ? header[0] : header;
  }
);

