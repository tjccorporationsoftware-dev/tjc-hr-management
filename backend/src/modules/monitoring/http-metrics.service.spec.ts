import { HttpMetricsService } from './http-metrics.service';

/**
 * counter กับ histogram ของคำขอ HTTP
 *
 * เดิม /monitoring/prometheus มีแต่ gauge ซึ่งบอกได้แค่สถานะ ณ วินาทีที่ยิงมาถาม
 * จึงตั้งเงื่อนไขแจ้งเตือนแบบ "error เกิน 5% ใน 5 นาที" หรือ "p95 เกิน 2 วินาที" ไม่ได้เลย
 */
describe('HttpMetricsService', () => {
  function record(
    service: HttpMetricsService,
    overrides: Partial<{
      method: string;
      route: string;
      statusCode: number;
      durationSeconds: number;
    }> = {},
  ) {
    service.record({
      method: 'GET',
      route: '/api/employees',
      statusCode: 200,
      durationSeconds: 0.08,
      ...overrides,
    });
  }

  it('นับจำนวนคำขอแยกตามรหัสสถานะ', () => {
    const service = new HttpMetricsService();

    record(service);
    record(service);
    record(service, { statusCode: 500 });

    const output = service.toPrometheusLines().join('\n');

    expect(output).toContain(
      'hr_http_requests_total{method="GET",route="/api/employees",status="200"} 2',
    );
    expect(output).toContain(
      'hr_http_requests_total{method="GET",route="/api/employees",status="500"} 1',
    );
  });

  it('histogram เป็นแบบสะสม — ขอบที่ใหญ่กว่าต้องนับรวมด้วย', () => {
    const service = new HttpMetricsService();

    record(service, { durationSeconds: 0.08 });

    const output = service.toPrometheusLines().join('\n');

    // 0.08 วินาที ต้องไม่ถูกนับในขอบ 0.05 แต่ถูกนับในขอบ 0.1 ขึ้นไปทุกขอบ
    expect(output).toContain('le="0.05"} 0');
    expect(output).toContain('le="0.1"} 1');
    expect(output).toContain('le="1"} 1');
    expect(output).toContain('le="+Inf"} 1');
  });

  it('มี sum และ count ให้คำนวณค่าเฉลี่ยและ p95 ได้', () => {
    const service = new HttpMetricsService();

    record(service, { durationSeconds: 0.2 });
    record(service, { durationSeconds: 0.4 });

    const output = service.toPrometheusLines().join('\n');

    expect(output).toContain('hr_http_request_duration_seconds_count');
    expect(output).toMatch(/hr_http_request_duration_seconds_sum\{[^}]+\} 0\.600000/);
  });

  it('แยก method และ route ออกจากกัน', () => {
    const service = new HttpMetricsService();

    record(service, { method: 'POST', route: '/api/leaves' });
    record(service, { method: 'GET', route: '/api/leaves' });

    const output = service.toPrometheusLines().join('\n');

    expect(output).toContain('method="POST",route="/api/leaves"');
    expect(output).toContain('method="GET",route="/api/leaves"');
  });

  it('มีเพดานจำนวน route กัน label ระเบิดจากการยิง path มั่ว', () => {
    const service = new HttpMetricsService();

    // เกินเพดาน 200 ไปมาก
    for (let index = 0; index < 260; index += 1) {
      record(service, { route: `/api/path-${index}` });
    }

    const output = service.toPrometheusLines().join('\n');

    expect(output).toContain('hr_http_routes_dropped_total');
    // route ที่ 250 ต้องไม่ถูกจำ
    expect(output).not.toContain('route="/api/path-250"');
  });

  it('ไม่มีคำขอเลย ก็ยังคืนหัว metric ได้ ไม่พัง', () => {
    const service = new HttpMetricsService();

    expect(service.toPrometheusLines().join('\n')).toContain(
      '# TYPE hr_http_requests_total counter',
    );
  });
});
