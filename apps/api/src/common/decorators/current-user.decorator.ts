import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type CurrentUser = {
  id: string;
  email?: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: CurrentUser }>();

    return request.user;
  }
);
