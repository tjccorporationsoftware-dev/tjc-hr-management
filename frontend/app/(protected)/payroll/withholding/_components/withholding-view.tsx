"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Banknote,
  Building2,
  Landmark,
  Plus,
  ReceiptText,
  User,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  Button,
  Money,
  Notice,
  PageChip,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
  Tabs,
} from "@/components/kit";
import {
  createWithholdingPayee,
  createWithholdingPayment,
  deleteWithholdingPayee,
  deleteWithholdingPayment,
  fetchWithholdingIncomeTypes,
  fetchWithholdingPayees,
  fetchWithholdingPayments,
  getOrganizationCompanies,
  updateWithholdingPayee,
  updateWithholdingPayment,
  type WithholdingIncomeType,
  type WithholdingPayee,
  type WithholdingPayment,
} from "@/lib/api";
import { errorText } from "@/lib/payroll-format";
import { formatThaiDate } from "@/lib/date-format";
import type { CompanyItem } from "@/types/organization";

import { PayeeModal } from "./payee-modal";
import { PaymentModal } from "./payment-modal";

/**
 * ภาษีหัก ณ ที่จ่ายของผู้รับเงินที่ไม่ใช่ลูกจ้าง
 * -----------------------------------------------------------------------------
 * แหล่งข้อมูลของแบบ ภ.ง.ด.3 — ค่าเช่า ค่าจ้างทำของ ค่าโฆษณา ค่าขนส่ง ฯลฯ
 * ที่จ่ายให้คนนอกซึ่งไม่ได้อยู่ในรอบเงินเดือน
 *
 * สองแท็บเพราะเป็นงานคนละจังหวะ — ผู้รับเงินตั้งครั้งเดียวใช้ยาว
 * ส่วนรายการจ่ายบันทึกทุกครั้งที่จ่าย แล้วเดือนถัดไปค่อยออกแบบยื่น
 */

type TabKey = "payments" | "payees";

const CONDITION_LABEL: Record<string, string> = {
  WITHHELD: "หัก ณ ที่จ่าย",
  PAID_ALWAYS: "ออกให้ตลอดไป",
  PAID_ONCE: "ออกให้ครั้งเดียว",
};

const now = new Date();

const EMPTY_SUMMARY = { count: 0, amount: 0, taxAmount: 0 };

/** ช่องว่างเปล่าของรายการ */
function EmptyBlock({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-16 text-center">
      <p className="text-[13px] font-semibold text-slate-600">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * รายการจ่ายหนึ่งรายการ — บรรทัดเดียว
 * ซ้ายบอกว่าจ่ายให้ใครเรื่องอะไร ขวาเป็นตัวเลขของรายการนั้นคั่นด้วยเส้น
 */
function PaymentRow({
  row,
  conditionLabel,
  onEdit,
  onDelete,
}: {
  row: WithholdingPayment;
  conditionLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <ReceiptText className="h-4 w-4" />
      </span>

      <div className="min-w-[12rem] flex-1">
        <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
          {row.payee?.name ?? "-"}
        </p>
        <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
          {[row.payee?.taxId, row.incomeTypeLabel, conditionLabel]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="flex shrink-0 items-center divide-x divide-brand-100">
        <RowFact label="วันที่จ่าย" value={formatThaiDate(row.paidOn)} />
        <RowFact label="อัตรา" value={`${Number(row.taxRatePercent)}%`} />
        <RowFact label="จำนวนเงิน" value={<Money value={row.amount} />} />
        <RowFact
          label="ภาษีที่หัก"
          value={<Money value={row.taxAmount} />}
          tone="tax"
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={onEdit}>
          แก้ไข
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          ลบ
        </Button>
      </div>
    </article>
  );
}

/** ผู้รับเงินหนึ่งราย — บรรทัดเดียว */
function PayeeRow({
  row,
  onEdit,
  onDelete,
}: {
  row: WithholdingPayee;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-7 3xl:px-8">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        {row.type === "INDIVIDUAL" ? (
          <User className="h-4 w-4" />
        ) : (
          <Building2 className="h-4 w-4" />
        )}
      </span>

      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
            {row.name}
          </p>
          <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
            {row.type === "INDIVIDUAL" ? "บุคคลธรรมดา" : "นิติบุคคล"}
          </span>
        </div>
        <p className="truncate text-[11.5px] tabular-nums text-slate-500 3xl:text-[12px]">
          {row.taxId}
          {row.branchNo !== "00000" ? ` · สาขา ${row.branchNo}` : ""}
        </p>
      </div>

      {/* ที่อยู่จำเป็นตอนออกใบแนบ ภ.ง.ด.3 ถ้ายังว่างต้องเห็นตั้งแต่ในรายการ */}
      <div className="w-64 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          ที่อยู่
        </p>
        {row.address ? (
          <p className="truncate text-[12.5px] text-slate-700 3xl:text-[13px]">
            {row.address}
          </p>
        ) : (
          <p className="truncate text-[12.5px] font-semibold text-amber-600 3xl:text-[13px]">
            ยังไม่ได้กรอก — ใบแนบต้องใช้
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={onEdit}>
          แก้ไข
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          ลบ
        </Button>
      </div>
    </article>
  );
}

/** ตัวเลขหนึ่งช่องในแถวรายการจ่าย */
function RowFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "tax";
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={`whitespace-nowrap text-[12.5px] font-semibold tabular-nums 3xl:text-[13px] ${
          tone === "tax" ? "text-rose-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function WithholdingView() {
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [booting, setBooting] = useState(true);

  const [tab, setTab] = useState<TabKey>("payments");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [search, setSearch] = useState("");

  const [incomeTypes, setIncomeTypes] = useState<WithholdingIncomeType[]>([]);
  const [payees, setPayees] = useState<WithholdingPayee[]>([]);
  const [payments, setPayments] = useState<WithholdingPayment[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  /* หน่วงคำค้นก่อนยิง API — ทุกตัวอักษรยิงสองเส้นทันทีคือของเดิม */
  const [searchTerm, setSearchTerm] = useState("");
  const searchTimerRef = useRef<number | null>(null);

  const [payeeModal, setPayeeModal] = useState<WithholdingPayee | null | false>(
    false,
  );
  const [paymentModal, setPaymentModal] = useState<
    WithholdingPayment | null | false
  >(false);

  useEffect(() => {
    void (async () => {
      try {
        const [companyResult, typeResult] = await Promise.all([
          getOrganizationCompanies({
            page: 1,
            pageSize: 100,
            status: "ACTIVE",
          }),
          fetchWithholdingIncomeTypes(),
        ]);

        setCompanies(companyResult.items ?? []);
        setCompanyId(
          (current) => current || companyResult.items?.[0]?.id || "",
        );
        setIncomeTypes(typeResult ?? []);
      } catch (bootError) {
        const message = errorText(bootError, "โหลดข้อมูลตั้งต้นไม่สำเร็จ");
        setError(message);
        toast.error(message);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;

    setLoading(true);
    setError(null);

    try {
      const [payeeResult, paymentResult] = await Promise.all([
        fetchWithholdingPayees({
          companyId,
          search: searchTerm || undefined,
        }),
        fetchWithholdingPayments({
          companyId,
          year: Number(year),
          month: Number(month),
          search: searchTerm || undefined,
        }),
      ]);

      /*
       * กันคำตอบที่ไม่ครบรูป — ถ้า summary หายไปแล้วปล่อยลง state ตรง ๆ
       * เรนเดอร์ถัดไปจะพังทั้งหน้าที่ summary.count กลายเป็นจอ "เปิดหน้านี้ไม่สำเร็จ"
       * ทั้งที่เป็นแค่ข้อมูลไม่ครบ ไม่ใช่ระบบล่ม
       */
      setPayees(payeeResult ?? []);
      setPayments(paymentResult.data ?? []);
      setSummary(paymentResult.summary ?? EMPTY_SUMMARY);
    } catch (loadError) {
      const message = errorText(loadError, "โหลดข้อมูลไม่สำเร็จ");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [companyId, year, month, searchTerm]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดใหม่เมื่อเปลี่ยนบริษัท/เดือน/คำค้น
    void load();
  }, [load]);

  /* คำค้นรอให้พิมพ์จบก่อน — เดิมยิง 2 เส้นทุกตัวอักษรที่กด */
  useEffect(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = window.setTimeout(() => {
      setSearchTerm(search.trim());
      searchTimerRef.current = null;
    }, 350);

    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [search]);

  /** ปีที่เลือกได้ — ย้อนหลัง 3 ปีก็พอสำหรับงานยื่นภาษี */
  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    return [current + 1, current, current - 1, current - 2];
  }, []);

  function removePayee(row: WithholdingPayee) {
    setActionDialog({
      title: "ลบผู้รับเงิน",
      description: `ลบ ${row.name} ออกจากทะเบียนผู้รับเงิน ? รายที่เคยมีรายการจ่ายแล้วจะลบไม่ได้`,
      confirmLabel: "ลบผู้รับเงิน",
      tone: "red",
      onConfirm: async () => {
        try {
          await deleteWithholdingPayee(row.id);
          toast.success("ลบผู้รับเงินแล้ว");
          setActionDialog(null);
          await load();
        } catch (removeError) {
          toast.error(errorText(removeError, "ลบไม่สำเร็จ"));
        }
      },
    });
  }

  function removePayment(row: WithholdingPayment) {
    setActionDialog({
      title: "ลบรายการจ่าย",
      description: `ลบรายการจ่ายของ ${row.payee?.name ?? "ผู้รับเงินรายนี้"} วันที่ ${formatThaiDate(row.paidOn)} ?`,
      confirmLabel: "ลบรายการ",
      tone: "red",
      onConfirm: async () => {
        try {
          await deleteWithholdingPayment(row.id);
          toast.success("ลบรายการจ่ายแล้ว");
          setActionDialog(null);
          await load();
        } catch (removeError) {
          toast.error(errorText(removeError, "ลบไม่สำเร็จ"));
        }
      },
    });
  }

  return (
    <PageSurface>
      <PageHeading
        heroMotif="withholding"
        eyebrow="Withholding Tax"
        title="หัก ณ "
        titleAccent="ที่จ่าย"
        description="บันทึกการจ่ายเงินให้ผู้รับที่ไม่ใช่ลูกจ้าง เพื่อออกแบบ ภ.ง.ด.3 — ค่าเช่า ค่าจ้างทำของ ค่าโฆษณา ค่าขนส่ง ฯลฯ"
        chips={
          <>
            <PageChip>ภ.ง.ด.3</PageChip>
            <PageChip>ยื่นภายในวันที่ 7 ของเดือนถัดไป</PageChip>
          </>
        }
        actions={
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(3,minmax(10rem,max-content))] sm:divide-y-0">
            <StatTile
              icon={<ReceiptText className="h-4 w-4" />}
              label="รายการจ่าย"
              value={String(summary.count)}
              helper="ในเดือนที่เลือก"
            />
            <StatTile
              icon={<Banknote className="h-4 w-4" />}
              label="ยอดจ่ายรวม"
              value={<Money value={summary.amount} />}
              helper="ก่อนหักภาษี"
            />
            <StatTile
              icon={<Landmark className="h-4 w-4" />}
              label="ภาษีที่หักรวม"
              value={<Money value={summary.taxAmount} />}
              helper="ยอดที่ต้องนำส่ง"
            />
          </div>
        }
      />

      {/*
       * ไม่มีบริษัทในสิทธิ์ = ทั้งหน้าโหลดอะไรไม่ได้เลย (load() คืนค่าออกทันที)
       * ของเดิมเงียบสนิท เห็นแค่ตารางว่างที่อ่านได้ว่า "ยังไม่มีข้อมูล"
       */}
      {!booting && companies.length === 0 ? (
        <Notice tone="warning">
          บัญชีนี้ยังไม่มีบริษัทที่เข้าถึงได้ จึงบันทึกภาษีหัก ณ ที่จ่ายไม่ได้ —
          ตรวจสิทธิ์บริษัทที่หน้า ผู้ใช้และสิทธิ์
        </Notice>
      ) : null}

      {/*
       * แถบเครื่องมือพื้นเทาอ่อน — เลือกขอบเขตข้อมูลก่อนดูรายการ
       * เดิมสามช่องนี้อยู่มุมขวาบนของหัวเรื่อง ปนกับคำอธิบายหน้า
       */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-6 py-3 sm:px-7 3xl:px-8">
        <div className="w-full sm:w-56 [&_select]:bg-white">
          <Select
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            aria-label="บริษัท"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.nameTh}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-full sm:w-32 [&_select]:bg-white">
          <Select
            value={year}
            onChange={(event) => setYear(event.target.value)}
            aria-label="ปีภาษี"
          >
            {yearOptions.map((value) => (
              <option key={value} value={value}>
                ปี {value + 543}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-full sm:w-32 [&_select]:bg-white">
          <Select
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            aria-label="เดือน"
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map(
              (value) => (
                <option key={value} value={value}>
                  เดือน {value}
                </option>
              ),
            )}
          </Select>
        </div>

        <p className="text-[12.5px] text-slate-500 3xl:text-[13px]">
          {tab === "payments"
            ? `${payments.length.toLocaleString("th-TH")} รายการจ่าย`
            : `${payees.length.toLocaleString("th-TH")} ผู้รับเงิน`}
        </p>
      </div>

      <Tabs
        items={[
          { key: "payments", label: "รายการจ่าย", count: payments.length },
          { key: "payees", label: "ผู้รับเงิน", count: payees.length },
        ]}
        value={tab}
        onChange={setTab}
        trailing={
          <div className="flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นชื่อหรือเลขผู้เสียภาษี"
            />
            {/*
             * รายการจ่ายต้องอ้างผู้รับเงินเสมอ ถ้ายังไม่มีใครในทะเบียน
             * ฟอร์มจะเปิดมาโดยช่องผู้รับเงินว่าง แล้วกดบันทึกไม่ผ่านที่ API
             * ปิดปุ่มไว้พร้อมบอกเหตุผลตรงนี้แทน
             */}
            <Button
              icon={<Plus className="h-3.5 w-3.5" />}
              disabled={
                !companyId || (tab === "payments" && payees.length === 0)
              }
              title={
                tab === "payments" && payees.length === 0
                  ? "เพิ่มผู้รับเงินก่อน จึงจะบันทึกการจ่ายได้"
                  : undefined
              }
              onClick={() =>
                tab === "payments" ? setPaymentModal(null) : setPayeeModal(null)
              }
            >
              {tab === "payments" ? "บันทึกการจ่าย" : "เพิ่มผู้รับเงิน"}
            </Button>
          </div>
        }
      />

      {/*
       * error ต้องส่งเข้าตาราง ไม่ใช่แค่ toast
       * toast หายไปใน 4 วินาที เหลือตารางว่างที่อ่านได้ว่า "เดือนนี้ไม่มีรายการ"
       * ซึ่งคนละเรื่องกับ "โหลดไม่สำเร็จ" — งานภาษีตัดสินใจผิดจากตรงนี้ได้
       */}
      {error ? (
        <div className="px-6 pt-4 sm:px-7 3xl:px-8">
          <Notice tone="critical">
            {error}{" "}
            <button
              type="button"
              onClick={() => void load()}
              className="font-semibold underline underline-offset-2"
            >
              ลองใหม่
            </button>
          </Notice>
        </div>
      ) : null}

      {/*
       * รายการทีละใบ ไม่ใช่ตาราง — หนึ่งรายการจ่ายมีทั้งวันที่ ผู้รับเงิน
       * ประเภทเงินได้ อัตรา ยอดจ่าย ภาษี และเงื่อนไข ยัดลงคอลัมน์แล้วต้องซ่อน
       * คอลัมน์เงื่อนไขตามความกว้างจอ
       */}
      <div className="divide-y divide-slate-200">
        {loading || booting ? (
          <p className="px-5 py-16 text-center text-[13px] font-semibold text-slate-600">
            กำลังโหลด…
          </p>
        ) : tab === "payments" ? (
          payments.length === 0 ? (
            <EmptyBlock
              title="ยังไม่มีรายการจ่ายในเดือนนี้"
              description="บันทึกการจ่ายเงินให้ผู้รับที่ไม่ใช่ลูกจ้างไว้ที่นี่ แล้วสั่งพิมพ์ ภ.ง.ด.3 ได้จากศูนย์รายงาน"
              action={
                companyId && payees.length > 0 ? (
                  <Button
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setPaymentModal(null)}
                  >
                    บันทึกการจ่าย
                  </Button>
                ) : null
              }
            />
          ) : (
            payments.map((row) => (
              <PaymentRow
                key={row.id}
                row={row}
                conditionLabel={CONDITION_LABEL[row.condition] ?? row.condition}
                onEdit={() => setPaymentModal(row)}
                onDelete={() => removePayment(row)}
              />
            ))
          )
        ) : payees.length === 0 ? (
          <EmptyBlock
            title="ยังไม่มีผู้รับเงิน"
            description="เพิ่มผู้รับเงินก่อน แล้วค่อยบันทึกรายการจ่าย"
            action={
              companyId ? (
                <Button
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setPayeeModal(null)}
                >
                  เพิ่มผู้รับเงิน
                </Button>
              ) : null
            }
          />
        ) : (
          payees.map((row) => (
            <PayeeRow
              key={row.id}
              row={row}
              onEdit={() => setPayeeModal(row)}
              onDelete={() => removePayee(row)}
            />
          ))
        )}
      </div>

      {payeeModal !== false ? (
        <PayeeModal
          companyId={companyId}
          payee={payeeModal}
          onClose={() => setPayeeModal(false)}
          onSaved={async () => {
            setPayeeModal(false);
            await load();
          }}
          onSubmit={(payload) =>
            payeeModal
              ? updateWithholdingPayee(payeeModal.id, payload)
              : createWithholdingPayee({ ...payload, companyId })
          }
        />
      ) : null}

      {paymentModal !== false ? (
        <PaymentModal
          companyId={companyId}
          payees={payees}
          incomeTypes={incomeTypes}
          payment={paymentModal}
          onClose={() => setPaymentModal(false)}
          onSaved={async () => {
            setPaymentModal(false);
            await load();
          }}
          onSubmit={(payload) =>
            paymentModal
              ? updateWithholdingPayment(paymentModal.id, payload)
              : createWithholdingPayment({ ...payload, companyId })
          }
        />
      ) : null}

      <ActionDialog
        state={actionDialog}
        onClose={() => setActionDialog(null)}
      />
    </PageSurface>
  );
}
