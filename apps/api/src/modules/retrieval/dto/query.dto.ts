import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryDto {
  @ApiProperty({ example: 'What is the refund policy?' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  query!: string;
}