import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get()
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query('unread') unread?: string,
  ) {
    return this.alertsService.findByOrg(orgId, unread === 'true');
  }

  @Post(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.alertsService.markRead(id, orgId);
  }

  @Post('read-all')
  markAllRead(@CurrentUser('organizationId') orgId: string) {
    return this.alertsService.markAllRead(orgId);
  }

  @Post('check-budgets')
  checkBudgets(@CurrentUser('organizationId') orgId: string) {
    return this.alertsService.checkBudgets(orgId);
  }
}
