import { Controller, Get } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import { DashboardService } from "./dashboard.service";

@Auth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("overview")
  getOverview(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dashboardService.getOverview(currentUser.scope);
  }
}