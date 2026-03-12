import { getLoginUrl } from "@/api/_server/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useRef } from "react";
type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const utils = trpc.useUtils();

  // Usar useMemo para estabilizar redirectPath e evitar loop infinito
  const redirectPath = useMemo(() => {
    return options?.redirectPath || getLoginUrl();
  }, [options?.redirectPath]);

  const redirectOnUnauthenticated = options?.redirectOnUnauthenticated ?? false;

  // Verificar se o usuario fez logout recentemente
  const hasLoggedOutRef = useRef(false);

  const storedUserStr = typeof window !== "undefined" ? localStorage.getItem("manus-runtime-user-info") : null;
  const initialData = storedUserStr ? JSON.parse(storedUserStr) : undefined;

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    initialData,
    enabled: typeof window !== 'undefined' ? localStorage.getItem('logout-flag') !== 'true' : true
  });

  // Sync user info to localStorage for instant hydration on F5
  useEffect(() => {
    if (meQuery.data) {
      if (typeof window !== "undefined") {
        localStorage.setItem("manus-runtime-user-info", JSON.stringify(meQuery.data));
      }
    }
  }, [meQuery.data]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      console.log("[useAuth] Inicando logout agressivo...");

      // Marcar que fez logout e limpar tokens IMEDIATAMENTE
      if (typeof window !== 'undefined') {
        localStorage.setItem('logout-flag', 'true');
        localStorage.removeItem("app_session_id");
        localStorage.removeItem("manus-runtime-user-info");
        // Nota: localStorage.clear() serÃ¡ chamado no finally
      }

      hasLoggedOutRef.current = true;
      utils.auth.me.setData(undefined, null);

      // Chamar a mutaÃ§Ã£o de logout e aguardar
      try {
        await logoutMutation.mutateAsync();
      } catch (mutationError: unknown) {
        console.warn("[useAuth] Erro na mutaÃ§Ã£o de logout (esperado se jÃ¡ deslogado):", mutationError);
      }
    } catch (error: unknown) {
      console.error("[useAuth] Erro catastrÃ³fico no logout:", error);
    } finally {
      // Limpar todo o cache do tRPC
      utils.auth.me.setData(undefined, null);
      await utils.invalidate();

      // Limpar localStorage completamente
      if (typeof window !== 'undefined') {
        // Limpar TUDO do localStorage
        localStorage.clear();

        // Limpar sessionStorage
        sessionStorage.clear();

        // Limpar localStorage completamente
        localStorage.clear();

        // Limpar cookies (via document.cookie)
        const cookies = document.cookie.split(';');
        cookies.forEach((c) => {
          const eqPos = c.indexOf('=');
          const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
          // Tentar deletar com diferentes domains
          document.cookie = name + '=;expires=' + new Date().toUTCString() + ';path=/';
          document.cookie = name + '=;expires=' + new Date().toUTCString() + ';path=/;domain=.amigoracing.com.br';
          document.cookie = name + '=;expires=' + new Date().toUTCString() + ';path=/;domain=' + window.location.hostname;
        });

        // Garantir que o cookie antigo tambÃ©m seja limpo se existir
        document.cookie = 'app_session_id=;expires=' + new Date(0).toUTCString() + ';path=/';

        // Aguardar um pouco antes de redirecionar para garantir que tudo foi limpo
        setTimeout(() => {
          // Adicionar cache busting com parÃ¢metro logout=true
          const logoutUrl = redirectPath.includes('?')
            ? `${redirectPath}&logout=true&t=${Date.now()}`
            : `${redirectPath}?logout=true&t=${Date.now()}`;
          window.location.replace(logoutUrl);
        }, 300);
      }
    }
  }, [logoutMutation, utils, redirectPath]);

  // Limpar flag de logout quando usuario faz login novamente
  useEffect(() => {
    const logoutFlag = localStorage.getItem('logout-flag') === 'true';
    if (logoutFlag && meQuery.data) {
      localStorage.removeItem('logout-flag');
      hasLoggedOutRef.current = false;
      // Limpar cache do tRPC quando novo usuario faz login
      utils.invalidate();
    } else if (logoutFlag && !meQuery.data) {
      hasLoggedOutRef.current = true;
    }
  }, [meQuery.data, utils]);

  // Verificar se o usuÃ¡rio atual mudou (logout + novo login)
  useEffect(() => {
    if (meQuery.data) {
      const storedUser = localStorage.getItem('manus-runtime-user-info');
      if (storedUser) {
        try {
          const previousUser = JSON.parse(storedUser) as any;
          if (previousUser && previousUser.id !== (meQuery.data as any).id) {
            utils.invalidate();
          }
        } catch (e) {
          // Erro ao parsear usuario anterior
        }
      }
    }
  }, [meQuery.data, utils]);

  const state = useMemo(() => {
    if (meQuery.data) {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(meQuery.data)
      );
    }
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
    refetchAuth: () => meQuery.refetch(),
  };
}
