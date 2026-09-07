import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import {
  permissions,
  roles,
} from '../../prisma/seed-data/access-control';

/**
 * กัน permission หลุด seed
 * ------------------------
 * เคสจริงที่เคยเกิด: โมดูล Recruitment กับ Offboarding ถูกสร้างพร้อม
 * @Auth('RECRUITMENT_READ') ฯลฯ แต่ permission ถูก seed อยู่ใน
 * scripts/seed-recruitment.ts ที่ต้องรันแยก ทำให้ระบบที่ตั้งใหม่ด้วย
 * `npm run db:seed` อย่างเดียวเปิดสองโมดูลนี้ไม่ได้เลย และไม่มีอะไรเตือน
 *
 * เทสต์นี้อ่าน controller ทุกไฟล์ แล้วเทียบกับ catalog เพื่อให้ความผิดพลาด
 * แบบเดียวกันแดงตั้งแต่ CI ไม่ใช่ไปเจอตอน deploy
 */

const MODULES_DIR = join(__dirname, '..', 'modules');

function collectControllerFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      found.push(...collectControllerFiles(fullPath));
      continue;
    }

    if (entry.endsWith('.controller.ts')) {
      found.push(fullPath);
    }
  }

  return found;
}

/** ดึงโค้ด permission ออกจาก @Auth('X', 'Y') และ @RequirePermissions('X') */
function extractReferencedPermissions(source: string): string[] {
  const codes: string[] = [];
  const decoratorPattern = /@(?:Auth|RequirePermissions)\(([^)]*)\)/g;

  for (const match of source.matchAll(decoratorPattern)) {
    for (const literal of match[1].matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)) {
      codes.push(literal[1]);
    }
  }

  return codes;
}

describe('access-control catalog', () => {
  const controllerFiles = collectControllerFiles(MODULES_DIR);

  const referenced = new Map<string, string[]>();

  for (const file of controllerFiles) {
    const source = readFileSync(file, 'utf8');

    for (const code of extractReferencedPermissions(source)) {
      const owners = referenced.get(code) ?? [];

      if (!owners.includes(file)) {
        owners.push(file);
      }

      referenced.set(code, owners);
    }
  }

  it('เจอ controller และ permission ที่อ้างถึงจริง (กันเทสต์ผ่านเพราะ scan ไม่เจอไฟล์)', () => {
    expect(controllerFiles.length).toBeGreaterThan(30);
    expect(referenced.size).toBeGreaterThan(50);
  });

  it('ทุก permission ที่ controller อ้างถึง ต้องมีใน seed catalog', () => {
    const seeded = new Set(permissions.map((permission) => permission.code));

    const missing = [...referenced.entries()]
      .filter(([code]) => !seeded.has(code))
      .map(([code, files]) => {
        const relative = files
          .map((file) => file.slice(file.indexOf('modules')))
          .join(', ');

        return `${code} (ใช้ที่ ${relative})`;
      });

    expect(missing).toEqual([]);
  });

  it('ทุก permission ที่ role อ้างถึง ต้องมีอยู่จริงใน catalog', () => {
    const seeded = new Set(permissions.map((permission) => permission.code));

    const dangling = roles.flatMap((role) =>
      role.permissionCodes
        .filter((code) => !seeded.has(code))
        .map((code) => `${role.code} -> ${code}`),
    );

    expect(dangling).toEqual([]);
  });

  it('ไม่มี permission code ซ้ำใน catalog', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const permission of permissions) {
      if (seen.has(permission.code)) {
        duplicates.push(permission.code);
      }

      seen.add(permission.code);
    }

    expect(duplicates).toEqual([]);
  });

  it('SYSTEM_ADMIN ต้องได้ทุก permission เสมอ', () => {
    const systemAdmin = roles.find((role) => role.code === 'SYSTEM_ADMIN');

    expect(systemAdmin).toBeDefined();

    const granted = new Set(systemAdmin!.permissionCodes);
    const notGranted = permissions
      .map((permission) => permission.code)
      .filter((code) => !granted.has(code));

    expect(notGranted).toEqual([]);
  });
});
