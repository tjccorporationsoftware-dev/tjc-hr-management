/*
 * ตัวคั่นหน้าสำหรับเครื่องสแกนลายนิ้วมือ — สำหรับเซิร์ฟเวอร์ Windows ที่ไม่มี nginx/Caddy
 * =============================================================================
 *
 * ทำไมต้องมี:
 * backend บังคับให้คำขอที่เข้า /iclock/* แนบ shared secret มาด้วยเมื่อรันเป็น
 * production (backend/src/common/guards/device-push.guard.ts) แต่เครื่องสแกน
 * ตั้งค่าได้แค่ "ที่อยู่เซิร์ฟเวอร์ + พอร์ต" ใส่ header หรือ query string เองไม่ได้
 * ตัวนี้จึงรับจากเครื่องแล้วเติม header ให้ก่อนส่งต่อเข้า backend ในเครื่องเดียวกัน
 *
 * ทำไมไม่ใช้ Cloudflare Tunnel ที่มีอยู่แล้ว:
 * เครื่องสแกนพูด HTTP ล้วน ต่อ TLS/SNI ไม่ได้ และ tunnel เป็นขาออก
 * ข้อมูลลงเวลาต้องวิ่งในวง LAN เท่านั้น ไม่ควรออกอินเทอร์เน็ตแล้ววนกลับ
 *
 * ใช้ Node ล้วน ไม่มี dependency — ติดตั้งเป็น Windows Service ด้วย
 * scripts\windows\install-device-proxy-service.ps1
 *
 * ค่าตั้งมาจาก 3 ทาง เรียงตามลำดับความสำคัญ:
 *   1. argument ตอนสั่งรัน  --allowed-ips 192.168.1.10 --listen-port 8080
 *   2. environment variable  ATTENDANCE_DEVICE_PUSH_TOKEN, DEVICE_PROXY_PORT,
 *                            DEVICE_PROXY_TARGET_HOST, DEVICE_PROXY_TARGET_PORT,
 *                            DEVICE_PROXY_ALLOWED_IPS
 *   3. อ่านจาก backend\.env เอง (ATTENDANCE_DEVICE_PUSH_TOKEN กับ PORT)
 *
 * ข้อ 3 มีไว้เพื่อให้สั่งรันตรง ๆ หรือผ่าน Task Scheduler ได้โดยไม่ต้องส่ง
 * โทเคนเป็น argument (จะไปโผล่ใน command line ให้คนอื่นเห็น) และเพื่อไม่ให้มี
 * โทเคนอยู่สองที่จนตั้งไม่ตรงกัน — backend\.env เป็นแหล่งเดียวเสมอ
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

/** อ่าน argument แบบ --key value */
function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return "";
  return (process.argv[index + 1] || "").trim();
}

/** ค่าจาก backend\.env ใช้เมื่อไม่ได้ส่งมาทาง argument หรือ env */
function readBackendEnv() {
  const envPath = path.resolve(__dirname, "..", "..", "backend", ".env");
  const result = {};

  let content;
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch {
    return result;
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;

    const key = line.slice(0, line.indexOf("=")).trim();
    const value = line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    result[key] = value;
  }

  return result;
}

const backendEnv = readBackendEnv();

const LISTEN_PORT = Number(
  arg("listen-port") || process.env.DEVICE_PROXY_PORT || 8080,
);
const TARGET_HOST =
  arg("target-host") || process.env.DEVICE_PROXY_TARGET_HOST || "127.0.0.1";
const TARGET_PORT = Number(
  arg("target-port") ||
    process.env.DEVICE_PROXY_TARGET_PORT ||
    backendEnv.PORT ||
    4000,
);
const TOKEN =
  process.env.ATTENDANCE_DEVICE_PUSH_TOKEN ||
  backendEnv.ATTENDANCE_DEVICE_PUSH_TOKEN ||
  "";

const ALLOWED_IPS = (
  arg("allowed-ips") ||
  process.env.DEVICE_PROXY_ALLOWED_IPS ||
  ""
)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!TOKEN) {
  // ไม่มีโทเคนก็ไม่ต้องมีตัวนี้ — ปล่อยให้ขึ้นแล้วส่งต่อเปล่า ๆ จะยิ่งหลอกให้เข้าใจผิด
  // ว่าทางเดินครบแล้ว ทั้งที่ backend จะปฏิเสธทุกคำขออยู่ดี
  console.error(
    "[device-proxy] หาโทเคนไม่เจอ — ตั้ง ATTENDANCE_DEVICE_PUSH_TOKEN " +
      "ใน backend\.env (สุ่มด้วย npm run gen:secrets) แล้วรีสตาร์ต backend ด้วย",
  );
  process.exit(1);
}

/** ::ffff:192.168.100.90 → 192.168.100.90 */
function normalizeIp(value) {
  if (!value) return "";
  return value.startsWith("::ffff:") ? value.slice(7) : value;
}

/*
 * Task Scheduler ไม่เก็บ stdout ให้ ถ้าสั่งรันทางนั้นต้องเขียนไฟล์เอง
 * ไม่งั้นเวลาข้อมูลลงเวลาไม่เข้าจะไม่มีอะไรให้ดูเลยว่าคำขอมาถึงไหม
 */
const LOG_FILE = arg("log-file") || process.env.DEVICE_PROXY_LOG_FILE || "";

function log(message) {
  const line = `${new Date().toISOString()} [device-proxy] ${message}`;
  console.log(line);

  if (!LOG_FILE) return;

  try {
    fs.appendFileSync(LOG_FILE, `${line}\r\n`);
  } catch {
    // เขียน log ไม่ได้ ไม่ใช่เหตุให้หยุดรับข้อมูลลงเวลา
  }
}

const server = http.createServer((req, res) => {
  const clientIp = normalizeIp(req.socket.remoteAddress);

  // เปิดเฉพาะช่องรับข้อมูลลงเวลา พอร์ตนี้ไม่ใช่ทางเข้าระบบส่วนอื่น
  if (!req.url || !req.url.startsWith("/iclock/")) {
    log(`ปฏิเสธ ${clientIp} ${req.method} ${req.url} — ไม่ใช่ /iclock/`);
    req.socket.destroy();
    return;
  }

  /*
   * ยอมให้ยิงจากตัวเซิร์ฟเวอร์เองเสมอ ไม่ต้องใส่ใน allowlist
   * ผู้ดูแลต้องตรวจทางเดินจากเครื่องนั้นได้โดยไม่ต้องแก้ค่าตั้งไปมา
   * และ loopback ปลอมจากนอกเครื่องไม่ได้ ไม่ได้ลดความปลอดภัยลง
   */
  const isLoopback = clientIp === "127.0.0.1" || clientIp === "::1";

  if (ALLOWED_IPS.length > 0 && !isLoopback && !ALLOWED_IPS.includes(clientIp)) {
    log(`ปฏิเสธ ${clientIp} — ไม่อยู่ใน DEVICE_PROXY_ALLOWED_IPS`);
    req.socket.destroy();
    return;
  }

  /*
   * ลอกหัวข้อมูลจากเครื่องมาใช้ต่อ แต่ตัดตัวที่ปลอมได้ทิ้งก่อน
   * ไม่งั้นใครก็ตามที่ยิงเข้าพอร์ตนี้ ปลอม x-device-token หรือ x-forwarded-for
   * มาเองได้ แล้ว allowlist ฝั่ง backend จะไร้ความหมาย
   */
  const headers = { ...req.headers };
  delete headers["x-device-token"];
  delete headers["x-forwarded-for"];
  delete headers["x-forwarded-proto"];
  delete headers["x-forwarded-host"];

  headers.host = `${TARGET_HOST}:${TARGET_PORT}`;
  headers["x-device-token"] = TOKEN;
  headers["x-forwarded-for"] = clientIp;
  headers["x-forwarded-proto"] = "http";

  const upstream = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      headers,
      timeout: 60000,
    },
    (upstreamRes) => {
      log(
        `${clientIp} ${req.method} ${req.url} → ${upstreamRes.statusCode}`,
      );
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("timeout", () => {
    log(`backend ไม่ตอบใน 60 วินาที (${req.url})`);
    upstream.destroy();
  });

  upstream.on("error", (error) => {
    /*
     * ตอบ 500 ไม่ใช่ 200 — เครื่องสแกนจะเก็บรายการไว้ยิงซ้ำเมื่อไม่สำเร็จ
     * ถ้าตอบ OK ไปทั้งที่ backend ล่ม ข้อมูลลงเวลาช่วงนั้นหายถาวร
     */
    log(`ส่งต่อไม่สำเร็จ: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("ERROR");
  });

  req.pipe(upstream);
});

/*
 * ผูกกับ IPv4 ตรง ๆ ไม่ปล่อยให้ Node เลือก dual-stack ให้เอง
 * บน Windows ถ้ามีโปรแกรมอื่น (เช่น Apache ของ XAMPP) ครองพอร์ตนี้ในฝั่ง IPv4 อยู่
 * การ listen แบบไม่ระบุ host จะ "สำเร็จ" โดยไปเกาะ IPv6 แทน แล้วคำขอจริงตกไปที่
 * โปรแกรมนั้นทั้งหมด — ขึ้นว่าทำงานปกติแต่ข้อมูลลงเวลาไม่เคยมาถึง หาสาเหตุยากมาก
 */
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    log(
      `พอร์ต ${LISTEN_PORT} มีโปรแกรมอื่นใช้อยู่แล้ว — ` +
        "เลือกพอร์ตอื่นด้วย --listen-port แล้วตั้งในเครื่องสแกนให้ตรงกัน",
    );
  } else {
    log(`เปิดรับที่พอร์ต ${LISTEN_PORT} ไม่ได้: ${error.message}`);
  }

  process.exit(1);
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  log(
    `รับจากเครื่องสแกนที่พอร์ต ${LISTEN_PORT} → ส่งต่อ ${TARGET_HOST}:${TARGET_PORT}`,
  );
  log(
    ALLOWED_IPS.length > 0
      ? `จำกัดเฉพาะ IP: ${ALLOWED_IPS.join(", ")}`
      : "ไม่ได้จำกัด IP ต้นทาง (ตั้ง DEVICE_PROXY_ALLOWED_IPS ไว้ด้วยจะปลอดภัยกว่า)",
  );
});
