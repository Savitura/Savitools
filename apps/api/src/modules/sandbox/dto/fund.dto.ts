import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { STELLAR_DESTINATION_MESSAGE, STELLAR_DESTINATION_PATTERN } from '../../stellar/address';

export class FundDto {
  @IsString()
  @IsNotEmpty()
  @Matches(STELLAR_DESTINATION_PATTERN, {
    message: STELLAR_DESTINATION_MESSAGE,
  })
  publicKey: string;
}
