"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  applyOnboardingChecklist,
  cancelOnboardingTask,
  completeOnboardingTask,
  createOnboardingTask,
  getOnboardingChecklists,
  getOnboardingTasks,
  startOnboardingTask,
} from "@/lib/api";
import type {
  OnboardingChecklist,
  OnboardingProgressItem,
  OnboardingTask,
} from "@/types/onboarding";

import {
  Badge,
  Button,
  IconButton,
  Modal,
  Notice,
  Select,
  TextInput,
  type Tone,
} from "@/components/kit";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { formatThaiDate } from "@/lib/date-format";

/**
 * งานต้อนรับของพนักงานหนึ่งคน
 * --------------------------
 * กางเช็กลิสต์ทั้งชุดมาเป็นงานได้ในคลิกเดียว หรือเพิ่มงานเดี่ยวก็ได้
 * แล้วไล่ติ๊กว่าทำอะไรไปแล้วบ้าง
 */

const TASK_STATUS_TEXT: Record<string, string> = {
  PENDING: "รอเริ่ม",
  IN_PROGRESS: "กำลังทำ",
  COMPLETED: "เสร็จแล้ว",
  CANCELLED: "ยกเลิก",
  OVERDUE: "เลยกำหนด",
};

function taskTone(status: string): Tone {
  if (status === "COMPLETED") return "positive";
  if (status === "CANCELLED") return "neutral";
  if (status === "OVERDUE") return "critical";
  if (status === "IN_PROGRESS") return "brand";
  return "warning";
}

function personName(employee: OnboardingProgressItem["employee"]) {
  return (
    employee.displayName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    employee.employeeCode
  );
}

export function WelcomeTaskDetailModal({
  item,
  onClose,
  onChanged,
}: {
  item: OnboardingProgressItem;
  onClose: () => void;
  /** ให้ตารางข้างหลังโหลดใหม่ ตัวเลข x/y จะได้ขยับตาม */
  onChanged: () => void;
}) {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [checklists, setChecklists] = useState<OnboardingChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // กางเช็กลิสต์
  const [checklistId, setChecklistId] = useState("");
  const [checklistDueDate, setChecklistDueDate] = useState("");

  // เพิ่มงานเดี่ยว
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const employeeId = item.employee.id;
  const companyId = item.employee.company?.id ?? "";

  async function load() {
    setLoading(true);
    setErrorMessage("");

    try {
      const [taskResponse, checklistResponse] = await Promise.all([
        getOnboardingTasks({ employeeId, pageSize: 100 }),
        getOnboardingChecklists({ pageSize: 100, status: "ACTIVE" }).catch(
          () => null,
        ),
      ]);

      setTasks(taskResponse.items);
      setChecklists(checklistResponse?.items ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดงานต้อนรับไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function run(id: string, action: () => Promise<unknown>, label: string) {
    setBusyId(id);

    try {
      await action();
      toast.success(label);
      await load();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  const doneCount = tasks.filter((task) => task.status === "COMPLETED").length;

  return (
    <Modal
      open
      title={personName(item.employee)}
      description={`${[item.employee.employeeCode, item.employee.position].filter(Boolean).join(" · ")} · งานต้อนรับ`}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      }
      onClose={onClose}
    >
      {errorMessage ? (
        <div className="pb-3">
          <Notice tone="critical">{errorMessage}</Notice>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังโหลด…
        </div>
      ) : (
        <div className="space-y-3">
          {/*
            กางเช็กลิสต์ทั้งชุดในคลิกเดียว — เดิมต้องสร้างงานทีละรายการ
            เช็กลิสต์สิบข้อคือกดสิบครั้ง
          */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <Select
              value={checklistId}
              onChange={(event) => setChecklistId(event.target.value)}
              className="min-w-0 flex-1 bg-white"
              aria-label="เลือกเช็กลิสต์ที่จะกาง"
            >
              <option value="">เลือกเช็กลิสต์ต้อนรับ</option>
              {checklists.map((checklist) => (
                <option key={checklist.id} value={checklist.id}>
                  {checklist.code} · {checklist.name}
                </option>
              ))}
            </Select>

            <div className="w-40">
              <ThaiDateInput
                value={checklistDueDate}
                onChange={(event) => setChecklistDueDate(event.target.value)}
                placeholder="กำหนดเสร็จ"
                className="bg-white"
                aria-label="วันครบกำหนดของงานที่กาง"
              />
            </div>

            <Button
              variant="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              disabled={busyId === "apply" || !checklistId}
              onClick={() =>
                void run(
                  "apply",
                  async () => {
                    const result = await applyOnboardingChecklist(checklistId, {
                      employeeId,
                      dueDate: checklistDueDate || undefined,
                    });

                    if (result.created === 0) {
                      throw new Error(
                        "งานทุกข้อของเช็กลิสต์นี้ถูกเพิ่มให้คนนี้ไปแล้ว",
                      );
                    }
                  },
                  "กางเช็กลิสต์เป็นงานแล้ว",
                )
              }
            >
              กางเช็กลิสต์
            </Button>
          </div>

          {/* เพิ่มงานเดี่ยว สำหรับงานที่ไม่ได้อยู่ในเช็กลิสต์มาตรฐาน */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
            <TextInput
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="เพิ่มงานเดี่ยว เช่น พาแนะนำทีม"
              className="min-w-0 flex-1"
              aria-label="ชื่องานต้อนรับ"
            />
            <Button
              icon={<Plus className="h-3.5 w-3.5" />}
              disabled={busyId === "new-task" || !newTaskTitle.trim()}
              onClick={() =>
                void run(
                  "new-task",
                  async () => {
                    await createOnboardingTask({
                      companyId,
                      employeeId,
                      title: newTaskTitle.trim(),
                    });
                    setNewTaskTitle("");
                  },
                  "เพิ่มงานแล้ว",
                )
              }
            >
              เพิ่มงาน
            </Button>
          </div>

          {tasks.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-slate-400">
              ยังไม่มีงานต้อนรับ — เลือกเช็กลิสต์แล้วกดกาง หรือเพิ่มงานเดี่ยว
            </p>
          ) : (
            <>
              <p className="px-1 text-[12px] text-slate-500 3xl:text-[13px]">
                เสร็จแล้ว {doneCount} จาก {tasks.length} งาน
              </p>

              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {tasks.map((task) => {
                  const busy = busyId === task.id;
                  const closed =
                    task.status === "COMPLETED" || task.status === "CANCELLED";

                  return (
                    <li
                      key={task.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-900">
                          {task.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
                          {[
                            task.category,
                            task.dueDate
                              ? `กำหนด ${formatThaiDate(task.dueDate)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "ไม่มีกำหนดส่ง"}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {!closed ? (
                          <>
                            {task.status === "PENDING" ? (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    task.id,
                                    () => startOnboardingTask(task.id),
                                    "เริ่มงานแล้ว",
                                  )
                                }
                              >
                                เริ่มทำ
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  task.id,
                                  () => completeOnboardingTask(task.id),
                                  "บันทึกว่าเสร็จแล้ว",
                                )
                              }
                            >
                              เสร็จแล้ว
                            </Button>
                          </>
                        ) : null}
                      </div>

                      {/* ป้ายกับปุ่มยกเลิกใช้ความกว้างตายตัว ทุกแถวจะได้เรียงตรงกัน */}
                      <div className="flex w-24 shrink-0 justify-end 3xl:w-28">
                        <Badge tone={taskTone(task.status)}>
                          {TASK_STATUS_TEXT[task.status] ?? task.status}
                        </Badge>
                      </div>

                      <div className="flex w-8 shrink-0 justify-end 3xl:w-9">
                        {!closed ? (
                          <IconButton
                            title="ยกเลิกงานนี้"
                            tone="danger"
                            icon={<Trash2 className="h-4 w-4" />}
                            disabled={busy}
                            onClick={() =>
                              void run(
                                task.id,
                                () => cancelOnboardingTask(task.id),
                                "ยกเลิกงานแล้ว",
                              )
                            }
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
