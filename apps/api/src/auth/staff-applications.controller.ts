import { BadRequestException, Body, ConflictException, Controller, Post } from '@nestjs/common';
import * as argon2 from 'argon2';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { DatabaseService } from '../database/database.service';

class StaffApplicationDto {
  @IsString() @MaxLength(120) fullName!: string;
  @IsEmail() @MaxLength(240) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

@Controller('staff-applications')
export class StaffApplicationsController {
  constructor(private readonly db: DatabaseService) {}
  @Post()
  async apply(@Body() dto: StaffApplicationDto) {
    const email = dto.email.trim().toLowerCase();
    if (!dto.fullName.trim()) throw new BadRequestException('Ad soyad gereklidir');
    try {
      const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
      await this.db.query("INSERT INTO users(email,password_hash,role,is_active) VALUES($1,$2,'WAREHOUSE',false)", [email, passwordHash]);
      return { message: 'Başvurunuz alındı. Yönetici hesabınızı onayladıktan sonra giriş yapabilirsiniz.' };
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Bu e-posta ile daha önce başvuru veya hesap oluşturulmuş');
      throw error;
    }
  }
}
