import { UpdateMyProfileDto } from '../../profile/dto/update-my-profile.dto';

/**
 * Mobile แก้ข้อมูลส่วนตัวได้เท่ากับหน้า self-profile เดิมของเว็บเท่านั้น
 * ห้ามขยาย DTO นี้ให้รับ HR master data เพราะข้อมูลเหล่านั้นแก้โดย HR/Admin
 */
export class MobileUpdateProfileDto extends UpdateMyProfileDto {}
