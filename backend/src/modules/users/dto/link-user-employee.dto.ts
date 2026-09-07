import { IsString } from "class-validator";

export class LinkUserEmployeeDto {
  @IsString()
  employeeId!: string;
}