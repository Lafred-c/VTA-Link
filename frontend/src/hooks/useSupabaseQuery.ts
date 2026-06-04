import { useEffect } from 'react';
import {
  useQuery as useTanStackQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { supabase } from '@/config/supabaseClient';

export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: any[] = [],
  realtimeTables: string[] = [],
  initialData: T | null = null,
) {
  const queryClient = useQueryClient();
  const queryKey: QueryKey = (deps.length > 0 && typeof deps[0] === 'string')
    ? deps
    : ['operix-query', ...deps, fetcher.toString().slice(0, 50)];

  const { data, isLoading, error, refetch } = useTanStackQuery({
    queryKey,
    queryFn: fetcher,
    initialData: initialData ?? undefined,
  });

  useEffect(() => {
    if (!realtimeTables || realtimeTables.length === 0) return;
    const baseKey = typeof queryKey[0] === 'string' ? queryKey[0] : 'query';
    const channelName = `realtime_${baseKey}_${realtimeTables.join('_')}_${JSON.stringify(deps).slice(0, 20)}`;
    let channel = supabase.channel(channelName);
    realtimeTables.forEach(table => {
      channel = channel.on('postgres_changes' as any, { event: '*', schema: 'public', table }, () => {
        queryClient.invalidateQueries({ queryKey });
      });
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [realtimeTables?.join('_'), JSON.stringify(deps)]);

  return {
    data: data as T | null,
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: () => refetch()
  };
}

export async function safe(fn: () => Promise<any>): Promise<{ success: boolean; error: string | null }> {
  try { await fn(); return { success: true, error: null }; }
  catch (err: any) { return { success: false, error: err.message || 'Operation failed' }; }
}
