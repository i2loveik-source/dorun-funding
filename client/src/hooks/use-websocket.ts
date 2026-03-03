import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChannelMessage } from "@shared/schema";

type Message = ChannelMessage & { readCount: number; readBy: string[] };

export function useChatWebSocket(activeChannel: number | null) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout>();
  const prevChannel = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (activeChannel) {
        ws.send(JSON.stringify({ type: "subscribe", channelId: activeChannel }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const channelId = data.message?.channelId || data.channelId || activeChannel;
        
        if (data.type === "new_message") {
          // 새 메시지를 캐시에 추가 (중복 방지)
          queryClient.setQueryData(["/api/channels", channelId, "messages"], (old: any) => {
            if (!old?.pages) return old;
            const allMsgs = old.pages.flat();
            if (allMsgs.some((m: Message) => m.id === data.message.id)) return old; // 이미 있음
            // optimistic msg와 매칭 (같은 content + 최근 1초 이내)
            const lastPage = old.pages[old.pages.length - 1] || [];
            const hasOptimistic = lastPage.some((m: Message) => m.id < 0 && m.content === data.message.content);
            if (hasOptimistic) {
              // optimistic을 서버 메시지로 교체
              const newPages = old.pages.map((page: Message[]) =>
                page.map((m: Message) => (m.id < 0 && m.content === data.message.content) ? data.message : m)
              );
              return { ...old, pages: newPages };
            }
            // 새 메시지 추가
            const newPages = [...old.pages];
            newPages[newPages.length - 1] = [...(newPages[newPages.length - 1] || []), data.message];
            return { ...old, pages: newPages };
          });
          // 채널 목록도 갱신 (최신 메시지 표시)
          queryClient.invalidateQueries({ queryKey: ["/api/channels-with-pins"] });
        }
        
        if (data.type === "reaction_update") {
          queryClient.setQueryData(["/api/channels", channelId, "messages"], (old: any) => {
            if (!old?.pages) return old;
            return {
              ...old,
              pages: old.pages.map((page: Message[]) =>
                page.map((m: Message) => m.id === data.messageId ? { ...m, reactions: data.reactions } : m)
              )
            };
          });
        }
        
        if (data.type === "message_deleted") {
          queryClient.setQueryData(["/api/channels", channelId, "messages"], (old: any) => {
            if (!old?.pages) return old;
            return {
              ...old,
              pages: old.pages.map((page: Message[]) =>
                page.filter((m: Message) => m.id !== data.messageId)
              )
            };
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      // 3초 후 재연결
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, [activeChannel, queryClient]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // 채널 변경 시 구독 전환
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    if (prevChannel.current) {
      ws.send(JSON.stringify({ type: "unsubscribe", channelId: prevChannel.current }));
    }
    if (activeChannel) {
      ws.send(JSON.stringify({ type: "subscribe", channelId: activeChannel }));
    }
    prevChannel.current = activeChannel;
  }, [activeChannel]);
}
