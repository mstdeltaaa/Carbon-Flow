import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  hasCompanyPermission,
  type CompanyPermission
} from "../access-control/permissions";
import { COMPANY_PERMISSIONS_KEY } from "../decorators/company-permissions.decorator";
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
    const requiredPermissions = this.reflector.getAllAndOverride<
      CompanyPermission[]
    >(COMPANY_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (
      (!allowedRoles || allowedRoles.length === 0) &&
      !requiredPermissions?.length
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      company?: {
        id: string;
        permissions: Record<string, boolean>;
        role: string;
      };
    }>();
    const role = request.company?.role;

    if (
      allowedRoles?.length &&
      (!role || !allowedRoles.includes(role as CompanyRole))
    ) {
      throw new ForbiddenException("Seu perfil não permite esta ação.");
    }

    if (requiredPermissions?.length) {
      const permissions = request.company?.permissions ?? {};
      const canUsePermissions = requiredPermissions.every((permission) =>
        hasCompanyPermission(role, permissions, permission)
      );

      if (!canUsePermissions) {
        throw new ForbiddenException(
          "Seu perfil não tem permissão para este módulo."
        );
      }
    }

    return true;
  }
}
