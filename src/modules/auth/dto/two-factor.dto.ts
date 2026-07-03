import { IsString, Length } from 'class-validator';

export class EnableTwoFactorDto {
  @IsString()
  password: string;
}

export class VerifyTwoFactorDto {
  @IsString()
  @Length(6, 6)
  code: string;
}
