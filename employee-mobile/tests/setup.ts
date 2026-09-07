/**
 * ค่า env ขั้นต่ำที่ config ต้องใช้ตอนเทส
 * ไม่พึ่งไฟล์ .env จริง เพื่อให้ผลเทสเหมือนกันทั้งเครื่อง dev และ CI
 */
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:4000/api';
