import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  COMPANY_ROLES_KEY,
  type CompanyRole
} from "../decorators/company-roles.decorator";

@Injectable()
export class CompanyRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<CompanyRole[]>(
      COMPANY_ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      company?: { id: string; role: string };
    }>();
    const role = request.company?.role;

    if (role && allowedRoles.includes(role as CompanyRole)) {
      return true;
    }

    throw new ForbiddenException("Seu perfil nao permite esta acao.");
  }
}
