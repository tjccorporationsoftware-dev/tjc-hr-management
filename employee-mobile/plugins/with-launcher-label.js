const { withStringsXml, AndroidConfig } = require('expo/config-plugins');

/**
 * ตั้งค่า string `app_name` ของ Android แยกจาก `expo.name`
 *
 * ## ทำไมต้องมีปลั๊กอิน
 *
 * Expo เอา `expo.name` ไปเขียนเป็น string `app_name` ใน `strings.xml` ตอน
 * prebuild แล้ว AndroidManifest ก็ชี้ `android:label` มาที่ค่านั้น — ไม่มีช่อง
 * ใน app.config ให้ตั้งชื่อสองอันแยกกัน (ชื่อในสโตร์ กับ ชื่อใต้ไอคอน)
 *
 * ค่านี้ไม่ได้โผล่แค่ใต้ไอคอน — Android ใช้เป็น **ชื่อผู้ส่งบนแถบแจ้งเตือน**
 * ด้วย เคยตั้งเป็นชื่อย่อ "HR-TJC" เพื่อกัน launcher ตัดคำ ผลคือแจ้งเตือน
 * ทุกใบขึ้นชื่อย่อที่บริษัทไม่ได้ใช้เรียกตัวเอง ตอนนี้จึงส่งชื่อเต็มเข้ามา
 *
 * ฝั่ง iOS ไม่ต้องพึ่งปลั๊กอิน — ตั้ง `CFBundleDisplayName` ใน infoPlist ได้ตรง ๆ
 */
const withLauncherLabel = (config, { label }) =>
  withStringsXml(config, (modConfig) => {
    modConfig.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: 'app_name', translatable: 'false' },
          _: label,
        },
      ],
      modConfig.modResults,
    );

    return modConfig;
  });

module.exports = withLauncherLabel;
