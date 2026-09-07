import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class AssignRolesDto {
  @IsArray()
  @ArrayMinSize(1, { message: "ต้องเลือก Role อย่างน้อย 1 รายการ" })
  @IsString({ each: true })
  roleCodes!: string[];
}