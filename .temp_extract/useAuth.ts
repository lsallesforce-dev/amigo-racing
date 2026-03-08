import { getLoginUrl } from "@/const";
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
  
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  
  // DEBUG: Log o que tRPC está retornando
  useEffect(() => {
    if (meQuery.data) {
      console.log('[useAuth] tRPC retornou:', meQuery.data);
      console.log('[useAuth] bankAccountDv:', meQuery.data.bankAccountDv);
      console.log('[useAuth] Chaves:', Object.keys(meQuery.data));
    }
  }, [meQuery.data]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      // Marcar que fez logout
      localStorage.setItem('logout-flag', 'true');
      hasLoggedOutRef.current = true;
      
      // Chamar a mutação de logout e aguardar
      try {
        await logoutMutation.mutateAsync();
      } catch (mutationError: unknown) {
        if (
          mutationError instanceof TRPCClientError &&
          mutationError.data?.code === "UNAUTHORIZED"
        ) {
          // Erro UNAUTHORIZED esperado
        }
      }
    } catch (error: unknown) {
      // Erro ao fazer logout
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
        
        // Aguardar um pouco antes de redirecionar para garantir que tudo foi limpo
        setTimeout(() => {
          // Adicionar cache busting com parâmetro logout=true
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
  
  // Verificar se o usuário atual mudou (logout + novo login)
  useEffect(() => {
    if (meQuery.data) {
      const storedUser = localStorage.getItem('manus-runtime-user-info');
      if (storedUser) {
        try {
          const previousUser = JSON.parse(storedUser);
          if (previousUser && previousUser.id !== meQuery.data.id) {
            utils.invalidate();
          }
        } catch (e) {
          // Erro ao parsear usuario anterior
        }
      }
    }
  }, [meQuery.data, utils]);

  // DEBUG: Log meQuery.data antes do useMemo
  if (meQuery.data) {
    console.log('[useAuth] meQuery.data ANTES do useMemo:', meQuery.data);
    console.log('[useAuth] meQuery.data.bankAccountDv:', meQuery.data.bankAccountDv);
    console.log('[useAuth] Chaves de meQuery.data:', Object.keys(meQuery.data));
  }

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
