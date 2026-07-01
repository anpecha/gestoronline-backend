import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async findByOrg(organizationId: string, unreadOnly = false) {
    return this.prisma.alert.findMany({
      where: {
        organizationId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: [{ severity: 'desc' as any }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  async markRead(id: string, organizationId: string) {
    return this.prisma.alert.updateMany({
      where: { id, organizationId },
      data: { read: true },
    });
  }

  async markAllRead(organizationId: string) {
    return this.prisma.alert.updateMany({
      where: { organizationId, read: false },
      data: { read: true },
    });
  }

  async create(
    organizationId: string,
    data: {
      kind: string;
      severity: string;
      title: string;
      message: string;
      link?: string;
    },
  ) {
    return this.prisma.alert.create({
      data: { organizationId, ...data } as any,
    });
  }

  async checkBudgets(organizationId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { adAccount: { organizationId }, status: 'ACTIVE' as any },
    });

    for (const campaign of campaigns) {
      if (campaign.budget && campaign.budget > 0) {
        const spend = await this.prisma.campaignMetric.aggregate({
          where: {
            campaignId: campaign.id,
            date: { gte: new Date(Date.now() - 86400000) },
          },
          _sum: { spend: true },
        });

        const dailySpend = spend._sum.spend || 0;
        if (dailySpend > campaign.budget * 0.8) {
          await this.create(organizationId, {
            kind: 'BUDGET_EXCEEDED',
            severity: 'HIGH',
            title: 'Orçamento quase excedido',
            message: `A campanha "${campaign.name}" já gastou ${(dailySpend / campaign.budget * 100).toFixed(0)}% do orçamento.`,
            link: `/app/ads/accounts/${campaign.adAccountId}/campaigns`,
          });
        }
      }
    }
  }
}
