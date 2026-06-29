import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type CurrentCompany = {
  id: string;
  permissions: Record<string, boolean>;
  role: string;
};

export const CurrentCompany = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentCompany | undefined => {
    const request = context.switchToHttp().getRequest<{
      company?: CurrentCompany;
    }>();

    return request.company;
  }
);
