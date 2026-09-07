import type { ExpoConfig } from 'expo/config';

/**
 * Public config ของแอป
 *
 * ที่นี่ใส่ได้เฉพาะค่าที่ "เปิดเผยได้" — ทุกอย่างใน bundle ถูกถอดอ่านได้หมด
 * ห้ามใส่ API key หรือ secret ใด ๆ (บทที่ 23.8)
 */
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const IS_PRODUCTION = APP_ENV === 'production';

/**
 * ชื่อแอปมีสองแบบ และตั้งใจให้ต่างกัน
 *
 *   `APP_NAME`      ชื่อเต็ม — ใช้ในสโตร์ ในหน้าตั้งค่าของเครื่อง และในแอป
 *   `LAUNCHER_NAME` ชื่อใต้ไอคอนบนหน้าจอมือถือ — สั้นกว่า เพราะ launcher ตัด
 *                   ชื่อที่ยาวเกินราวสิบสองตัวอักษรทิ้งแล้วต่อจุดไข่ปลา
 *                   ชื่อเต็มมีคำว่า GROUP ต่อท้ายซึ่งเป็นคำที่หายไปได้โดยไม่
 *                   ทำให้จำแอปไม่ได้ ใต้ไอคอนจึงเหลือแค่ "HR-TJC"
 */
const APP_NAME = IS_PRODUCTION
  ? 'HR-TJC GROUP'
  : `HR-TJC GROUP (${APP_ENV})`;

const LAUNCHER_NAME = IS_PRODUCTION ? 'HR-TJC' : `HR-TJC (${APP_ENV})`;

/** แยก bundle id ต่อ environment เพื่อให้ลงเครื่องเดียวกันพร้อมกันได้ตอนทดสอบ */
/** โปรเจกต์บน EAS — ใช้ทั้งตอนบิลด์และตอนส่งอัปเดต */
const EAS_PROJECT_ID = 'd7bb4ebc-6b86-4689-a8b2-c120f038587d';

const BUNDLE_ID = IS_PRODUCTION
  ? 'com.tjc.employeemobile'
  : `com.tjc.employeemobile.${APP_ENV}`;

const config: ExpoConfig = {
  name: APP_NAME,
  slug: 'employee-mobile',
  /* โปรเจกต์อยู่ใต้องค์กร tjc.corporation ไม่ใช่บัญชีส่วนตัวของคนที่บิลด์
   * ขาดบรรทัดนี้ EAS จะสร้างโปรเจกต์ใหม่ใต้บัญชีคนที่รัน eas init แทน */
  owner: 'tjc.corporation',
  version: '1.0.0',
  scheme: 'employee-mobile',
  orientation: 'portrait',
  /*
   * ไอคอนของ iOS ต้องทึบ ห้ามมี alpha — ไฟล์นี้จึงถมส่วนที่ใสไว้แล้ว
   *
   * ถมด้วย "ตัวเองที่ขยายแล้วเบลอ" ไม่ใช่พื้นขาว: ตราเป็นสี่เหลี่ยมมุมมนที่มี
   * พื้นของตัวเอง พอวางบนขาวแล้ว iOS ครอบมุมอีกชั้น จะเห็นเป็นตราน้ำเงินลอย
   * อยู่ในกรอบขาวอีกใบ ส่วนการถมด้วยสีทึบสีเดียวก็ไม่ได้เพราะขอบตราไล่สีจาก
   * ฟ้าสด (ซ้ายบน) ไปน้ำเงินเข้ม (ขวา) ไปฟ้าอ่อน (ซ้ายล่าง) ไม่มีสีเดียวที่
   * เข้ากับทุกด้าน — เบลอตัวเองทำให้มุมต่อเนื่องกับขอบที่อยู่ติดกันเสมอ
   *
   * ไฟล์ต้นฉบับ (พื้นหลังใส) อยู่ที่ assets/logo-app-source.png และสคริปต์ที่
   * ใช้แปลงเป็นทุกขนาดอยู่ที่ scripts/build-icons.py
   */
  icon: './assets/icon-hrtjc.png',

  /*
   * อัปเดตแบบส่งเข้าเครื่องเอง (OTA)
   * ----------------------------------
   * แอปแจกเป็นไฟล์ให้พนักงานติดตั้งเอง ไม่ได้อยู่บนสโตร์ — ถ้าไม่มีทางนี้
   * ทุกครั้งที่แก้ข้อความผิดตัวเดียวก็ต้องให้พนักงานร้อยกว่าคนโหลดไฟล์ใหม่
   *
   * ส่งได้เฉพาะของฝั่ง JS (จอ ข้อความ ตรรกะในแอป) ส่วนไอคอน สิทธิ์ หรือการ
   * อัปเกรด SDK ยังต้องแจกไฟล์ใหม่เสมอ — ตัว `runtimeVersion` ข้างล่างเป็นคน
   * กันไม่ให้อัปเดตหลุดไปลงเครื่องที่ native ไม่ตรงกัน ดูวินัยที่ต้องรักษา
   * ในคอมเมนต์ตรงนั้น
   */
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    /* เช็คตอนเปิดแอป ถ้ามีของใหม่โหลดไว้เบื้องหลังแล้วใช้รอบเปิดถัดไป */
    checkAutomatically: 'ON_LOAD',
    /*
     * ไม่รอโหลดอัปเดตก่อนเปิดจอแรก — เน็ตช้าจะกลายเป็นค้างที่จอโหลด
     * ของใหม่จะมีผลรอบเปิดถัดไปแทน ซึ่งช้ากว่าแต่ไม่มีทางทำให้แอปเปิดไม่ขึ้น
     */
    fallbackToCacheTimeout: 0,
  },

  /*
   * ผูกอัปเดตกับ "ลายนิ้วมือ" ของฝั่ง native แทนการใช้เลขเวอร์ชัน
   *
   * ถ้าใช้เลขเวอร์ชัน แล้ววันหนึ่งมีคนเพิ่มสิทธิ์หรืออัปเกรดไลบรารี native
   * แต่ลืมขยับเลขเวอร์ชัน อัปเดต JS จะไหลไปลงเครื่องที่ไม่มีของ native นั้น
   * แล้วแอปพังตอนเปิด — ลายนิ้วมือคำนวณจากคอนฟิก native จริง จึงเปลี่ยนเอง
   * อัตโนมัติเมื่อมีอะไรเปลี่ยน และอัปเดตจะไม่ข้ามไปหาบิลด์ที่ไม่เข้ากัน
   */
  /*
   * ผูกอัปเดตกับเลข `version` ข้างบน (ตอนนี้ '1.0.0')
   *
   * เดิมใช้ policy 'fingerprint' ซึ่งคำนวณจากไฟล์ native จริง ฟังดูปลอดภัย
   * กว่า แต่ใช้ไม่ได้กับทีมนี้ — ลายนิ้วมือคำนวณบน Windows กับบนเครื่องบิลด์
   * ของ EAS (Linux) ไม่มีวันตรงกัน เพราะไล่ไฟล์คนละลำดับ ผลคืออัปเดตที่ส่ง
   * จากเครื่องเราจะไม่ลงเครื่องพนักงานสักคน (บิลด์ 7 ก.ย. 2569:
   * local d8a2a0d0… vs EAS 30c76f49…)
   *
   * แลกมาด้วยวินัย: **ถ้าแตะอะไรที่เป็น native ต้องขยับ `version` ด้วยเสมอ**
   * — เพิ่ม/ลบไลบรารีที่มีโค้ด native, แก้สิทธิ์, เปลี่ยนไอคอน/สแปลช,
   * อัปเกรด SDK แล้วแจกไฟล์ใหม่ ถ้าลืมขยับ อัปเดต JS จะไหลไปลงเครื่องที่
   * native ไม่มีของนั้นแล้วแอปพังตอนเปิด
   *
   * แก้แค่ฝั่ง JS (จอ ข้อความ ตรรกะ) ไม่ต้องขยับ ส่งเป็น OTA ได้เลย
   */
  runtimeVersion: { policy: 'appVersion' },
  // SDK 57 ใช้ New Architecture เป็นค่าเริ่มต้นอยู่แล้ว จึงไม่ต้องประกาศ
  userInterfaceStyle: 'automatic',

  // เลขบิลด์ (buildNumber/versionCode) ไม่ประกาศไว้ที่นี่โดยตั้งใจ
  // eas.json ตั้ง appVersionSource = "remote" ให้ EAS เป็นเจ้าของเลขบิลด์
  // ถ้าประกาศซ้ำที่นี่ด้วย จะมีสองแหล่งความจริงและเลขจะเพี้ยนตอน autoIncrement
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      // แอปทำงานกับ session ของบริษัท ไม่ควรถูกดักอ่านกลางทาง
      NSAllowsArbitraryLoads: false,
      /*
       * ประกาศว่าไม่ได้ใช้การเข้ารหัสนอกเหนือจากที่ได้รับยกเว้น
       *
       * แอปเข้ารหัสแค่สองทาง: HTTPS ตอนคุยกับเซิร์ฟเวอร์ และ Keychain ของ
       * ระบบตอนเก็บโทเคน ทั้งคู่อยู่ในข้อยกเว้นมาตรฐานของ Apple
       *
       * ถ้าไม่ประกาศไว้ตรงนี้ ทุกครั้งที่อัปไฟล์ขึ้น TestFlight มันจะขึ้น
       * "Missing Compliance" แล้วผู้ทดสอบเปิดใช้ไม่ได้จนกว่าจะมีคนเข้าไปตอบ
       * คำถามเรื่องการเข้ารหัสด้วยมือใน App Store Connect ทุกรอบ
       */
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
      /* ชื่อใต้ไอคอนบนหน้าจอ iOS — สั้นกว่าชื่อในสโตร์โดยตั้งใจ */
      CFBundleDisplayName: LAUNCHER_NAME,
    },
  },

  android: {
    /*
     * Android ครอบ foreground ด้วย mask ที่ผู้ผลิตแต่ละเจ้ากำหนดเอง (วงกลม
     * สี่เหลี่ยมมน หยดน้ำ) ขอบนอกราวหนึ่งในสามจึงถูกตัดทิ้งได้เสมอ
     * ไฟล์นี้ย่อโลโก้ให้อยู่ในวงกลางไว้แล้ว ไม่งั้นตัว T กับ C จะโดนเฉือน
     */
    adaptiveIcon: {
      /*
       * ชั้นหลังเป็นรูป ไม่ใช่สีทึบ — ตราไล่สีอยู่ในตัว พื้นสีเดียวจึงเห็นเป็น
       * ขอบสี่เหลี่ยมรอบตราเสมอไม่ว่าจะเลือกสีไหน ไฟล์นี้คือตราตัวเดียวกัน
       * ขยายแล้วเบลอ สีตรงรอยต่อจึงเนียนไปกับขอบของตราที่วางทับอยู่
       */
      backgroundImage: './assets/adaptive-icon-bg.png',
      /* สีสำรองเผื่อชั้นหลังหลุด — น้ำเงินกลางของตรา ไม่ใช่ขาว */
      backgroundColor: '#578FE0',
      foregroundImage: './assets/adaptive-icon-hrtjc.png',
    },
    package: BUNDLE_ID,
    /*
     * `SYSTEM_ALERT_WINDOW` (วาดทับแอปอื่น) มาจาก `expo-dev-client` ที่ใช้
     * วาดเมนูนักพัฒนาลอยเหนือแอป — ผู้ใช้จริงไม่ควรเห็นสิทธิ์นี้ตอนติดตั้ง
     * และ Play Console ถือเป็นสิทธิ์อ่อนไหวที่ต้องอธิบาย
     *
     * บล็อกเฉพาะบิลด์จริง บิลด์สำหรับพัฒนายังต้องใช้เมนูนั้นอยู่
     */
    ...(IS_PRODUCTION
      ? { blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'] }
      : {}),
  },

  plugins: [
    /* ชื่อใต้ไอคอนฝั่ง Android — Expo ไม่มีช่องให้ตั้งแยกจาก `name` */
    ['./plugins/with-launcher-label', { label: LAUNCHER_NAME }],
    /* ถอดคำอธิบายสิทธิ์ของ dev client ออกจากบิลด์ที่จะขึ้นสโตร์ */
    ...(IS_PRODUCTION ? ['./plugins/with-store-permission-cleanup'] : []),
    '@react-native-community/datetimepicker',
    /*
     * Sentry ต้องมาก่อน plugin อื่นเพื่อให้ดัก native crash ได้ตั้งแต่ต้น
     * ไม่ตั้ง org/project ที่นี่ — ตอน build จะอ่านจาก SENTRY_ORG / SENTRY_PROJECT
     * และ SENTRY_AUTH_TOKEN ใน environment ของ EAS ซึ่งเป็นความลับ
     * ห้ามผูกไว้ในไฟล์ที่ commit
     */
    '@sentry/react-native/expo',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/splash-hrtjc.png',
        /*
         * ใช้ตราแนวนอนที่มีชื่อ HR-TJC GROUP อยู่ในตัว ชุดเดียวกับหน้าเข้าสู่
         * ระบบ — จอเปิดแอปกับจอแรกที่เห็นต่อจากนั้นต้องเป็นตราเดียวกัน
         */
        imageWidth: 240,
      },
    ],
    'expo-router',
    'expo-secure-store',
    [
      'expo-local-authentication',
      {
        // ข้อความนี้โผล่บนหน้าจอสแกนนิ้ว/หน้า ต้องบอกเหตุผลให้ผู้ใช้เข้าใจ
        faceIDPermission: 'ใช้ Face ID เพื่อปลดล็อกการเข้าใช้งานแอปพนักงาน',
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission:
          'ใช้กล้องเพื่อถ่ายรูปหลักฐานประกอบคำขอ เช่น ใบรับรองแพทย์',
        /*
         * แอปแนบได้แค่รูป ไม่มีถ่ายวิดีโอ จึงไม่ต้องขอไมโครโฟน
         *
         * ค่า `false` ทำสองอย่างพร้อมกัน: ถอด `NSMicrophoneUsageDescription`
         * ออกจาก Info.plist และบล็อก `RECORD_AUDIO` ไม่ให้เข้า AndroidManifest
         * — ไม่งั้นผู้ใช้เห็นตอนติดตั้งว่าแอป HR ขอบันทึกเสียง และ Play Console
         * บังคับให้กรอกเหตุผลซึ่งเราไม่มี
         */
        microphonePermission: false,
        photosPermission:
          'ใช้คลังรูปเพื่อเลือกรูปหลักฐานประกอบคำขอ เช่น ใบรับรองแพทย์',
      },
    ],
    [
      'expo-location',
      {
        /*
         * ขอเฉพาะตอนใช้งาน (foreground) เท่านั้น
         * ไม่ขอ background location เพราะการลงเวลาเกิดจากผู้ใช้กดปุ่มเอง
         * และการขอสิทธิ์ติดตามตลอดเวลาต้องอธิบายกับสโตร์เป็นพิเศษ
         * ทั้งที่ระบบไม่ได้ใช้จริง
         */
        isAndroidBackgroundLocationEnabled: false,
        /*
         * สามคีย์ที่ตั้งเป็น `false` คือคำอธิบายที่ปลั๊กอินใส่ให้เองเป็นภาษา
         * อังกฤษ ("Allow $(PRODUCT_NAME) to access your location") ทั้งที่แอป
         * ไม่ได้ใช้ — Apple อ่านทุกบรรทัดและถามหาเหตุผทุกตัวที่ประกาศไว้
         * โดยเฉพาะตำแหน่งแบบตลอดเวลา ซึ่งเป็นเหตุผลปฏิเสธที่พบบ่อยที่สุด
         *
         * `false` = ถอดคีย์ออกจาก Info.plist ไปเลย ไม่ใช่ใส่ค่าว่าง
         */
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        locationWhenInUsePermission:
          'ใช้ตำแหน่งเพื่อยืนยันว่าคุณอยู่ในพื้นที่ที่บริษัทอนุญาตขณะลงเวลาเท่านั้น',
      },
    ],
  ],

  web: {
    favicon: './assets/favicon-hrtjc.png',
  },

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    appEnv: APP_ENV,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    /*
     * EAS อ่านค่านี้เพื่อรู้ว่าบิลด์ไปลงโปรเจกต์ไหน
     * ต้องเขียนไว้ตรงนี้เอง เพราะ eas init เขียนทับ app.config.ts ที่เป็น
     * dynamic config ให้อัตโนมัติไม่ได้ (ต่างจาก app.json)
     */
    eas: { projectId: 'd7bb4ebc-6b86-4689-a8b2-c120f038587d' },
  },
};

/*
 * คีย์ `splash` ระดับบนสุดมีไว้ให้ Expo Go โดยเฉพาะ
 *
 * config ของ plugin `expo-splash-screen` ทำงานตอน build เป็นแอปจริงเท่านั้น —
 * Expo Go ไม่ได้รันขั้นตอน prebuild จึงอ่านคีย์นี้แทน ถ้าไม่มี จอเปิดแอปใน
 * Expo Go จะเป็นขาวเปล่า ๆ ไม่มีตราองค์กร
 *
 * แนบทีหลังด้วย type assertion เพราะ SDK ปัจจุบันถอดคีย์นี้ออกจาก `ExpoConfig`
 * ไปแล้ว (ย้ายไปอยู่ใน plugin) แต่ตัว Expo Go ยังอ่านอยู่ — ดีกว่าปิด type
 * ตรวจทั้งไฟล์เพื่อคีย์เดียว
 */
(
  config as ExpoConfig & {
    splash?: { backgroundColor: string; image: string; resizeMode: string };
  }
).splash = {
  backgroundColor: '#FFFFFF',
  image: './assets/splash-hrtjc.png',
  resizeMode: 'contain',
};

export default config;
