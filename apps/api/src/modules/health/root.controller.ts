import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller()
export class RootController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "carbon-flow-api",
      health: "/health",
      docs: "/docs"
    };
  }
}
