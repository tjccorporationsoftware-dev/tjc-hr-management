"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { ApiClientError, apiFetch } from "@/lib/api";
import { getDefaultDashboardPath } from "@/lib/default-dashboard";
import {
  AUTH_FORCE_LOGOUT_EVENT,
  AUTH_FORCE_LOGOUT_STORAGE_KEY,
  clearAccessToken,
  forceLogoutClient,
  getAccessToken,
  setAccessToken,
} from "@/lib/auth-token";
import type {
  AuthUser,
  LoginResponse,
  LoginTwoFactorRequiredResponse,
  VerifyTwoFactorResponse,
} from "@/types/auth";

type LoginInput = {
  email: string;
  password: string;
};

type VerifyTwoFactorInput = {
  twoFactorToken: string;
  code: string;
};

type LoginResult =
  | {
      requiresTwoFactor: false;
      redirectTo: string;
    }
  | LoginTwoFactorRequiredResponse;

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<LoginResult>;
  verifyTwoFactor: (input: VerifyTwoFactorInput) => Promise<{ redirectTo: string }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const SESSION_HEARTBEAT_MS = 30_000;

function normalizedStringList(values?: string[] | null) {
  return [...(values ?? [])].sort().join("|");
}

function authUsersEqual(left: AuthUser | null, right: AuthUser | null) {
  if (left === right) return true;
  if (!left || !right) return false;

  return (
    left.id === right.id &&
    left.email === right.email &&
    left.displayName === right.displayName &&
    (left.phone ?? null) === (right.phone ?? null) &&
    (left.avatarUrl ?? null) === (right.avatarUrl ?? null) &&
    normalizedStringList(left.roles) === normalizedStringList(right.roles) &&
    normalizedStringList(left.permissions) ===
      normalizedStringList(right.permissions) &&
    /*
     * ต้องเทียบด้วย ไม่งั้นหลังเปลี่ยนรหัสผ่านสำเร็จ ค่าที่เหลือเหมือนเดิมหมด
     * ตัวเทียบจะบอกว่า "ไม่เปลี่ยน" แล้วไม่อัปเดต state — ธงบังคับเปลี่ยนรหัส
     * ค้างเป็น true ตลอด แล้วโดนพากลับมาหน้าเปลี่ยนรหัสวนไม่จบ
     */
    Boolean(left.mustChangePassword) === Boolean(right.mustChangePassword) &&
    (left.scope?.level ?? null) === (right.scope?.level ?? null) &&
    (left.scope?.companyId ?? null) === (right.scope?.companyId ?? null) &&
    (left.scope?.branchId ?? null) === (right.scope?.branchId ?? null) &&
    (left.scope?.companyName ?? null) === (right.scope?.companyName ?? null) &&
    (left.scope?.branchName ?? null) === (right.scope?.branchName ?? null)
  );
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setStableUser = useCallback((nextUser: AuthUser | null) => {
    setUser((currentUser) =>
      authUsersEqual(currentUser, nextUser) ? currentUser : nextUser,
    );
  }, []);

  const setSession = useCallback(
    (token: string, authUser: AuthUser) => {
      setAccessToken(token);
      setAccessTokenState(token);
      setStableUser(authUser);
    },
    [setStableUser],
  );

  const clearSession = useCallback(() => {
    clearAccessToken();
    setAccessTokenState(null);
    setUser(null);
  }, []);

  const tryRefresh = useCallback(async () => {
    const result = await apiFetch<VerifyTwoFactorResponse>("/auth/refresh", {
      method: "POST",
      auth: false,
    });

    setSession(result.accessToken, result.user);
  }, [setSession]);

  const refreshMe = useCallback(async () => {
    const currentToken = getAccessToken();

    if (!currentToken) {
      await tryRefresh();
      return;
    }

    setAccessTokenState(currentToken);

    const me = await apiFetch<AuthUser>("/auth/me", {
      method: "GET",
    });

    setStableUser(me);
  }, [setStableUser, tryRefresh]);

  const login = useCallback(
    async (input: LoginInput): Promise<LoginResult> => {
      const result = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify(input),
      });

      if (result.requiresTwoFactor) {
        return result;
      }

      setSession(result.accessToken, result.user);

      return {
        requiresTwoFactor: false,
        redirectTo: getDefaultDashboardPath(result.user),
      };
    },
    [setSession],
  );

  const verifyTwoFactor = useCallback(
    async (input: VerifyTwoFactorInput) => {
      const result = await apiFetch<VerifyTwoFactorResponse>(
        "/auth/2fa/verify",
        {
          method: "POST",
          auth: false,
          body: JSON.stringify(input),
        },
      );

      setSession(result.accessToken, result.user);

      return {
        redirectTo: getDefaultDashboardPath(result.user),
      };
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch<{ loggedOut: boolean }>("/auth/logout", {
        method: "POST",
      });
    } catch {
      // ให้ logout ฝั่งหน้าเว็บได้เสมอ แม้ API มีปัญหา
    } finally {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        await refreshMe();
      } catch {
        if (mounted) {
          clearSession();
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    boot();

    return () => {
      mounted = false;
    };
  }, [clearSession, refreshMe]);

  useEffect(() => {
    function handleForceLogout() {
      clearSession();

      if (window.location.pathname !== "/login") {
        toast.error("Session หมดอายุหรือถูกยกเลิก กรุณาเข้าสู่ระบบใหม่");
        window.location.replace("/login");
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === AUTH_FORCE_LOGOUT_STORAGE_KEY && event.newValue) {
        handleForceLogout();
      }
    }

    window.addEventListener(AUTH_FORCE_LOGOUT_EVENT, handleForceLogout);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(AUTH_FORCE_LOGOUT_EVENT, handleForceLogout);
      window.removeEventListener("storage", handleStorage);
    };
  }, [clearSession]);

  useEffect(() => {
    if (!user || !accessToken) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        await refreshMe();
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          forceLogoutClient("SESSION_EXPIRED");
        }
      }
    }, SESSION_HEARTBEAT_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [accessToken, refreshMe, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      isAuthenticated: Boolean(user && accessToken),
      login,
      verifyTwoFactor,
      logout,
      refreshMe,
    }),
    [
      user,
      accessToken,
      isLoading,
      login,
      verifyTwoFactor,
      logout,
      refreshMe,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}