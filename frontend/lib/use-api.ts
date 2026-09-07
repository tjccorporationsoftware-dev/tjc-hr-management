"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "./api";

/**
 * ตัวห่อบาง ๆ ของ react-query ให้ทุกหน้าเรียกเหมือนกัน
 * ---------------------------------------------------
 * จุดประสงค์คือให้หน้าเว็บเขียนสั้นและได้พฤติกรรมเดียวกันทั้งระบบ:
 *   - error เป็น ApiClientError เสมอ อ่าน .message ได้ตรง ๆ
 *   - mutation สำเร็จแล้ว invalidate key ที่เกี่ยวข้องให้อัตโนมัติ
 *   - ขึ้น toast ให้เอง เว้นแต่หน้าจะจัดการเอง
 */

export function getErrorMessage(error: unknown, fallback = "เกิดข้อผิดพลาด") {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function useApiQuery<TData>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options?: Omit<
    UseQueryOptions<TData, ApiClientError, TData, QueryKey>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery<TData, ApiClientError, TData, QueryKey>({
    queryKey,
    queryFn,
    ...options,
  });
}

type ApiMutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiClientError, TVariables>,
  "mutationFn"
> & {
  /** key ที่ต้องล้างหลังทำสำเร็จ ใส่ระดับ .all ได้เพื่อล้างทั้งโดเมน */
  invalidates?: QueryKey[];
  /** ข้อความ toast ตอนสำเร็จ ไม่ใส่ = ไม่ขึ้น */
  successMessage?: string;
  /** ตั้ง false ถ้าหน้าอยากจัดการ error เอง */
  showErrorToast?: boolean;
};

export function useApiMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  {
    invalidates,
    successMessage,
    showErrorToast = true,
    onSuccess,
    onError,
    ...options
  }: ApiMutationOptions<TData, TVariables> = {},
) {
  const queryClient = useQueryClient();

  return useMutation<TData, ApiClientError, TVariables>({
    mutationFn,
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (invalidates?.length) {
        await Promise.all(
          invalidates.map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        );
      }

      if (successMessage) {
        toast.success(successMessage);
      }

      await onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: async (error, variables, onMutateResult, context) => {
      if (showErrorToast) {
        toast.error(getErrorMessage(error));
      }

      await onError?.(error, variables, onMutateResult, context);
    },
    ...options,
  });
}
