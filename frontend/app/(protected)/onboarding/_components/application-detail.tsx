"use client";

import { useState, type ReactNode } from "react";
import { Check, CheckCircle2, Plus } from "lucide-react";

import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDate, formatThaiDateTime } from "@/lib/date-format";
import { Badge, Button, Notice, Select, TextInput } from "@/components/kit";
import type {
  InterviewResult,
  JobApplication,
  JobApplicationStage,
  JobOfferStatus,
} from "@/types/recruitment";

import {
  addDays,
  interviewResultText,
  interviewResultTone,
  interviewerLabel,
  money,
  offerStatusText,
  offerStatusTone,
  stageText,
  toLocalIsoDateTime,
  todayDate,
  type BranchOption,
  type InterviewerOption,
} from "./recruitment-shared";

/* ------------------------------------------------------------------ */
/* Application detail                                                  */
/* ------------------------------------------------------------------ */

/**
 * ป๊อปอัพผู้สมัคร — เดินทีละขั้น
 * ----------------------------
 * เดิมโชว์ทุกอย่างพร้อมกัน: แถบสถานะ ข้อมูลติดต่อ ปุ่มลัด รายการสัมภาษณ์
 * ฟอร์มนัดสัมภาษณ์ รายการใบเสนอจ้าง ฟอร์มออกใบเสนอจ้าง — ทั้งที่ผู้สมัครที่
 * เพิ่งสมัครยังไม่ควรเห็นฟอร์มออกใบเสนอจ้างเลย คนใช้จึงไม่รู้ว่า "ตอนนี้ต้องทำอะไร"
 *
 * ที่นี่โชว์ทีละขั้น: ขั้นที่ทำผ่านแล้วยุบเหลือสรุปอ่านอย่างเดียว
 * ขั้นปัจจุบันกางฟอร์มให้ทำ ขั้นถัดไปยังไม่โผล่จนกว่าขั้นนี้จะครบ
 */

const APPLICATION_STEPS: Array<{
  stage: JobApplicationStage;
  title: string;
  hint: string;
}> = [
  {
    stage: "NEW",
    title: "รับใบสมัคร",
    hint: "ตรวจข้อมูลผู้สมัครว่าครบพอจะพิจารณาต่อได้",
  },
  {
    stage: "SCREENING",
    title: "คัดกรอง",
    hint: "ดูคุณสมบัติเบื้องต้น ถ้าผ่านให้นัดสัมภาษณ์",
  },
  {
    stage: "INTERVIEW",
    title: "สัมภาษณ์",
    hint: "นัดสัมภาษณ์ แล้วบันทึกผลของแต่ละรอบ",
  },
  {
    stage: "OFFER",
    title: "เสนอจ้าง",
    hint: "ออกใบเสนอจ้าง ส่งให้ผู้สมัคร แล้วบันทึกคำตอบที่ได้รับกลับมา",
  },
  {
    stage: "HIRED",
    title: "จ้างเป็นพนักงาน",
    hint: "แปลงเป็นพนักงานและเปิดใบทดลองงานอัตโนมัติ",
  },
];

/** หัวข้อของแต่ละขั้น — บอกสถานะด้วยสีและไอคอน ไม่ต้องอ่านคำอธิบายก็รู้ */
/**
 * หนึ่งขั้นในไทม์ไลน์
 * ----------------
 * เดิมเป็นกล่องมีขอบใบละขั้น ห้าขั้นก็ห้ากล่องซ้อนอยู่ในป๊อปอัพซึ่งเป็นกล่องอยู่แล้ว
 * เปลี่ยนเป็นเส้นตั้งเชื่อมหัวจุดของแต่ละขั้น ตาจึงเห็นว่าเดินมาถึงไหนและเหลืออีกกี่ขั้น
 */
function StepCard({
  index,
  title,
  hint,
  state,
  isLast = false,
  children,
}: {
  index: number;
  title: string;
  hint: string;
  state: "done" | "current" | "upcoming";
  isLast?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="relative pl-9">
      {/* เส้นเชื่อมไปขั้นถัดไป */}
      {isLast ? null : (
        <span
          aria-hidden
          className="absolute bottom-0 left-[13px] top-7 w-px bg-brand-100"
        />
      )}

      <span
        className={[
          "absolute left-0 top-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold",
          state === "done"
            ? "bg-brand-500 text-white"
            : state === "current"
              ? "bg-white text-brand-700 ring-2 ring-brand-500"
              : "bg-white text-slate-300 ring-1 ring-brand-100",
        ].join(" ")}
      >
        {state === "done" ? <Check className="h-3.5 w-3.5" /> : index + 1}
      </span>

      <div className={isLast ? "pb-0" : "pb-5"}>
        <p
          className={[
            "text-[13.5px] font-bold leading-7 3xl:text-[14.5px]",
            state === "upcoming" ? "text-slate-400" : "text-slate-900",
          ].join(" ")}
        >
          {title}
        </p>
        {state === "current" ? (
          <p className="text-[12px] leading-5 text-slate-500 3xl:text-[12.5px]">
            {hint}
          </p>
        ) : null}

        {children ? <div className="mt-2.5">{children}</div> : null}
      </div>
    </section>
  );
}

export function ApplicationDetail({
  item,
  saving,
  branches,
  interviewers,
  onMoveStage,
  onReject,
  onScheduleInterview,
  onRecordResult,
  onCreateOffer,
  onOfferStatus,
  onHire,
}: {
  item: JobApplication;
  saving: boolean;
  branches: BranchOption[];
  interviewers: InterviewerOption[];
  onMoveStage: (stage: JobApplicationStage) => void;
  onReject: () => void;
  onScheduleInterview: (payload: {
    scheduledAt: string;
    location?: string;
    interviewerName?: string;
    interviewerId?: string;
  }) => void;
  onRecordResult: (
    interviewId: string,
    payload: { result: InterviewResult; score?: number; note?: string },
  ) => void;
  onCreateOffer: (payload: {
    offeredSalary: number;
    startDate: string;
    probationDays: number;
  }) => void;
  onOfferStatus: (offerId: string, status: JobOfferStatus) => void;
  onHire: () => void;
}) {
  const closed =
    item.stage === "HIRED" ||
    item.stage === "REJECTED" ||
    item.stage === "WITHDRAWN";

  const interviews = item.interviews ?? [];
  const offers = item.offers ?? [];
  const acceptedOffer = offers.find((offer) => offer.status === "ACCEPTED");
  const passedInterview = interviews.some(
    (interview) => interview.result === "PASSED",
  );

  const [interviewDraft, setInterviewDraft] = useState({
    scheduledAt: todayDate(),
    /** เวลานัด เก็บเป็น "HH:mm" 24 ชม. ตั้งต้นที่ 09:00 ตามเวลาเริ่มงาน */
    scheduledTime: "09:00",
    location: "",
    interviewerName: "",
    interviewerEmployeeId: "",
  });

  const [offerDraft, setOfferDraft] = useState({
    offeredSalary: String(item.expectedSalary ?? ""),
    startDate: addDays(30),
    probationDays: 119,
  });

  if (item.stage === "REJECTED" || item.stage === "WITHDRAWN") {
    return (
      <div className="space-y-4">
        <Notice tone="critical">
          <p className="font-bold">{stageText[item.stage]}</p>
          {item.rejectReason ? (
            <p className="mt-0.5">เหตุผล: {item.rejectReason}</p>
          ) : null}
        </Notice>
        <ApplicantProfile item={item} />
      </div>
    );
  }

  const stageIndex = APPLICATION_STEPS.findIndex(
    (step) => step.stage === item.stage,
  );

  /*
   * ขั้น "จ้างเป็นพนักงาน" ไม่มีปุ่มเลื่อนสถานะของตัวเอง — สถานะจะกลายเป็น HIRED
   * ก็ต่อเมื่อกดจ้างไปแล้ว ถ้ายึดตาม item.stage ตรง ๆ ขั้นนี้จะเป็น "ยังไม่ถึง"
   * ตลอดกาลและไม่มีปุ่มให้กด กลายเป็นทางตัน
   *
   * พอผู้สมัครตอบรับใบเสนอจ้างแล้ว ถือว่าขั้นเสนอจ้างจบ และเปิดขั้นจ้างให้ทำได้
   */
  const currentIndex =
    item.stage === "OFFER" && acceptedOffer ? 4 : stageIndex;

  const stepState = (index: number) =>
    index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";

  return (
    <div>
      {/* ---------- ขั้น 1: รับใบสมัคร ---------- */}
      <StepCard
        index={0}
        title={APPLICATION_STEPS[0].title}
        hint={APPLICATION_STEPS[0].hint}
        state={stepState(0)}
      >
        <ApplicantProfile item={item} />

        {item.stage === "NEW" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => onMoveStage("SCREENING")}
            >
              ตรวจแล้ว ไปขั้นคัดกรอง
            </Button>
            <Button variant="danger" disabled={saving} onClick={onReject}>
              ไม่ผ่าน
            </Button>
          </div>
        ) : null}
      </StepCard>

      {/* ---------- ขั้น 2: คัดกรอง ---------- */}
      <StepCard
        index={1}
        title={APPLICATION_STEPS[1].title}
        hint={APPLICATION_STEPS[1].hint}
        state={stepState(1)}
      >
        {item.stage === "SCREENING" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => onMoveStage("INTERVIEW")}
            >
              ผ่านคัดกรอง ไปขั้นสัมภาษณ์
            </Button>
            <Button variant="danger" disabled={saving} onClick={onReject}>
              ไม่ผ่าน
            </Button>
          </div>
        ) : stepState(1) === "done" ? (
          <p className="text-[12px] text-slate-500 3xl:text-[13px]">
            ผ่านคัดกรองแล้ว
          </p>
        ) : null}
      </StepCard>

      {/* ---------- ขั้น 3: สัมภาษณ์ ---------- */}
      <StepCard
        index={2}
        title={APPLICATION_STEPS[2].title}
        hint={APPLICATION_STEPS[2].hint}
        state={stepState(2)}
      >
        {stepState(2) === "upcoming" ? null : (
          <div className="space-y-3">
            {interviews.length === 0 ? (
              <p className="text-[12px] text-slate-400 3xl:text-[13px]">
                ยังไม่มีนัดสัมภาษณ์
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {interviews.map((interview) => (
                  <li
                    key={interview.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-slate-900">
                        รอบที่ {interview.round} ·{" "}
                        {formatThaiDateTime(interview.scheduledAt)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[12px]">
                        {[interview.location, interview.interviewerName]
                          .filter(Boolean)
                          .join(" · ") || "-"}
                        {interview.score !== null &&
                        interview.score !== undefined
                          ? ` · คะแนน ${interview.score}/10`
                          : ""}
                      </p>
                    </div>

                    <Badge tone={interviewResultTone(interview.result)}>
                      {interviewResultText[interview.result]}
                    </Badge>

                    {interview.result === "PENDING" && item.stage === "INTERVIEW" ? (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          disabled={saving}
                          onClick={() =>
                            onRecordResult(interview.id, { result: "PASSED" })
                          }
                        >
                          ผ่าน
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={saving}
                          onClick={() =>
                            onRecordResult(interview.id, { result: "FAILED" })
                          }
                        >
                          ไม่ผ่าน
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {item.stage === "INTERVIEW" ? (
              <>
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <div className="w-44">
                    <ThaiDateInput
                      value={interviewDraft.scheduledAt}
                      onChange={(event) =>
                        setInterviewDraft((prev) => ({
                          ...prev,
                          scheduledAt: event.target.value,
                        }))
                      }
                      aria-label="วันที่นัดสัมภาษณ์"
                    />
                  </div>
                  {/* เวลานัด — ต้องเลือกได้ ไม่งั้นทุกนัดกองอยู่ที่เที่ยงคืน */}
                  <TextInput
                    type="time"
                    value={interviewDraft.scheduledTime}
                    onChange={(event) =>
                      setInterviewDraft((prev) => ({
                        ...prev,
                        scheduledTime: event.target.value,
                      }))
                    }
                    className="w-28"
                    aria-label="เวลานัดสัมภาษณ์"
                  />
                  {/*
                    ผู้สัมภาษณ์เลือกจากพนักงานจริง ไม่ให้พิมพ์เอง
                    เดิมพิมพ์อิสระ ชื่อคนเดียวกันจึงสะกดไม่เหมือนกันในแต่ละรอบ
                    แล้วเอาไปสรุปว่าใครสัมภาษณ์ไปกี่คนไม่ได้
                  */}
                  <Select
                    value={interviewDraft.interviewerEmployeeId}
                    onChange={(event) => {
                      const picked = interviewers.find(
                        (person) => person.id === event.target.value,
                      );

                      setInterviewDraft((prev) => ({
                        ...prev,
                        interviewerEmployeeId: event.target.value,
                        interviewerName: picked ? interviewerLabel(picked) : "",
                      }));
                    }}
                    className="w-56"
                    aria-label="ผู้สัมภาษณ์"
                  >
                    <option value="">
                      {interviewers.length === 0
                        ? "ไม่มีสิทธิ์ดูรายชื่อพนักงาน"
                        : "เลือกผู้สัมภาษณ์"}
                    </option>
                    {interviewers.map((person) => (
                      <option key={person.id} value={person.id}>
                        {interviewerLabel(person)}
                      </option>
                    ))}
                  </Select>

                  {/* สถานที่: เลือกสาขาที่มีอยู่ หรือพิมพ์เองสำหรับลิงก์ประชุมออนไลน์ */}
                  <Select
                    value={
                      branches.some(
                        (branch) =>
                          (branch.nameTh ?? branch.name ?? branch.code) ===
                          interviewDraft.location,
                      )
                        ? interviewDraft.location
                        : ""
                    }
                    onChange={(event) =>
                      setInterviewDraft((prev) => ({
                        ...prev,
                        location: event.target.value,
                      }))
                    }
                    className="w-44"
                    aria-label="สถานที่สัมภาษณ์"
                  >
                    <option value="">เลือกสาขา</option>
                    {branches.map((branch) => (
                      <option
                        key={branch.id}
                        value={branch.nameTh ?? branch.name ?? branch.code ?? ""}
                      >
                        {branch.nameTh ?? branch.name ?? branch.code}
                      </option>
                    ))}
                  </Select>

                  <TextInput
                    value={interviewDraft.location}
                    onChange={(event) =>
                      setInterviewDraft((prev) => ({
                        ...prev,
                        location: event.target.value,
                      }))
                    }
                    placeholder="หรือพิมพ์สถานที่ / ลิงก์ประชุม"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    icon={<Plus className="h-3.5 w-3.5" />}
                    disabled={saving || !interviewDraft.scheduledAt}
                    onClick={() =>
                      onScheduleInterview({
                        scheduledAt: toLocalIsoDateTime(
                          interviewDraft.scheduledAt,
                          interviewDraft.scheduledTime,
                        ),
                        location: interviewDraft.location.trim() || undefined,
                        interviewerName:
                          interviewDraft.interviewerName.trim() || undefined,
                        /*
                         * interviewerId ในฐานข้อมูลชี้ไปที่ "บัญชีผู้ใช้" ไม่ใช่พนักงาน
                         * พนักงานที่ยังไม่มีบัญชีจึงส่งได้แค่ชื่อ
                         */
                        interviewerId:
                          interviewers.find(
                            (person) =>
                              person.id === interviewDraft.interviewerEmployeeId,
                          )?.userId ?? undefined,
                      })
                    }
                  >
                    นัดสัมภาษณ์
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <Button
                    variant="primary"
                    disabled={saving || !passedInterview}
                    title={
                      passedInterview
                        ? undefined
                        : "ต้องมีรอบสัมภาษณ์ที่บันทึกผลว่าผ่านอย่างน้อยหนึ่งรอบ"
                    }
                    onClick={() => onMoveStage("OFFER")}
                  >
                    ผ่านสัมภาษณ์ ไปขั้นเสนอจ้าง
                  </Button>
                  <Button variant="danger" disabled={saving} onClick={onReject}>
                    ไม่ผ่าน
                  </Button>
                  {!passedInterview ? (
                    <span className="text-[12px] text-slate-400 3xl:text-[13px]">
                      บันทึกผลสัมภาษณ์ว่า &quot;ผ่าน&quot; ก่อนถึงจะไปขั้นถัดไปได้
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        )}
      </StepCard>

      {/* ---------- ขั้น 4: เสนอจ้าง ---------- */}
      <StepCard
        index={3}
        title={APPLICATION_STEPS[3].title}
        hint={APPLICATION_STEPS[3].hint}
        state={stepState(3)}
      >
        {stepState(3) === "upcoming" ? null : (
          <div className="space-y-3">
            {offers.length === 0 ? (
              <p className="text-[12px] text-slate-400 3xl:text-[13px]">
                ยังไม่มีใบเสนอจ้าง
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {offers.map((offer) => (
                  <li
                    key={offer.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-slate-900">
                        {money(offer.offeredSalary)} บาท · เริ่มงาน{" "}
                        {formatThaiDate(offer.startDate)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 3xl:text-[12px]">
                        ทดลองงาน {offer.probationDays} วัน
                        {offer.expiresAt
                          ? ` · หมดอายุ ${formatThaiDate(offer.expiresAt)}`
                          : ""}
                      </p>
                      {offer.respondedAt ? (
                        <p className="mt-0.5 text-[11px] text-slate-400 3xl:text-[12px]">
                          บันทึกคำตอบเมื่อ{" "}
                          {formatThaiDateTime(offer.respondedAt)}
                          {offer.respondedBy?.displayName
                            ? ` โดย ${offer.respondedBy.displayName}`
                            : ""}
                        </p>
                      ) : null}
                    </div>

                    <Badge tone={offerStatusTone(offer.status)}>
                      {offerStatusText[offer.status]}
                    </Badge>

                    {item.stage === "OFFER" ? (
                      <div className="flex flex-wrap gap-1.5">
                        {offer.status === "DRAFT" ? (
                          <Button
                            size="sm"
                            disabled={saving}
                            onClick={() => onOfferStatus(offer.id, "SENT")}
                          >
                            ส่งให้ผู้สมัคร
                          </Button>
                        ) : null}
                        {offer.status === "SENT" ? (
                          <>
                            <Button
                              size="sm"
                              disabled={saving}
                              onClick={() => onOfferStatus(offer.id, "ACCEPTED")}
                            >
                              บันทึกว่าตอบรับ
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={saving}
                              onClick={() => onOfferStatus(offer.id, "DECLINED")}
                            >
                              บันทึกว่าปฏิเสธ
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {item.stage === "OFFER" && !acceptedOffer ? (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <TextInput
                  type="number"
                  min={0}
                  value={offerDraft.offeredSalary}
                  onChange={(event) =>
                    setOfferDraft((prev) => ({
                      ...prev,
                      offeredSalary: event.target.value,
                    }))
                  }
                  placeholder="เงินเดือนที่เสนอ"
                  className="w-40"
                />
                <div className="w-44">
                  <ThaiDateInput
                    value={offerDraft.startDate}
                    onChange={(event) =>
                      setOfferDraft((prev) => ({
                        ...prev,
                        startDate: event.target.value,
                      }))
                    }
                    aria-label="วันเริ่มงาน"
                  />
                </div>
                <div className="relative w-36">
                  <TextInput
                    type="number"
                    min={0}
                    max={365}
                    value={offerDraft.probationDays}
                    onChange={(event) =>
                      setOfferDraft((prev) => ({
                        ...prev,
                        probationDays: Number(event.target.value) || 0,
                      }))
                    }
                    className="pr-16"
                    aria-label="จำนวนวันทดลองงาน"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-slate-400">
                    วันทดลอง
                  </span>
                </div>
                <Button
                  icon={<Plus className="h-3.5 w-3.5" />}
                  disabled={saving || !offerDraft.offeredSalary}
                  onClick={() =>
                    onCreateOffer({
                      offeredSalary: Number(offerDraft.offeredSalary),
                      startDate: offerDraft.startDate,
                      probationDays: offerDraft.probationDays,
                    })
                  }
                >
                  ออกใบเสนอจ้าง
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </StepCard>

      {/* ---------- ขั้น 5: จ้างเป็นพนักงาน ---------- */}
      <StepCard
        index={4}
        isLast
        title={APPLICATION_STEPS[4].title}
        hint={APPLICATION_STEPS[4].hint}
        state={stepState(4)}
      >
        {item.hiredEmployee ? (
          <Notice tone="positive" icon={<CheckCircle2 className="h-4 w-4" />}>
            <p className="font-bold">
              จ้างเป็นพนักงานแล้ว · {item.hiredEmployee.employeeCode}
            </p>
            <p className="mt-0.5">
              ติดตามต่อได้ที่แท็บ &quot;พนักงานใหม่&quot; ด้านบน
            </p>
          </Notice>
        ) : stepState(4) === "upcoming" ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={saving || !acceptedOffer}
              title={
                acceptedOffer ? undefined : "ต้องมีใบเสนอจ้างที่ผู้สมัครตอบรับแล้ว"
              }
              onClick={onHire}
            >
              จ้างเป็นพนักงาน
            </Button>
            {!acceptedOffer ? (
              <span className="text-[12px] text-slate-400 3xl:text-[13px]">
                รอผู้สมัครตอบรับใบเสนอจ้างก่อน
              </span>
            ) : null}
          </div>
        )}
      </StepCard>

      {closed ? null : (
        <p className="px-1 text-[12px] text-slate-400 3xl:text-[13px]">
          ขั้นถัดไปจะเปิดให้ทำเมื่อขั้นปัจจุบันเสร็จแล้ว
        </p>
      )}
    </div>
  );
}

/** ข้อมูลผู้สมัครทั้งหมดที่เก็บไว้ — เดิมโชว์แค่อีเมล เบอร์ และเงินเดือนที่ขอ */
function ApplicantProfile({ item }: { item: JobApplication }) {
  /*
   * แบ่งเป็นกลุ่มตามเรื่อง ไม่ใช่ยิงรวด 16 ช่อง — ส่วนใหญ่เป็นขีดว่าง
   * ถ้าไม่แบ่งกลุ่มจะกลายเป็นกำแพงขีดที่หาข้อมูลจริงไม่เจอ
   */
  const groups: Array<{ title: string; rows: Array<{ label: string; value: string }> }> = [
    {
      title: "ติดต่อและข้อมูลส่วนตัว",
      rows: [
        { label: "อีเมล", value: item.email || "" },
        { label: "เบอร์โทร", value: item.phone || "" },
        { label: "เลขบัตรประชาชน", value: item.nationalId || "" },
        {
          label: "วันเกิด",
          value: item.birthDate ? formatThaiDate(item.birthDate) : "",
        },
        { label: "ที่อยู่", value: item.address || "" },
      ],
    },
    {
      title: "ประวัติการทำงาน",
      rows: [
        { label: "ตำแหน่งปัจจุบัน", value: item.currentPosition || "" },
        { label: "บริษัทปัจจุบัน", value: item.currentCompany || "" },
        {
          label: "เงินเดือนปัจจุบัน",
          value: item.currentSalary ? `${money(item.currentSalary)} บาท` : "",
        },
        {
          label: "ประสบการณ์",
          value:
            item.yearsOfExperience !== null &&
            item.yearsOfExperience !== undefined
              ? `${item.yearsOfExperience} ปี`
              : "",
        },
      ],
    },
    {
      title: "การศึกษา",
      rows: [
        { label: "วุฒิการศึกษา", value: item.educationLevel || "" },
        { label: "สถาบัน", value: item.educationInstitute || "" },
        { label: "สาขา", value: item.educationMajor || "" },
      ],
    },
    {
      title: "เงื่อนไขการเข้าทำงาน",
      rows: [
        {
          label: "เงินเดือนที่ขอ",
          value: item.expectedSalary ? `${money(item.expectedSalary)} บาท` : "",
        },
        {
          label: "เริ่มงานได้",
          value: item.availableFrom ? formatThaiDate(item.availableFrom) : "",
        },
        { label: "ช่องทางที่มา", value: item.source || "" },
        { label: "เรซูเม่", value: item.resumeUrl || "" },
      ],
    },
  ];

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="border-b border-brand-100 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
            {group.title}
          </p>
          <dl className="mt-1.5 grid gap-x-5 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {group.rows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="truncate text-[10.5px] text-slate-400">
                  {row.label}
                </dt>
                <dd className="break-words text-[12.5px] font-medium leading-[18px] text-slate-800 3xl:text-[13px]">
                  {row.label === "เรซูเม่" && item.resumeUrl ? (
                    <a
                      href={item.resumeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="font-semibold text-brand-700 underline-offset-2 hover:underline"
                    >
                      เปิดลิงก์
                    </a>
                  ) : row.value ? (
                    row.value
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {item.note ? (
        <div className="border-t border-brand-100 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
            หมายเหตุ
          </p>
          <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-5 text-slate-600 3xl:text-[13px]">
            {item.note}
          </p>
        </div>
      ) : null}
    </div>
  );

}
