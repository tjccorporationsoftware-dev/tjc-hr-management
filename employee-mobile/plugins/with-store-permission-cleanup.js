const { withInfoPlist } = require('expo/config-plugins');

/**
 * ถอดคำอธิบายสิทธิ์ของเครื่องมือตอนพัฒนาออกจาก Info.plist ของบิลด์จริง
 *
 * ## ปัญหาที่แก้
 *
 * `expo-dev-client` ใส่ `NSLocalNetworkUsageDescription` ("Expo Dev Launcher
 * uses the local network to discover and connect to development servers…")
 * ลงไปใน Info.plist ทุกครั้งที่ prebuild — รวมถึงบิลด์ที่จะส่งขึ้นสโตร์ด้วย
 *
 * ผู้ตรวจของ Apple อ่านคำอธิบายสิทธิ์ทุกบรรทัด แล้วจะถามว่าแอป HR ต้องสแกนหา
 * อุปกรณ์ในวง Wi-Fi เดียวกันไปทำอะไร ซึ่งตอบไม่ได้เพราะแอปจริงไม่ได้ใช้ —
 * มันเป็นของ dev launcher ที่ทำงานเฉพาะตอนต่อกับเครื่องนักพัฒนา
 *
 * ## ทำไมไม่ถอด expo-dev-client ออกจาก dependencies แทน
 *
 * ถอดแล้วบิลด์สำหรับพัฒนา (`developmentClient: true`) จะใช้ไม่ได้ทันที และ
 * ปลั๊กอินของมันถูกผูกอัตโนมัติจากการที่แพ็กเกจถูกติดตั้ง ไม่ใช่จากตำแหน่งที่
 * ประกาศใน package.json — ย้ายไป devDependencies จึงไม่ได้ทำให้คีย์นี้หายไป
 *
 * ตัวปลั๊กอินนี้ถูกใส่เฉพาะตอน `APP_ENV=production` (ดู app.config.ts) บิลด์
 * สำหรับพัฒนาจึงยังมีคีย์นี้ครบและต่อกับ Metro ในวงแลนได้เหมือนเดิม
 */
const KEYS_TO_REMOVE = [
  'NSLocalNetworkUsageDescription',
  /* ของ dev launcher เช่นกัน — ประกาศบริการ Bonjour ที่ใช้หา Metro ในวงแลน */
  'NSBonjourServices',
];

module.exports = function withStorePermissionCleanup(config) {
  return withInfoPlist(config, (modConfig) => {
    for (const key of KEYS_TO_REMOVE) {
      delete modConfig.modResults[key];
    }

    return modConfig;
  });
};
