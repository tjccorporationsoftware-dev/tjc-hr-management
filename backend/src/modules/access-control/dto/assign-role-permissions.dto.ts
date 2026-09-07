import { IsArray, IsString } from "class-validator";

export class AssignRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}