import { Injectable } from '@nestjs/common';

/**
 * เก็บสถิติของคำขอ HTTP เพื่อให้ตั้ง alert ได้จริง
 * -----------------------------------------------------------------------------
 * เดิม /monitoring/prometheus มีแต่ gauge (สถานะ ณ วินาทีที่ยิงมาถาม)
 * ซึ่งตั้งเงื่อนไขแบบ "error เกิน 5% ใน 5 นาที" หรือ "p95 เกิน 2 วินาที" ไม่ได้เลย
 * เพราะ gauge ไม่มีประวัติ ต้องเป็น counter (สะสมขึ้นอย่างเดียว) กับ histogram
 *
 * เก็บไว้ในหน่วยความจำของโปรเซส — หายเมื่อรีสตาร์ต ซึ่งถูกต้องสำหรับ counter
 * เพราะ Prometheus จับการรีเซ็ตได้เองด้วยฟังก์ชัน rate()
 */

/**
 * ขอบของ histogram (วินาที)
 *
 * ถี่ช่วง 50ms-1s เพราะเป็นช่วงที่คำขอส่วนใหญ่ตกอยู่
 * และมีขอบยาวถึง 30 วินาทีไว้จับงานหนักอย่างคำนวณเงินเดือน
 */
const DURATION_BUCKETS = [
  0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

type RouteKey = string;

type RouteStats = {
  /** จำนวนคำขอแยกตามรหัสสถานะ */
  countByStatus: Map<number, number>;
  /** จำนวนสะสมของแต่ละขอบ histogram */
  buckets: number[];
  totalCount: number;
  totalSeconds: number;
};

@Injectable()
export class HttpMetricsService {
  private readonly routes = new Map<RouteKey, RouteStats>();

  /**
   * เพดานจำนวน route ที่จำ
   *
   * กัน cardinality ระเบิด — ถ้ามีใครยิง path มั่ว ๆ เข้ามา แต่ละ path จะกลายเป็น
   * label ใหม่ใน Prometheus จนหน่วยความจำเต็มทั้งฝั่งแอปและฝั่ง Prometheus
   */
  private readonly maxRoutes = 200;

  private droppedRoutes = 0;

  /**
   * @param route path ที่ normalize แล้ว (เช่น /api/employees/:id) ไม่ใช่ path ดิบ
   *              ไม่งั้นทุก id จะกลายเป็นคนละ metric
   */
  record(params: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
  }) {
    const key = `${params.method} ${params.route}`;
    let stats = this.routes.get(key);

    if (!stats) {
      if (this.routes.size >= this.maxRoutes) {
        this.droppedRoutes += 1;
        return;
      }

      stats = {
        countByStatus: new Map(),
        buckets: new Array(DURATION_BUCKETS.length).fill(0),
        totalCount: 0,
        totalSeconds: 0,
      };
      this.routes.set(key, stats);
    }

    stats.countByStatus.set(
      params.statusCode,
      (stats.countByStatus.get(params.statusCode) ?? 0) + 1,
    );
    stats.totalCount += 1;
    stats.totalSeconds += params.durationSeconds;

    // histogram ของ Prometheus เป็นแบบสะสม ขอบที่ใหญ่กว่าต้องนับรวมด้วย
    for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
      if (params.durationSeconds <= DURATION_BUCKETS[index]) {
        stats.buckets[index] += 1;
      }
    }
  }

  /** แปลงเป็นรูปแบบ Prometheus text ต่อท้าย metric เดิม */
  toPrometheusLines() {
    const lines: string[] = [
      '# HELP hr_http_requests_total Total HTTP requests',
      '# TYPE hr_http_requests_total counter',
    ];

    for (const [key, stats] of this.routes) {
      const [method, route] = this.splitKey(key);

      for (const [statusCode, count] of stats.countByStatus) {
        lines.push(
          `hr_http_requests_total{method="${method}",route="${route}",status="${statusCode}"} ${count}`,
        );
      }
    }

    lines.push(
      '# HELP hr_http_request_duration_seconds HTTP request duration',
      '# TYPE hr_http_request_duration_seconds histogram',
    );

    for (const [key, stats] of this.routes) {
      const [method, route] = this.splitKey(key);
      const labels = `method="${method}",route="${route}"`;

      for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
        lines.push(
          `hr_http_request_duration_seconds_bucket{${labels},le="${DURATION_BUCKETS[index]}"} ${stats.buckets[index]}`,
        );
      }

      lines.push(
        `hr_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${stats.totalCount}`,
        `hr_http_request_duration_seconds_sum{${labels}} ${stats.totalSeconds.toFixed(6)}`,
        `hr_http_request_duration_seconds_count{${labels}} ${stats.totalCount}`,
      );
    }

    if (this.droppedRoutes > 0) {
      lines.push(
        '# HELP hr_http_routes_dropped_total Requests not recorded because the route limit was reached',
        '# TYPE hr_http_routes_dropped_total counter',
        `hr_http_routes_dropped_total ${this.droppedRoutes}`,
      );
    }

    return lines;
  }

  private splitKey(key: RouteKey): [string, string] {
    const spaceIndex = key.indexOf(' ');

    return [key.slice(0, spaceIndex), key.slice(spaceIndex + 1)];
  }
}
