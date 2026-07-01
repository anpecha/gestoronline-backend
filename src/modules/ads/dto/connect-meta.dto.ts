import { IsString, IsOptional } from 'class-validator';

export class ConnectMetaDto {
  @IsString()
  accessToken: string;

  @IsString()
  @IsOptional()
  businessManagerId?: string;
}
