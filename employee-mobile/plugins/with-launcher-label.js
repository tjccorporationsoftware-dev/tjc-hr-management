const { withStringsXml, AndroidConfig } = require('expo/config-plugins');

/**
 * ตั้งชื่อที่โผล่ใต้ไอคอนบนหน้าจอมือถือ (Android) ให้สั้นกว่าชื่อแอปจริง
 *
 * ## ทำไมต้องมีปลั๊กอิน
 *
 * Expo เอา `expo.name` ไปเขียนเป็น string `app_name` ใน `strings.xml` ตอน
 * prebuild แล้ว AndroidManifest ก็ชี้ `android:label` มาที่ค่านั้น — ไม่มีช่อง
 * ใน app.config ให้ตั้งชื่อสองอันแยกกัน (ชื่อในสโตร์ กับ ชื่อใต้ไอคอน)
 *
 * ชื่อเต็ม "HR-TJC GROUP" ยาวเกินกว่าที่ launcher จะแสดงครบ — Android
 * ตัดเหลือประมาณสิบตัวอักษรแล้วต่อด้วยจุดไข่ปลา ผู้ใช้จึงเห็นเป็น "HR TJC-C…"
 * ซึ่งอ่านไม่ออกว่าเป็นแอปอะไร ตรงนั้นจึงใช้ชื่อสั้นแทน
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
