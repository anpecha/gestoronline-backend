import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';

export enum CampaignAction {
  PAUSE = 'PAUSE',
  ACTIVATE = 'ACTIVATE',
}

export class UpdateCampaignStatusDto {
  @IsEnum(CampaignAction)
  action: CampaignAction;
}

export class UpdateCampaignBudgetDto {
  @IsNumber()
  budget: number;
}
