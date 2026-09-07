/**
 * ย่อรูปก่อนแปลงเป็น base64 สำหรับคำขอที่ส่งรูปไปกับ JSON body
 *
 * รูปจากกล้องมือถือใบละ 3–8 MB พอแปลงเป็น base64 จะบวมอีก ~1.37 เท่า
 * เกินเพดาน body ของ backend (2 MB) ทันที คำขอจึงตกทั้งใบ
 * ที่นี่จึงย่อให้พอดีก่อนเสมอ — เอกสารที่ถ่ายด้วยมือถือกว้าง 1600px อ่านออกสบาย
 *
 * ใช้แนวเดียวกับฝั่งแอปมือถือ (`employee-mobile/src/features/requests/attachment.ts`)
 * คือไล่ลดคุณภาพลงทีละขั้นจนกว่าจะพอดี ไม่ใช่ลดรวดเดียวจนรูปแตก
 */

/** เพดานหลัง base64 ต้องไม่ชน REQUEST_BODY_LIMIT (2 MB) ของ backend */
const MAX_ENCODED_BYTES = 1_400_000;

const MAX_WIDTH = 1600;

/** ไล่บีบลงทีละขั้น ขั้นสุดท้ายยังอ่านออกแต่ไม่สวย */
const QUALITY_STEPS = [0.8, 0.6, 0.45, 0.3, 0.2];

/** ความยาว data URL ที่ base64 กินจริง (ตัด prefix `data:image/...;base64,` ออก) */
function encodedBytes(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex === -1 ? dataUrl.length : dataUrl.length - commaIndex - 1;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = window.URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      // ปล่อย object URL ทันทีที่ decode เสร็จ ไม่งั้นค้างใน memory ทั้งแท็บ
      window.URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      window.URL.revokeObjectURL(objectUrl);
      reject(new Error("อ่านไฟล์รูปภาพไม่สำเร็จ"));
    };

    image.src = objectUrl;
  });
}

/**
 * ย่อรูปแล้วคืนเป็น data URL (JPEG) ที่พอดีกับเพดาน body ของ backend
 *
 * โยน Error เมื่ออ่านไฟล์ไม่ได้ หรือย่อจนสุดขั้นแล้วยังใหญ่เกิน
 * (เจอได้กับรูปความละเอียดสูงมากที่มีรายละเอียดเยอะ)
 */
export async function compressImageToDataUrl(file: File): Promise<string> {
  const image = await loadImage(file);

  const scale = Math.min(1, MAX_WIDTH / image.width);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการย่อรูป");

  context.drawImage(image, 0, 0, width, height);

  for (const quality of QUALITY_STEPS) {
    // แปลงเป็น JPEG เสมอ — PNG ของภาพถ่ายใหญ่กว่ามากและ quality ไม่มีผล
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (encodedBytes(dataUrl) <= MAX_ENCODED_BYTES) return dataUrl;
  }

  throw new Error("รูปมีรายละเอียดมากเกินไป กรุณาถ่ายใหม่หรือเลือกรูปอื่น");
}
