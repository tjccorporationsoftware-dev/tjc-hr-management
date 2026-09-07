import { File } from 'expo-file-system';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { ApiError } from './api-error';

/**
 * ส่งไฟล์เดียวแบบ multipart
 *
 * ## ทำไมไม่ใช้ fetch + FormData บน native
 *
 * ท่ามาตรฐานของ React Native คือ `form.append(field, { uri, name, type })`
 * ซึ่งเป็นรูปแบบนอกสเปก — networking layer ของ RN ต้องเป็นคนเปิดอ่านไฟล์เอง
 * ตอนประกอบ body ถ้าอ่านไม่ได้ `fetch` จะ reject เป็น "Network request failed"
 * โดยที่ **คำขอไม่เคยออกจากเครื่อง**
 *
 * เคสจริงที่ไล่จนเจอ: พนักงานแนบรูปในใบลาแล้วกดส่ง ใบถูกสร้างเป็นฉบับร่าง
 * สำเร็จ (201) แต่ log ฝั่ง server ไม่มี POST .../attachments เลยสักรายการ
 * ส่วนแอปขึ้นว่า "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ต" ทั้งที่
 * คำขออื่นในวินาทีเดียวกันผ่านหมด ผู้ใช้จึงเข้าใจว่าเน็ตของตัวเองเสีย
 *
 * `uploadAsync` อ่านไฟล์และประกอบ multipart ในฝั่ง native ทั้งหมด จึงไม่ต้อง
 * พึ่งพฤติกรรมนอกสเปก และไม่แปลงความล้มเหลวเรื่องไฟล์ให้กลายเป็นความล้มเหลว
 * เรื่องเครือข่าย
 *
 * ฝั่งเว็บยังใช้ fetch + FormData เพราะที่นั่น Blob ใช้ได้จริง และ
 * expo-file-system ไม่มี uploadAsync ให้
 *
 * ตั้งใจไม่ใช้ apiClient เพราะมันตั้ง Content-Type เป็น application/json
 * ให้อัตโนมัติเมื่อ body เป็น object ซึ่งทำให้ boundary ของ multipart หาย
 */
export interface MultipartUploadParams {
  /** ชื่อฟิลด์ของไฟล์ ต้องตรงกับที่ backend ประกาศไว้ใน FileInterceptor */
  fieldName?: string;
  file: { name: string; uri: string };
  headers: Record<string, string>;
  mimeType?: string;
  /** ฟิลด์ข้อความอื่นที่ส่งไปในฟอร์มเดียวกัน */
  parameters?: Record<string, string>;
  url: string;
}

/** แปลงผลของตัวอัปโหลด native ให้เข้ารูป Response พอสำหรับ ApiError.fromResponse */
function asResponseLike(status: number, headers: Record<string, string>) {
  const lookup = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    headers: { get: (key: string) => lookup.get(key.toLowerCase()) ?? null },
    status,
  } as unknown as Response;
}

function parseJsonBody(body: string | null | undefined): unknown {
  if (!body) return undefined;

  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** คืน body ที่ parse แล้ว เผื่อผู้เรียกต้องใช้ค่าที่ server ส่งกลับ */
export async function uploadMultipartFile(
  params: MultipartUploadParams,
): Promise<unknown> {
  const fieldName = params.fieldName ?? 'file';
  const mimeType = params.mimeType ?? 'image/jpeg';

  if (Platform.OS === 'web') {
    const form = new FormData();

    for (const [key, value] of Object.entries(params.parameters ?? {})) {
      form.append(key, value);
    }

    const source = await fetch(params.file.uri);

    if (!source.ok) {
      throw ApiError.invalidRequest('อ่านรูปที่เลือกไม่สำเร็จ กรุณาเลือกใหม่');
    }

    form.append(fieldName, await source.blob(), params.file.name);

    let response: Response;
    try {
      response = await fetch(params.url, {
        body: form,
        headers: params.headers,
        method: 'POST',
      });
    } catch (error) {
      throw ApiError.network(error);
    }

    const payload = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw ApiError.fromResponse(response, payload);
    }

    return payload;
  }

  /*
   * เช็คไฟล์ก่อนส่ง — รูปที่เตรียมไว้อยู่ในแคชของแอป ระบบอาจเก็บกวาดไประหว่าง
   * ที่ผู้ใช้กรอกฟอร์มอยู่ บอกให้แนบใหม่ตรง ๆ ดีกว่าปล่อยให้ตัวอัปโหลดล้ม
   * แล้วรายงานออกมาเป็นปัญหาเครือข่าย
   */
  if (!new File(params.file.uri).exists) {
    throw ApiError.invalidRequest(
      'ไฟล์ที่เตรียมไว้หายไปจากเครื่อง กรุณาเลือกรูปใหม่อีกครั้ง',
    );
  }

  let result: Awaited<ReturnType<typeof uploadAsync>>;
  try {
    result = await uploadAsync(params.url, params.file.uri, {
      fieldName,
      headers: params.headers,
      httpMethod: 'POST',
      mimeType,
      parameters: params.parameters,
      uploadType: FileSystemUploadType.MULTIPART,
    });
  } catch (error) {
    throw ApiError.network(error);
  }

  const payload = parseJsonBody(result.body);

  if (result.status < 200 || result.status >= 300) {
    throw ApiError.fromResponse(
      asResponseLike(result.status, result.headers),
      payload,
    );
  }

  return payload;
}
