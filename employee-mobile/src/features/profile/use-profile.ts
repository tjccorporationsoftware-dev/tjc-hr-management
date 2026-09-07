import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/features/auth/auth.store';
import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

import {
  deleteMyAvatar,
  fetchMyProfile,
  updateMyProfile,
} from './profile.api';
import { prepareProfileAvatar, uploadProfileAvatar } from './profile-avatar';
import type { MobileProfile, UpdateMyProfileInput } from './profile.types';

const retryServerErrorsOnly = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status && error.status < 500) return false;
  return failureCount < 2;
};

function syncAuthUser(profile: MobileProfile) {
  useAuthStore.getState().updateUser({
    avatarUrl: profile.user.avatarUrl,
    displayName: profile.user.displayName,
  });
}

export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: fetchMyProfile,
    retry: retryServerErrorsOnly,
    staleTime: 60_000,
  });
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMyProfileInput) => updateMyProfile(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      syncAuthUser(profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
    },
  });
}

export function useUploadMyAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uri: string) => uploadProfileAvatar(await prepareProfileAvatar(uri)),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      syncAuthUser(profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
    },
  });
}

export function useDeleteMyAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMyAvatar,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      syncAuthUser(profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
    },
  });
}
