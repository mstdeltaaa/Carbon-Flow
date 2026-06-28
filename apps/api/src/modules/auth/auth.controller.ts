import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import {
  CurrentUser,
  type CurrentUser as CurrentUserPayload
} from "../../common/decorators/current-user.decorator";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";

@ApiTags("auth")
@ApiBearerAuth()
@Controller("auth")
@UseGuards(SupabaseAuthGuard)
export class AuthController {
  @Get("me")
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return {
      user
    };
  }
}

