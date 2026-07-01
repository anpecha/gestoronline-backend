import { IsString } from 'class-validator';

export class ConnectGoogleDto {
  @IsString()
  accessToken: string;

  @IsString()
  refreshToken: string;

  @IsString()
  clientId: string;

  @IsString()
  clientSecret: string;
}
