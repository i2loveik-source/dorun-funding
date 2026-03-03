import { useAuth } from "@/hooks/use-auth";
import { useChatWebSocket } from "@/hooks/use-websocket";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Reply, Smile, Plus, Hash, Users, 
  Check, Eye, X, MoreVertical, Pin, LogOut, Pencil, UserMinus, Monitor, 
  Star, BellOff, MoreHorizontal, Globe, Trash2, FileIcon, ImageIcon, 
  Menu, SearchIcon, ChevronRight, Share2, Languages, SlidersHorizontal,
  ArrowDownUp, ChevronLeft, ChevronUp, ChevronDown, Paperclip, Upload, Download, ExternalLink,
  Loader2, Crown, Bell, Send, Vote, BarChart3, Calendar, Search, UserPlus, UserRoundCog
} from "lucide-react";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface Channel {
  id: number;
  name: string;
  type: string;
  createdAt: string;
  memberCount?: number;
  isPinned?: boolean;
  isMuted?: boolean;
  unreadCount?: number;
}

interface Message {
  id: number;
  channelId: number;
  senderId: string;
  content: string;
  parentId?: number;
  reactions?: Record<string, string[]>;
  readCount?: number;
  readBy?: string[];
  metadata?: {
    files?: { name: string; url: string; type: string }[];
    translation?: Record<string, string>;
  };
  isRecalled?: boolean;
  createdAt: string;
}

interface ChannelMember {
  id: number;
  channelId: number;
  userId: string;
  role: string;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string | null;
    position: string | null;
    profileImageUrl: string | null;
    isDesktopOnline: boolean;
  };
}

const EMOJI_LIST = ['👌', '✅', '🎉', '😊', '😢', '🙏', '❤️', '👏'];

interface ChatProps {
  channelId?: number;
}

function PollCard({ poll, userId, onVote, onClose, onDelete, allUsers }: {
  poll: any; userId: string; onVote: (ids: string[]) => void;
  onClose: () => void; onDelete: () => void; allUsers: any[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(poll.myVotes || []));
  const isCreator = poll.creatorId === userId;
  const isClosed = poll.isClosed;
  const hasVoted = (poll.myVotes || []).length > 0;
  const isAnonymous = poll.isAnonymous;
  const hideResults = poll.hideResults;
  const canDelete = isCreator && (Date.now() - new Date(poll.createdAt).getTime()) < 5 * 60 * 1000;

  const getUserName = (uid: string) => {
    const m = allUsers.find((u: any) => u.userId === uid || u.id === uid);
    return m?.user?.firstName || m?.firstName || uid.slice(0, 6);
  };

  const optionVoteCounts: Record<string, number> = {};
  const optionVoters: Record<string, string[]> = {};
  if (!hideResults) {
    if (isAnonymous && poll.votes?._counts) {
      for (const [oid, cnt] of Object.entries(poll.votes._counts)) {
        optionVoteCounts[oid] = cnt as number;
      }
    } else if (poll.votes && !poll.votes._counts) {
      for (const [uid, oids] of Object.entries(poll.votes)) {
        for (const oid of (oids as string[])) {
          optionVoteCounts[oid] = (optionVoteCounts[oid] || 0) + 1;
          if (!optionVoters[oid]) optionVoters[oid] = [];
          optionVoters[oid].push(uid);
        }
      }
    }
  }
  const totalVoters = poll.totalVoters || 0;

  const toggleOption = (oid: string) => {
    if (isClosed) return;
    const next = new Set(selected);
    if (next.has(oid)) { next.delete(oid); } else {
      if (!poll.isMultipleChoice) next.clear();
      next.add(oid);
    }
    setSelected(next);
  };

  const deadlineStr = poll.deadline
    ? new Date(poll.deadline).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const showResults = (hasVoted || totalVoters > 0) && !hideResults;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-3 border border-blue-200 shadow-sm max-w-sm mx-auto">
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📊</span>
          <h4 className="font-black text-xs text-slate-900">{poll.title}</h4>
          {isClosed && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[9px] font-bold rounded-full">마감</span>}
        </div>
        {isCreator && !isClosed && (
          <div className="flex gap-0.5">
            <button onClick={onClose} className="text-[9px] text-orange-600 font-bold px-1.5 py-0.5 bg-orange-50 rounded-lg hover:bg-orange-100">마감</button>
            {canDelete && <button onClick={onDelete} className="text-[9px] text-red-500 font-bold px-1.5 py-0.5 bg-red-50 rounded-lg hover:bg-red-100">삭제</button>}
          </div>
        )}
      </div>
      {poll.description && <p className="text-[10px] text-slate-500 mb-1">{poll.description}</p>}
      <div className="flex gap-2 mb-2 text-[9px] text-slate-400">
        {poll.isMultipleChoice && <span>✅복수</span>}
        {isAnonymous && <span>🕶️익명</span>}
        {poll.showResultsAfterClose && <span>🔒마감후공개</span>}
        {deadlineStr && <span>⏰{deadlineStr}</span>}
        <span>👥{totalVoters}명</span>
      </div>

      <div className="space-y-1">
        {(poll.options as any[]).map((opt: any) => {
          const oid = String(opt.id);
          const count = optionVoteCounts[oid] || 0;
          const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
          const isSelected = selected.has(oid);
          const wasVoted = (poll.myVotes || []).includes(oid);
          return (
            <div key={oid}>
              <button
                onClick={() => toggleOption(oid)}
                disabled={isClosed}
                className={`w-full text-left rounded-lg p-2 text-[11px] font-bold transition-all relative overflow-hidden ${
                  isSelected ? 'bg-blue-500 text-white ring-2 ring-blue-400' : 'bg-white hover:bg-blue-50 text-slate-700 border border-slate-200'
                } ${isClosed ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {showResults && (
                  <div className={`absolute inset-y-0 left-0 transition-all ${isSelected ? 'bg-blue-600/30' : 'bg-blue-100'}`} style={{ width: `${pct}%` }} />
                )}
                <div className="relative flex items-center justify-between">
                  <span>{poll.pollType === "date" && opt.date ? new Date(opt.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" }) : opt.label}</span>
                  <span className="flex items-center gap-1">
                    {showResults && <span className={`text-[10px] ${isSelected ? 'text-white' : 'text-slate-400'}`}>{count}({pct}%)</span>}
                    {wasVoted && <span>✓</span>}
                  </span>
                </div>
              </button>
              {!isAnonymous && showResults && optionVoters[oid]?.length > 0 && (
                <div className="flex gap-1 mt-0.5 ml-2 flex-wrap">
                  {optionVoters[oid].map(uid => (
                    <span key={uid} className="text-[8px] text-slate-400">{getUserName(uid)}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hideResults && hasVoted && (
        <p className="text-[9px] text-center text-slate-400 mt-2">🔒 결과는 마감 후 공개됩니다</p>
      )}

      {!isClosed && (
        <button
          onClick={() => onVote(Array.from(selected))}
          disabled={selected.size === 0}
          className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-black bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {hasVoted ? "다시 투표" : "투표하기"}
        </button>
      )}
    </div>
  );
}

function FileBrowserContent({ channelId }: { channelId: number | null }) {
  const { data: files = [], isLoading } = useQuery({
    queryKey: ["/api/channels", channelId, "files"],
    queryFn: async () => {
      const res = await fetch(`/api/channels/${channelId}/files`, { credentials: "include" });
      return res.json();
    },
    enabled: !!channelId,
  });

  if (isLoading) return <div className="text-center py-8 text-slate-400">로딩 중...</div>;
  if (files.length === 0) return <div className="text-center py-8 text-slate-400">공유된 파일이 없습니다.</div>;

  return (
    <div className="max-h-[400px] overflow-y-auto space-y-2">
      {files.map((f: any, i: number) => {
        const isImage = f.type?.startsWith("image/");
        return (
          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100">
            {isImage ? (
              <img src={f.url} alt={f.name} className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg">📄</div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{f.name}</p>
              {f.createdAt && <p className="text-[10px] text-slate-400">{new Date(f.createdAt).toLocaleDateString()}</p>}
            </div>
          </a>
        );
      })}
    </div>
  );
}

export default function Chat({ channelId }: ChatProps) {
  const { user } = useAuth();
  useHeartbeat(); 
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isMobile = window.innerWidth < 768;
  
  // Directly use the channelId from props to determine active channel
  const activeChannel = channelId ? Number(channelId) : null;
  
  // WebSocket 실시간 연결
  useChatWebSocket(activeChannel);

  const [messageInput, setMessageInput] = useState("");
  // ... existing state
  
  // Notification monitoring
  const { data: notifications } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 5000,
  });

  const lastNotifId = useRef<number>(0);

  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const latest = notifications[0];
      if (latest.id > lastNotifId.current) {
        if (lastNotifId.current !== 0) { // Don't notify on first load
          if (!("Notification" in window)) return;
          if (Notification.permission === "granted") {
            new Notification(latest.title, { body: latest.content, icon: "/favicon.png" });
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
              if (permission === "granted") {
                new Notification(latest.title, { body: latest.content, icon: "/favicon.png" });
              }
            });
          }
        }
        lastNotifId.current = latest.id;
      }
    }
  }, [notifications]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selfChatChannelId, setSelfChatChannelId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true); // 사용자가 맨 아래 근처인지
  const [showScrollDown, setShowScrollDown] = useState(false); // ↓ 버튼 표시
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [selectedMessageForReads, setSelectedMessageForReads] = useState<number | null>(null);
  const [readsDialogOpen, setReadsDialogOpen] = useState(false);
  const [readsData, setReadsData] = useState<string[]>([]);
  const [readsLoading, setReadsLoading] = useState(false);
  const [reactionsDialogOpen, setReactionsDialogOpen] = useState(false);
  const [selectedMessageForReactions, setSelectedMessageForReactions] = useState<number | null>(null);
  const [reactionPopoverOpen, setReactionPopoverOpen] = useState<Record<number, boolean>>({});

  const [showMobileList, setShowMobileList] = useState(!channelId);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [channelSearchQuery, setChannelSearchQuery] = useState("");
  const [renameChannelOpen, setRenameChannelOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const [pollTitle, setPollTitle] = useState("");
  const [pollDescription, setPollDescription] = useState("");
  const [pollType, setPollType] = useState<"text" | "date">("text");
  const [pollOptions, setPollOptions] = useState<{ label: string; date?: string }[]>([{ label: "" }, { label: "" }]);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollAnonymous, setPollAnonymous] = useState(false);
  const [pollDeadline, setPollDeadline] = useState("");
  const [pollShowAfterClose, setPollShowAfterClose] = useState(false);
  const [announcementExpanded, setAnnouncementExpanded] = useState(false);
  
  const [newRoomSearch, setNewRoomSearch] = useState("");
  const [newRoomSelectedIds, setNewRoomSelectedIds] = useState<Set<string>>(new Set());
  const [sidebarTab, setSidebarTab] = useState("chats");
  const [groupSettings, setGroupSettings] = useState<{ id: string; memo?: string }[]>([]);

  // Load group settings from server (학교 단위 설정, 읽기 전용)
  const { data: serverGroupSettings } = useQuery<{ id: string; memo?: string }[]>({
    queryKey: ["/api/settings/chat-groups"],
  });
  useEffect(() => {
    if (serverGroupSettings) {
      setGroupSettings(serverGroupSettings);
    }
  }, [serverGroupSettings]);



  // Handle global event for opening new room modal
  useEffect(() => {
    const handleNewRoom = () => {
      setNewRoomSelectedIds(new Set());
      setNewChannelName("");
      setShowNewChannel(true);
    };
    window.addEventListener('open-new-room-modal', handleNewRoom);
    return () => window.removeEventListener('open-new-room-modal', handleNewRoom);
  }, []);

  // Update localStorage when channel changes
  useEffect(() => {
    if (channelId) {
      localStorage.setItem("activeChannel", String(channelId));
      setShowMobileList(false);
    }
  }, [channelId]);

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels-with-pins"],
  });

  const { data: allChannelMembers } = useQuery<Record<number, ChannelMember[]>>({
    queryKey: ["/api/all-channel-members"],
    queryFn: async () => {
      if (!channels) return {};
      const membersMap: Record<number, ChannelMember[]> = {};
      await Promise.all(
        channels.map(async (channel) => {
          try {
            const res = await apiRequest("GET", `/api/channels/${channel.id}/members`);
            const data = await res.json();
            membersMap[channel.id] = data;
          } catch (err) {
            membersMap[channel.id] = [];
          }
        })
      );
      return membersMap;
    },
    enabled: !!channels && channels.length > 0,
  });

  const filteredChannels = useMemo(() => {
    if (!channels) return [];
    let filtered = channels;
    if (channelSearchQuery.trim()) {
      const q = channelSearchQuery.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(q));
    }
    return filtered.slice().sort((a, b) => {
      // 1. 즐겨찾기(핀) 우선
      const pinDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      // 2. 읽지 않은 메시지가 있는 방 우선
      const unreadDiff = (b.unreadCount || 0) > 0 ? 1 : 0;
      const unreadDiffA = (a.unreadCount || 0) > 0 ? 1 : 0;
      if (unreadDiff !== unreadDiffA) return unreadDiff - unreadDiffA;
      // 3. 최신 순
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [channels, channelSearchQuery]);

  const PAGE_SIZE = 10;
  const { 
    data: messagesData, 
    isLoading: messagesLoading, 
    refetch: refetchMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery<Message[]>({
    queryKey: ["/api/channels", activeChannel, "messages"],
    enabled: !!activeChannel,
    staleTime: 30000,
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam) params.set('before', String(pageParam));
      const res = await fetch(`/api/channels/${activeChannel}/messages?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[0]?.id; // 가장 오래된 메시지의 id
    },
  });
  const messages = messagesData?.pages?.flat() || [];

  const { data: channelMembers } = useQuery<ChannelMember[]>({
    queryKey: ["/api/channels", activeChannel, "members"],
    enabled: !!activeChannel,
    staleTime: 60000,
  });

  const { data: channelPolls = [], refetch: refetchPolls } = useQuery<any[]>({
    queryKey: ["/api/channels", activeChannel, "polls"],
    enabled: !!activeChannel,
  });

  useEffect(() => {
    if (activeChannel) {
      // 투표, 채널 목록은 30초마다 갱신 (메시지는 WebSocket으로 실시간)
      const interval = setInterval(() => {
        refetchPolls();
        queryClient.invalidateQueries({ queryKey: ["/api/channels-with-pins"] });
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [activeChannel, refetchPolls, queryClient]);

  const lastMessageId = useRef<number>(0);

  useEffect(() => {
    if (messages && messages.length > 0) {
      const latest = messages[messages.length - 1];
      if (latest.id > lastMessageId.current) {
        if (lastMessageId.current !== 0 && latest.senderId !== (user?.id || "local-user-id")) {
          // Send notification if window is not focused or user is on another channel
          if (document.hidden || activeChannel !== latest.channelId) {
            if (Notification.permission === "granted") {
              new Notification(getUserName(latest.senderId), { 
                body: latest.content, 
                icon: "/favicon.png",
                tag: `msg-${latest.channelId}` // Group by channel
              });
            }
          }
        }
        lastMessageId.current = latest.id;
      }
    }
  }, [messages, activeChannel, user?.id]);

  const lastSentAt = useRef<number>(0);

  const sendMessage = useMutation({
    mutationFn: async (data: { content: string; parentId?: number; metadata?: any; nonce: string }) => {
      const res = await apiRequest("POST", `/api/channels/${activeChannel}/messages`, data);
      return await res.json();
    },
    onMutate: async (data) => {
      // Optimistic: 즉시 UI에 메시지 표시
      await queryClient.cancelQueries({ queryKey: ["/api/channels", activeChannel, "messages"] });
      const prev = queryClient.getQueryData(["/api/channels", activeChannel, "messages"]);
      const tempId = -Date.now();
      const optimisticMsg: Message = {
        id: tempId,
        channelId: activeChannel!,
        senderId: user?.id || "local-user-id",
        content: data.content,
        parentId: data.parentId,
        reactions: {},
        readCount: 0,
        readBy: [],
        metadata: data.metadata,
        isRecalled: false,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData(["/api/channels", activeChannel, "messages"], (old: any) => {
        if (!old?.pages) return { pages: [[optimisticMsg]], pageParams: [undefined] };
        const newPages = [...old.pages];
        newPages[newPages.length - 1] = [...(newPages[newPages.length - 1] || []), optimisticMsg];
        return { ...old, pages: newPages };
      });
      setMessageInput("");
      setReplyTo(null);
      return { prev, tempId };
    },
    onSuccess: (serverMsg, _data, context) => {
      // 서버 응답으로 optimistic 메시지를 교체
      queryClient.setQueryData(["/api/channels", activeChannel, "messages"], (old: any) => {
        if (!old?.pages) return old;
        if (serverMsg && serverMsg.id && serverMsg.id > 0) {
          return {
            ...old,
            pages: old.pages.map((page: Message[]) =>
              page.map((m: Message) => m.id === context?.tempId ? serverMsg : m)
            )
          };
        }
        return old;
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/channels", activeChannel, "messages"] });
      }, 500);
    },
    onError: (_err, _data, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/channels", activeChannel, "messages"], context.prev);
    },
  });

  const addReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) => {
      return apiRequest("POST", `/api/channels/${activeChannel}/messages/${messageId}/reactions`, { emoji });
    },
    onMutate: async ({ messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/channels", activeChannel, "messages"] });
      const prev = queryClient.getQueryData(["/api/channels", activeChannel, "messages"]);
      const userId = user?.id || "local-user-id";
      queryClient.setQueryData(["/api/channels", activeChannel, "messages"], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: Message[]) =>
            page.map((m: Message) => {
              if (m.id !== messageId) return m;
              const reactions = { ...(m.reactions || {}) };
              const users = [...(reactions[emoji] || [])];
              if (users.includes(userId)) {
                reactions[emoji] = users.filter((id: string) => id !== userId);
              } else {
                reactions[emoji] = [...users, userId];
              }
              return { ...m, reactions };
            })
          )
        };
      });
      return { prev };
    },
    onError: (_err, _data, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/channels", activeChannel, "messages"], context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", activeChannel, "messages"] });
    },
  });

  const createChannel = useMutation({
    mutationFn: async (data: { name: string; memberIds: string[] }) => {
      const res = await apiRequest("POST", "/api/channels", { name: data.name, type: "general" });
      const newChannel = await res.json();
      const finalChannel = Array.isArray(newChannel) ? newChannel[0] : newChannel;
      
      for (const memberId of data.memberIds) {
        if (memberId !== (user?.id || "local-user-id")) {
          await apiRequest("POST", `/api/channels/${finalChannel.id}/invite`, { userId: memberId });
        }
      }
      return finalChannel;
    },
    onSuccess: (finalChannel: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels-with-pins"] });
      setShowNewChannel(false);
      if (finalChannel?.id) setLocation(`/chat/${finalChannel.id}`);
    },
  });

  const inviteUser = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/channels/${activeChannel}/invite`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", activeChannel, "members"] });
      setInviteDialogOpen(false);
    },
  });

  const kickMember = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/channels/${activeChannel}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", activeChannel, "members"] });
    },
  });

  const toggleMute = useMutation({
    mutationFn: async ({ channelId, isMuted }: { channelId: number; isMuted: boolean }) => {
      return apiRequest("PATCH", `/api/channels/${channelId}/mute`, { isMuted });
    },
    onMutate: async ({ channelId, isMuted }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/channels-with-pins"] });
      const prev = queryClient.getQueryData(["/api/channels-with-pins"]);
      queryClient.setQueryData(["/api/channels-with-pins"], (old: any) =>
        old?.map((ch: any) => ch.id === channelId ? { ...ch, isMuted } : ch)
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/channels-with-pins"], context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels-with-pins"] });
    },
  });

  const renameChannelMutation = useMutation({
    mutationFn: async ({ channelId, name }: { channelId: number; name: string }) => {
      return apiRequest("PATCH", `/api/channels/${channelId}/rename`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels-with-pins"] });
      setRenameChannelOpen(false);
      setRenameValue("");
    },
  });

  const createPollMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/channels/${activeChannel}/polls`, data);
    },
    onSuccess: () => {
      refetchPolls();
      setPollDialogOpen(false);
      setPollTitle(""); setPollDescription(""); setPollType("text");
      setPollOptions([{ label: "" }, { label: "" }]);
      setPollMultiple(false); setPollAnonymous(false); setPollDeadline(""); setPollShowAfterClose(false);
    },
  });

  const voteMutation = useMutation({
    mutationFn: async ({ pollId, optionIds }: { pollId: number; optionIds: string[] }) => {
      return apiRequest("POST", `/api/channels/${activeChannel}/polls/${pollId}/vote`, { optionIds });
    },
    onSuccess: () => refetchPolls(),
  });

  const closePollMutation = useMutation({
    mutationFn: async (pollId: number) => {
      return apiRequest("POST", `/api/channels/${activeChannel}/polls/${pollId}/close`, {});
    },
    onSuccess: () => refetchPolls(),
  });

  const deletePollMutation = useMutation({
    mutationFn: async (pollId: number) => {
      return apiRequest("DELETE", `/api/channels/${activeChannel}/polls/${pollId}`, undefined);
    },
    onSuccess: () => refetchPolls(),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      return apiRequest("DELETE", `/api/channels/${activeChannel}/messages/${messageId}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", activeChannel, "messages"] });
    },
  });

  const setAnnouncementMutation = useMutation({
    mutationFn: async (messageId: number | null) => {
      return apiRequest("PATCH", `/api/channels/${activeChannel}/announcement`, { messageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels-with-pins"] });
    },
  });

  const leaveChannel = useMutation({
    mutationFn: async (channelId: number) => {
      return apiRequest("POST", `/api/channels/${channelId}/leave`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels-with-pins"] });
      setLocation("/");
    },
  });

  // 클라이언트 사이드 이미지 압축 (저대역폭 최적화)
  const compressImage = async (file: File, maxWidth = 1200, quality = 0.8): Promise<File> => {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
          'image/jpeg', quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    // 이미지 1MB 이상이면 자동 압축
    if (file.type.startsWith('image/') && file.size > 1024 * 1024) {
      file = await compressImage(file);
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      sendMessage.mutate({ content: "(파일)", metadata: { files: [data] }, nonce: `file-${Date.now()}` });
      setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); isNearBottomRef.current = true; setShowScrollDown(false); }, 100);
    } catch (err) {
      toast({ title: "업로드 실패", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const now = Date.now();
    if (now - lastSentAt.current < 500) return;
    
    if (sendMessage.isPending || !messageInput.trim()) return;

    const content = messageInput.trim();
    const nonce = Math.random().toString(36).substring(2, 15);
    
    lastSentAt.current = now;
    sendMessage.mutate({ 
      content, 
      parentId: replyTo?.id,
      nonce
    });
    // 전송 후 맨 아래로 이동
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      isNearBottomRef.current = true;
      setShowScrollDown(false);
    }, 100);
  };

  // 맨 아래 근처일 때만 자동 스크롤 (지난 메시지 보는 중에는 스크롤 안 함)
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // 원본 메시지로 스크롤 이동
  const scrollToMessage = (messageId: number) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-yellow-100");
      setTimeout(() => el.classList.remove("bg-yellow-100"), 2000);
    }
  };

  // 읽음 정보 조회 (별도 API)
  const openReadsDialog = async (messageId: number) => {
    setSelectedMessageForReads(messageId);
    setReadsDialogOpen(true);
    setReadsLoading(true);
    try {
      const res = await fetch(`/api/channels/${activeChannel}/messages/${messageId}/reads`, { credentials: 'include' });
      const data = await res.json();
      setReadsData(data.readBy || []);
    } catch {
      setReadsData([]);
    }
    setReadsLoading(false);
  };

  // 컨텍스트 메뉴 닫기
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const { data: onlineStatuses } = useQuery<Record<string, { isOnline: boolean; lastActive: string | null }>>({
    queryKey: ["/api/users/online"],
    refetchInterval: 10000,
  });

  const usersByDepartment = useMemo(() => {
    if (!allUsers) return {};
    const grouped: Record<string, User[]> = {};
    
    // 1. handle fixed "My Group" only
    const myGroupUserIds = new Set(groupSettings.map(gs => gs.id));
    const myGroupUsers = allUsers.filter(u => myGroupUserIds.has(u.id));
    
    // Sort myGroupUsers based on the order in groupSettings
    const sortedMyGroup = [...myGroupUsers].sort((a, b) => {
      const idxA = groupSettings.findIndex(gs => gs.id === a.id);
      const idxB = groupSettings.findIndex(gs => gs.id === b.id);
      return idxA - idxB;
    });

    if (sortedMyGroup.length > 0) {
      grouped["내 그룹"] = sortedMyGroup;
    }

    return grouped;
  }, [allUsers, groupSettings]);

  const openDirectChat = useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await apiRequest("POST", "/api/channels/direct", { targetUserId });
      return res.json();
    },
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels-with-pins"] });
      setLocation(`/chat/${channel.id}`);
      // 그룹 탭에서 클릭해도 탭 전환 없이 오른쪽 대화창에서 바로 대화
    }
  });

  // 나와의 대화 열기
  const openSelfChat = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/channels/direct", { targetUserId: user?.id || "local-user-id" });
      return res.json();
    },
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels-with-pins"] });
      setSelfChatChannelId(channel.id);
      setLocation(`/chat/${channel.id}`);
    }
  });

  // 그룹 탭 전환 시 나와의 대화 열기
  useEffect(() => {
    if (sidebarTab === "groups" && !activeChannel && user?.id) {
      openSelfChat.mutate();
    }
  }, [sidebarTab]);

  const activeChannelData = channels?.find(c => c.id === activeChannel);
  const totalMemberCount = channelMembers?.length || activeChannelData?.memberCount || 0;
  const currentMemberInfo = channelMembers?.find(m => m.userId === (user?.id || "local-user-id"));
  const isRoomAdmin = currentMemberInfo?.role === "admin";

  // DM 채널의 상대방 이름을 가져오는 함수
  const getChannelDisplayName = (channel: Channel) => {
    if (channel.type === 'dm') {
      // allChannelMembers에서 먼저 찾기
      const members = allChannelMembers?.[channel.id];
      if (members) {
        const other = members.find(m => m.userId !== user?.id);
        if (other?.user?.firstName) return other.user.firstName;
      }
      // DM 채널명 패턴(DM-userId1-userId2)에서 상대 userId 추출
      if (allUsers && channel.name.startsWith('DM-')) {
        const parts = channel.name.replace('DM-', '').split('-');
        // UUID는 5세그먼트(8-4-4-4-12)이므로 각 5개씩 합쳐서 2개의 UUID 복원
        const raw = parts.join('-');
        const myId = user?.id || '';
        const otherUserId = raw.includes(myId) 
          ? raw.replace(myId, '').replace(/^-|-$/g, '').replace(/--/g, '-')
          : null;
        if (otherUserId) {
          const foundUser = allUsers.find(u => u.id === otherUserId);
          if (foundUser) return foundUser.firstName || foundUser.username || channel.name;
        }
      }
      return channel.name;
    }
    return channel.name;
  };

  // 현재 활성 채널의 표시 이름
  const activeChannelDisplayName = activeChannelData ? getChannelDisplayName(activeChannelData) : '채널 선택';

  const getUserName = (userId: string) => {
    if (userId === "local-user-id" || userId === user?.id) return "지구파";
    // Check allUsers first for a more reliable name
    const foundUser = allUsers?.find(u => u.id === userId);
    if (foundUser) return foundUser.firstName || foundUser.username || userId.slice(0, 8);
    
    const member = channelMembers?.find(m => m.userId === userId);
    return member?.user?.firstName || userId.slice(0, 8);
  };

  const getUserDetails = (userId: string) => {
    const foundUser = allUsers?.find(u => u.id === userId);
    if (foundUser) {
      return {
        name: foundUser.firstName || foundUser.username || userId.slice(0, 8),
        position: foundUser.position || foundUser.role || ""
      };
    }
    const member = channelMembers?.find(m => m.userId === userId);
    return {
      name: member?.user?.firstName || userId.slice(0, 8),
      position: member?.user?.position || member?.user?.role || ""
    };
  };

  const renderChannelProfileComposite = (channelId: number) => {
    const members = allChannelMembers?.[channelId] || [];
    const count = members.length;
    if (count === 0) return <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><Users className="w-5 h-5 text-slate-400" /></div>;
    if (count === 1) return <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center font-black text-blue-500 overflow-hidden">{members[0].user?.profileImageUrl ? <img src={members[0].user.profileImageUrl} className="w-full h-full object-cover"/> : members[0].user?.firstName?.slice(0,1)}</div>;
    return (
      <div className="w-10 h-10 rounded-xl overflow-hidden relative border bg-slate-50">
        <div className="absolute top-0 left-0 w-5 h-5 flex items-center justify-center border-r border-b overflow-hidden">{members[0].user?.profileImageUrl ? <img src={members[0].user.profileImageUrl} className="w-full h-full object-cover"/> : <span className="text-[8px]">{members[0].user?.firstName?.slice(0,1)}</span>}</div>
        <div className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center border-b overflow-hidden">{members[1].user?.profileImageUrl ? <img src={members[1].user.profileImageUrl} className="w-full h-full object-cover"/> : <span className="text-[8px]">{members[1].user?.firstName?.slice(0,1)}</span>}</div>
        <div className="absolute bottom-0 left-0 w-full h-5 flex items-center justify-center bg-slate-100"><span className="text-[9px] font-black text-slate-500">+{count - 2}</span></div>
      </div>
    );
  };

  const handleGoBack = () => {
    setLocation("/");
    setShowMobileList(true);
  };

  const filteredNewRoomUsers = useMemo(() => {
    if (!allUsers) return [];
    if (!newRoomSearch.trim()) return allUsers;
    const q = newRoomSearch.toLowerCase();
    return allUsers.filter(u => 
      (u.firstName || "").toLowerCase().includes(q) || 
      (u.lastName || "").toLowerCase().includes(q) ||
      (u.username || "").toLowerCase().includes(q)
    );
  }, [allUsers, newRoomSearch]);

  const openNewRoomWithExistingMembers = () => {
    if (!channelMembers) return;
    const ids = new Set(channelMembers.map(m => m.userId));
    setNewRoomSelectedIds(ids);
    setNewChannelName(`${activeChannelData?.name} (사본)`);
    setShowNewChannel(true);
  };

  return (
    <div className="h-full flex flex-col md:flex-row bg-white dark:bg-slate-950 overflow-hidden relative font-sans">
      <div className={`${showMobileList ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[320px] border-r shrink-0 h-full bg-white z-20`}>
        <div className="p-3 pb-1 bg-white flex flex-col border-b h-auto min-h-14">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setSidebarTab("chats")}
                className={`text-sm font-black px-1 transition-colors ${sidebarTab === "chats" ? "text-primary border-b-2 border-primary" : "text-slate-400 hover:text-slate-600"}`}
              >
                대화방
              </button>
              <button 
                onClick={() => setSidebarTab("groups")}
                className={`text-sm font-black px-1 transition-colors ${sidebarTab === "groups" ? "text-primary border-b-2 border-primary" : "text-slate-400 hover:text-slate-600"}`}
              >
                그룹
              </button>
            </div>
            <div className="flex items-center gap-1">
              {sidebarTab === "chats" && (
                <button 
                  onClick={() => window.dispatchEvent(new CustomEvent('open-new-room-modal'))}
                  className="text-slate-400 p-1 hover:bg-slate-100 rounded-md transition-colors"
                  title="새 대화방"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
          
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input 
              value={channelSearchQuery}
              onChange={(e) => setChannelSearchQuery(e.target.value)}
              placeholder={sidebarTab === "chats" ? "대화방 검색" : "사용자 검색"}
              className="h-8 bg-slate-50 border-none pl-7 text-xs font-bold rounded-lg focus:ring-1 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebarTab === "chats" ? (
            filteredChannels?.map(channel => (
              <div 
                key={channel.id} 
                onClick={() => { setLocation(`/chat/${channel.id}`); }} 
                onMouseEnter={() => {
                  queryClient.prefetchInfiniteQuery({ queryKey: ["/api/channels", channel.id, "messages"], queryFn: () => fetch(`/api/channels/${channel.id}/messages?limit=${PAGE_SIZE}`, { credentials: 'include' }).then(r => r.json()), initialPageParam: undefined, staleTime: 30000 });
                }}
                className={`flex gap-2.5 p-3 items-center cursor-pointer hover:bg-slate-50 transition-colors ${activeChannel === channel.id ? 'bg-slate-100 border-l-4 border-primary' : ''}`} 
              >
                {renderChannelProfileComposite(channel.id)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="font-bold text-[13.5px] truncate text-slate-800">
                      {getChannelDisplayName(channel)}
                      <span className="text-slate-400 font-bold ml-0.5 text-[10px]">({channel.memberCount || 0})</span>
                    </h4>
                    <div className="flex items-center gap-1">
                      {(channel.unreadCount || 0) > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {channel.unreadCount}
                        </span>
                      )}
                      <button onClick={(e)=>{ 
                        e.stopPropagation(); 
                        // Optimistic update: 즉시 UI에 반영
                        queryClient.setQueryData(["/api/channels-with-pins"], (old: Channel[] | undefined) => {
                          if (!old) return old;
                          return old.map(c => c.id === channel.id ? { ...c, isPinned: !channel.isPinned } : c);
                        });
                        apiRequest("POST", `/api/channels/${channel.id}/${channel.isPinned?"unpin":"pin"}`).then(()=>queryClient.invalidateQueries({queryKey:["/api/channels-with-pins"]}));
                      }} className="ml-1 text-slate-400 hover:text-yellow-500">{ channel.isPinned ? <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : <Star className="w-4 h-4" /> }</button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-1 opacity-70">
                    {(channel as any).lastMessage 
                      ? (channel as any).lastMessage.content === "(파일)" ? "📎 파일" : (channel as any).lastMessage.content
                      : "새 대화방"}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="py-2">
              {groupSettings.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-bold">그룹이 설정되지 않았습니다</p>
                  <p className="text-[10px] mt-1">학교 관리자가 관리자 센터에서 설정합니다</p>
                </div>
              ) : (
                groupSettings
                  .filter(gs => {
                    if (!channelSearchQuery) return true;
                    const u = allUsers?.find((u: any) => u.id === gs.id);
                    return (u?.firstName || "").includes(channelSearchQuery) || (gs.memo || "").includes(channelSearchQuery);
                  })
                  .map((gs, idx) => {
                    const u = allUsers?.find((u: any) => u.id === gs.id);
                    if (!u) return null;
                    const isOnline = onlineStatuses?.[u.id]?.isOnline;
                    return (
                      <div 
                        key={u.id}
                        onClick={() => openDirectChat.mutate(u.id)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <div className="w-6 text-center">
                          <span className="text-[11px] font-black text-slate-300">{idx + 1}</span>
                        </div>
                        <div className="relative">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-400 text-xs overflow-hidden border border-black/5">
                            {u.profileImageUrl ? (
                              <img src={u.profileImageUrl} className="w-full h-full object-cover" />
                            ) : (
                              (u.firstName || u.username || "?").slice(0, 1)
                            )}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${isOnline ? 'bg-green-500' : 'bg-slate-300'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-bold text-slate-800 truncate">{u.firstName || u.username}</span>
                            <span className="text-[10px] font-medium text-slate-400 shrink-0">{u.position || u.role}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className={`text-[10px] font-bold ${isOnline ? 'text-green-600' : 'text-slate-400'}`}>
                              {isOnline ? '온라인' : '오프라인'}
                            </p>
                            {gs.memo && (
                              <span className="text-[10px] text-blue-500 truncate max-w-[120px]">📝 {gs.memo}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`${!showMobileList ? 'flex' : 'hidden'} md:flex flex-1 flex-col h-full bg-[#F5F5DC] relative overflow-hidden`}>
        <div className="h-10 flex items-center justify-between px-3 bg-white/95 border-b z-20 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="md:hidden h-7 w-7" onClick={handleGoBack}><ChevronLeft className="w-6 h-6" /></Button>
            <h3 className="font-black text-[13px] truncate text-slate-900">{activeChannelDisplayName} <button onClick={() => setMembersDialogOpen(true)} className="text-slate-400 font-bold text-[10px]">({totalMemberCount})</button></h3>
          </div>
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 font-bold rounded-xl shadow-xl border-black/5">
                 <DropdownMenuItem onClick={() => setMembersDialogOpen(true)}>참여자 목록</DropdownMenuItem>
                 <DropdownMenuItem onClick={() => setInviteDialogOpen(true)}>대화방에 초대하기</DropdownMenuItem>
                 <DropdownMenuItem onClick={() => setShowFileBrowser(true)}>파일 모아보기</DropdownMenuItem>
                 <DropdownMenuItem onClick={() => setPollDialogOpen(true)}><Vote className="w-4 h-4 mr-2" />투표 만들기</DropdownMenuItem>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem onClick={openNewRoomWithExistingMembers} className="text-primary">
                   <UserPlus className="w-4 h-4 mr-2" />
                   새 대화방 만들기
                 </DropdownMenuItem>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem onClick={() => { setRenameValue(activeChannelData?.name || ""); setRenameChannelOpen(true); }}><Pencil className="w-4 h-4 mr-2" />방 이름 변경</DropdownMenuItem>
                 <DropdownMenuItem onClick={() => activeChannel && toggleMute.mutate({ channelId: activeChannel, isMuted: !activeChannelData?.isMuted })}>{activeChannelData?.isMuted ? <Bell className="w-4 h-4 mr-2" /> : <BellOff className="w-4 h-4 mr-2" />}알림 {activeChannelData?.isMuted ? '켜기' : '끄기'}</DropdownMenuItem>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem className="text-destructive" onClick={() => activeChannel && leaveChannel.mutate(activeChannel)}>방 나가기</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 공지 바 */}
        {(() => {
          const annId = (activeChannelData as any)?.announcementMessageId;
          const annMsg = annId ? messages?.find(m => m.id === annId) : null;
          if (!annMsg) return null;
          const senderName = channelMembers?.find((m: any) => m.userId === annMsg.senderId)?.user?.firstName || "알 수 없음";
          return (
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5">
              <div className="flex items-center justify-center">
                <button onClick={() => setAnnouncementExpanded(!announcementExpanded)} className="flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-900">
                  <Pin className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">📢 {annMsg.content.slice(0, 10)}{annMsg.content.length > 10 ? "..." : ""}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${announcementExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {announcementExpanded && (
                <div className="mt-1.5 text-center">
                  <p className="text-xs text-amber-800 whitespace-pre-wrap">{annMsg.content}</p>
                  <div className="flex items-center justify-center gap-3 mt-1">
                    <span className="text-[9px] text-amber-500">{senderName} · {new Date(annMsg.createdAt!).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    <button 
                      onClick={() => setAnnouncementMutation.mutate(null)}
                      className="text-[9px] text-red-400 hover:text-red-600 font-bold"
                    >
                      공지 해제
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-3 space-y-4"
          onScroll={(e) => {
            const el = e.currentTarget;
            // 맨 아래 근처 감지 (100px 이내)
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
            isNearBottomRef.current = nearBottom;
            setShowScrollDown(!nearBottom);
            
            // 위로 스크롤 시 이전 메시지 로드
            if (el.scrollTop < 50 && hasNextPage && !isFetchingNextPage) {
              const prevHeight = el.scrollHeight;
              fetchNextPage().then(() => {
                requestAnimationFrame(() => {
                  el.scrollTop = el.scrollHeight - prevHeight;
                });
              });
            }
          }}
        >
          {isFetchingNextPage && (
            <div className="text-center py-2">
              <span className="text-xs text-slate-400 animate-pulse">이전 메시지 로딩 중...</span>
            </div>
          )}
          {hasNextPage && !isFetchingNextPage && (
            <div className="text-center py-1">
              <button 
                onClick={() => fetchNextPage()} 
                className="text-xs text-blue-500 hover:underline"
              >
                ↑ 이전 메시지 더 보기
              </button>
            </div>
          )}
          {messagesLoading ? (
            <div className="space-y-4 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`flex gap-2 ${i % 3 === 0 ? 'justify-end' : ''}`}>
                  {i % 3 !== 0 && <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />}
                  <div className={`rounded-2xl p-3 ${i % 3 === 0 ? 'bg-yellow-100' : 'bg-slate-100'}`} style={{ width: `${80 + (i * 30) % 120}px`, height: '36px' }} />
                </div>
              ))}
            </div>
          ) : (
          <>
          {/* 투표+메시지 통합 타임라인 */}
          {(() => {
            const sortedMessages = messages?.slice().sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()) || [];
            const pollItems = (channelPolls || []).map((p: any) => ({ ...p, _type: "poll" as const, _time: new Date(p.createdAt).getTime() }));
            const msgItems = sortedMessages.map((m) => ({ ...m, _type: "message" as const, _time: new Date(m.createdAt!).getTime() }));
            const timeline = [...msgItems, ...pollItems].sort((a, b) => a._time - b._time);
            return timeline.map((item: any) => {
              if (item._type === "poll") {
                return (
                  <PollCard
                    key={`poll-${item.id}`}
                    poll={item}
                    userId={user?.id || "local-user-id"}
                    onVote={(optionIds) => voteMutation.mutate({ pollId: item.id, optionIds })}
                    onClose={() => closePollMutation.mutate(item.id)}
                    onDelete={() => confirm("투표를 삭제하시겠습니까?") && deletePollMutation.mutate(item.id)}
                    allUsers={channelMembers || []}
                  />
                );
              }
              const message = item;
            const isOwn = message.senderId === (user?.id || "local-user-id");
            const userReactions = message.reactions || {};
            const parentMessage = message.parentId ? messages?.find(m => m.id === message.parentId) : null;

            return (
              <div 
                key={message.id} 
                id={`msg-${message.id}`}
                className={`flex gap-2 transition-colors duration-1000 ${isOwn ? 'flex-row-reverse' : ''}`}
              >
                {!isOwn && ( <div className="w-8 h-8 rounded-xl border bg-white flex items-center justify-center font-black text-slate-400 text-[10px]"> {getUserName(message.senderId).slice(0, 1)} </div> )}
                <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {!isOwn && ( <span className="text-[10px] font-bold text-slate-600 mb-0.5 ml-1">{getUserName(message.senderId)}</span> )}
                  
                  {/* 답글 원본 표시 */}
                  {parentMessage && (
                    <div 
                      className="flex items-center gap-1.5 px-2.5 py-1 mb-0.5 bg-black/5 rounded-lg cursor-pointer hover:bg-black/10 transition-colors max-w-full"
                      onClick={() => scrollToMessage(parentMessage.id)}
                    >
                      <Reply className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-[10px] font-bold text-primary truncate">{getUserName(parentMessage.senderId)}</span>
                      <span className="text-[10px] text-slate-500 truncate">{parentMessage.content.slice(0, 30)}{parentMessage.content.length > 30 ? '...' : ''}</span>
                    </div>
                  )}
                  
                  <div className={`flex gap-1.5 items-end ${isOwn ? 'flex-row-reverse' : ''}`}>
                    <div className="flex flex-col gap-1 items-end max-w-full">
                      <div 
                        className={`relative px-3 py-1.5 shadow-sm group ${ message.isRecalled ? 'bg-slate-200/50 italic text-slate-500 rounded-xl' : isOwn ? 'bg-[#FEE500] text-black rounded-xl rounded-tr-none' : 'bg-white text-slate-900 rounded-xl rounded-tl-none' }`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          // 화면 밖으로 안 나가게 보정
                          const menuW = 160, menuH = 140;
                          let x = e.clientX, y = e.clientY;
                          if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
                          if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
                          if (x < 8) x = 8;
                          if (y < 8) y = 8;
                          setContextMenu({ x, y, message });
                        }}
                      >
                        {/* 이미지/파일 미리보기 */}
                        {(message.metadata as any)?.files?.map((file: { name: string; url: string; type: string; thumbnailUrl?: string; blurHash?: string }, fi: number) => {
                          const isImage = file.type?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name);
                          if (isImage) {
                            return (
                              <div key={fi} className="mb-1.5 cursor-pointer relative" onClick={() => setImagePreview(file.url)}>
                                {file.blurHash && (
                                  <img 
                                    src={file.blurHash} 
                                    alt=""
                                    className="absolute inset-0 w-full h-full rounded-lg object-cover blur-sm"
                                    style={{ zIndex: 0 }}
                                  />
                                )}
                                <img 
                                  src={file.thumbnailUrl || file.url} 
                                  alt={file.name}
                                  className="relative max-w-[240px] max-h-[300px] rounded-lg object-cover hover:opacity-90 transition-opacity"
                                  loading="lazy"
                                  style={{ zIndex: 1 }}
                                  onLoad={(e) => {
                                    // 블러 플레이스홀더 숨기기
                                    const blur = e.currentTarget.parentElement?.querySelector('img:first-child');
                                    if (blur && blur !== e.currentTarget) (blur as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            );
                          }
                          return (
                            <a key={fi} href={file.url} target="_blank" rel="noopener noreferrer" 
                              className="flex items-center gap-2 mb-1.5 px-3 py-2 bg-black/5 rounded-lg hover:bg-black/10 transition-colors">
                              <span className="text-lg">📎</span>
                              <span className="text-xs font-bold truncate max-w-[180px]">{file.name}</span>
                            </a>
                          );
                        })}
                        {message.content && message.content !== "(파일)" && (
                          <p className="text-[13px] leading-snug whitespace-pre-wrap font-medium">{message.content}</p>
                        )}
                        
                        {userReactions && Object.entries(userReactions).filter(([_, ids]) => (ids as string[]).length > 0).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(userReactions)
                              .filter(([_, ids]) => (ids as string[]).length > 0)
                              .map(([emoji, userIds]: [string, any]) => (
                              <button
                                key={emoji}
                                onClick={() => {
                                  // Toggle reaction immediately for better UX
                                  addReaction.mutate({ messageId: message.id, emoji });
                                }}
                                onContextMenu={(e) => {
                                  // Open details on right click (or long press on mobile)
                                  e.preventDefault();
                                  setSelectedMessageForReactions(message.id);
                                  setReactionsDialogOpen(true);
                                }}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-all ${userIds.includes(user?.id || "local-user-id") ? 'bg-blue-100 border-blue-200' : 'bg-white/80 border-slate-200 hover:bg-white'}`}
                              >
                                <span className="text-xs">{emoji}</span>
                                <span className="text-[9px] font-bold text-slate-600">{userIds.length}</span>
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                setSelectedMessageForReactions(message.id);
                                setReactionsDialogOpen(true);
                              }}
                              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/50 hover:bg-white border border-slate-200 text-slate-400 transition-colors"
                              title="자세히 보기"
                            >
                              <SearchIcon className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        
                        {!message.isRecalled && (
                          <Popover 
                            open={reactionPopoverOpen[message.id] || false} 
                            onOpenChange={(open) => setReactionPopoverOpen(prev => ({ ...prev, [message.id]: open }))}
                          >
                            <PopoverTrigger asChild>
                              <button
                                className="absolute -bottom-3 right-2 bg-white border rounded-full p-0.5 shadow-sm hover:scale-110 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              >
                                <Smile className="w-3.5 h-3.5 text-slate-400" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent 
                              className="w-auto p-1.5 rounded-2xl shadow-2xl border-black/5 bg-white/95 backdrop-blur-md" 
                              side="top" 
                              align="end"
                              sideOffset={8}
                            >
                              <div className="flex gap-0.5">
                                {EMOJI_LIST.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => {
                                      addReaction.mutate({ messageId: message.id, emoji });
                                      setReactionPopoverOpen(prev => ({ ...prev, [message.id]: false }));
                                    }}
                                    className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-all text-lg active:scale-90"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </div>
                    <div className={`flex flex-col gap-0.5 shrink-0 ${isOwn ? 'items-end' : 'items-start'}`}>
                       {(message as any).unreadCount > 0 ? (
                         <button onClick={() => openReadsDialog(message.id)} className="text-[10px] font-black text-yellow-600 hover:underline">{(message as any).unreadCount}</button>
                       ) : message.readCount !== undefined && message.readCount > 0 ? (
                         <button onClick={() => openReadsDialog(message.id)} className="text-[8.5px] font-black text-slate-400 hover:underline">✓</button>
                       ) : null}
                       <span className="text-[8px] text-slate-500/70 font-bold uppercase"> {format(new Date(message.createdAt), "a h:mm", { locale: ko })} </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          });
          })()}
          </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 맨 아래로 이동 버튼 */}
        {showScrollDown && (
          <button
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              isNearBottomRef.current = true;
              setShowScrollDown(false);
            }}
            className="absolute bottom-20 right-4 z-40 w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all hover:shadow-xl"
            title="최근 메시지로 이동"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}

        {/* 컨텍스트 메뉴 (우클릭 / 꾹 누르기) */}
        {contextMenu && (
          <div 
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-black/10 py-1.5 min-w-[140px] animate-in fade-in zoom-in-95"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button 
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null); setTimeout(() => messageInputRef.current?.focus(), 50); }}
            >
              <Reply className="w-3.5 h-3.5" /> 답글
            </button>
            <button 
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => { navigator.clipboard.writeText(contextMenu.message.content); toast({ title: "복사됨" }); setContextMenu(null); }}
            >
              <FileIcon className="w-3.5 h-3.5" /> 복사
            </button>
            <button 
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => { 
                setAnnouncementMutation.mutate(contextMenu.message.id);
                setContextMenu(null); 
              }}
            >
              <Pin className="w-3.5 h-3.5" /> 공지
            </button>
            {contextMenu.message.senderId === (user?.id || "local-user-id") && 
             (Date.now() - new Date(contextMenu.message.createdAt!).getTime()) < 60000 && (
              <button 
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                onClick={() => { 
                  if (confirm("메시지를 삭제하시겠습니까?")) {
                    deleteMessageMutation.mutate(contextMenu.message.id);
                  }
                  setContextMenu(null); 
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제
              </button>
            )}
          </div>
        )}

        {/* 답글 미리보기 바 */}
        {replyTo && (
          <div className="px-3 py-1.5 bg-blue-50 border-t border-blue-200 flex items-center justify-between z-30">
            <div className="flex items-center gap-2 min-w-0">
              <Reply className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-[11px] font-bold text-blue-600 truncate">{getUserName(replyTo.senderId)}</span>
              <span className="text-[11px] text-slate-500 truncate">{replyTo.content.slice(0, 40)}</span>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-0.5 hover:bg-blue-100 rounded"><X className="w-3.5 h-3.5 text-blue-400" /></button>
          </div>
        )}

        <div className="p-2 bg-white border-t flex flex-col gap-1 shrink-0 z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <div className="flex gap-2 items-center w-full px-1">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <Button type="button" size="icon" variant="ghost" className="rounded-full text-slate-400 h-9 w-9" onClick={() => fileInputRef.current?.click()} disabled={isUploading}><Plus className="w-6 h-6" /></Button>
            <div className="flex-1 bg-slate-100 rounded-xl px-3 py-1.5 flex items-center min-h-[36px]">
               <textarea 
                 ref={messageInputRef}
                 placeholder="메시지 입력" 
                 value={messageInput} 
                 onChange={(e) => setMessageInput(e.target.value)} 
                 rows={1} 
                 className="flex-1 bg-transparent border-none text-[13px] font-bold resize-none outline-none max-h-24 py-1" 
                 onKeyDown={(e) => { 
                   if (e.key === 'Enter' && !e.shiftKey) { 
                     // IMPORTANT: Prevents double sending during Korean/Japanese IME composition
                     if (e.nativeEvent.isComposing) return;
                     
                     e.preventDefault(); 
                     if (!sendMessage.isPending) handleSend(); 
                   } 
                 }} 
               />
            </div>
            <Button 
              type="button" 
              onClick={() => handleSend()} 
              className={`rounded-xl h-8 w-[40px] p-0 shrink-0 ${ (messageInput.trim()) ? 'bg-[#FEE500] text-black shadow-sm' : 'bg-slate-100 text-slate-300' }`} 
              disabled={!messageInput.trim() || sendMessage.isPending}
            > 
              <Send className="w-4 h-4" /> 
            </Button>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={showNewChannel} onOpenChange={setShowNewChannel}>
        <DialogContent className="rounded-3xl max-w-md text-slate-900 p-6 shadow-2xl border-none">
          <DialogHeader><DialogTitle className="font-black text-center text-lg">새로운 대화방 만들기</DialogTitle></DialogHeader>
          <div className="space-y-5 pt-4">
            <div className="space-y-2">
              <Label className="font-bold text-xs ml-1">방 이름</Label>
              <Input 
                placeholder="방 이름을 입력하세요" 
                className="h-12 rounded-xl bg-slate-100 border-none px-4 font-bold focus:ring-2 focus:ring-primary/20" 
                value={newChannelName} 
                onChange={(e) => setNewChannelName(e.target.value)} 
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <Label className="font-bold text-xs">대화 상대 선택</Label>
                <span className="text-[10px] font-black text-primary">{newRoomSelectedIds.size}명 선택됨</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="회원 이름 검색" 
                  className="h-10 rounded-xl bg-slate-50 border-slate-200 pl-10 text-xs font-bold" 
                  value={newRoomSearch} 
                  onChange={(e) => setNewRoomSearch(e.target.value)} 
                />
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-2xl p-2 bg-slate-50/50 space-y-1 scrollbar-hide">
                {filteredNewRoomUsers?.map(u => {
                  const isMe = u.id === (user?.id || "local-user-id");
                  const isSelected = newRoomSelectedIds.has(u.id);
                  return (
                    <div 
                      key={u.id}
                      className={`flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : 'hover:bg-white'}`}
                      onClick={() => {
                        const next = new Set(newRoomSelectedIds);
                        if (next.has(u.id)) next.delete(u.id);
                        else next.add(u.id);
                        setNewRoomSelectedIds(next);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox checked={isSelected} onCheckedChange={(val) => { const next = new Set(newRoomSelectedIds); if (val) next.add(u.id); else next.delete(u.id); setNewRoomSelectedIds(next); }} />
                        <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-black text-slate-500 text-[10px]">
                          {(u.firstName || u.username || "?").slice(0, 1)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-black">{u.firstName || u.username} {isMe && "(나)"}</span>
                          <span className="text-[9px] text-slate-400 font-bold">{u.position || u.role}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <Button 
              className="w-full h-12 rounded-2xl font-black bg-[#2DB400] text-white shadow-lg hover:bg-[#25a000] disabled:opacity-50 transition-all" 
              disabled={!newChannelName.trim() || newRoomSelectedIds.size === 0 || createChannel.isPending}
              onClick={() => createChannel.mutate({ name: newChannelName, memberIds: Array.from(newRoomSelectedIds) })}
            >
              {createChannel.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "대화방 시작하기"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reactionsDialogOpen} onOpenChange={setReactionsDialogOpen}>
        <DialogContent className="max-w-xs rounded-3xl text-slate-900 p-4 border-none shadow-2xl">
          <DialogHeader><DialogTitle className="font-black text-center text-md">반응</DialogTitle></DialogHeader>
          <div className="mt-2">
            <div className="flex justify-center gap-1 mb-4 overflow-x-auto py-1 scrollbar-hide">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    if (selectedMessageForReactions) {
                      addReaction.mutate({ messageId: selectedMessageForReactions, emoji });
                      setReactionsDialogOpen(false);
                    }
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition-all text-xl active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
            
            {selectedMessageForReactions && messages?.find(m => m.id === selectedMessageForReactions)?.reactions && Object.keys(messages.find(m => m.id === selectedMessageForReactions)!.reactions || {}).length > 0 && (
              <div className="border-t pt-3 max-h-60 overflow-y-auto scrollbar-hide">
                <div className="space-y-1.5">
                  {Object.entries(messages.find(m => m.id === selectedMessageForReactions)!.reactions as Record<string, string[]> || {}).flatMap(([emoji, userIds]) => 
                    userIds.map(uid => {
                      const details = getUserDetails(uid);
                      return (
                        <div key={`${uid}-${emoji}`} className="flex items-center justify-between text-xs p-1 px-2 bg-slate-50 rounded-lg border border-black/5">
                          <span className="font-black text-slate-700">{details.name} <span className="text-[10px] text-slate-400 font-bold ml-1">({details.position})</span></span>
                          <span className="text-lg">{emoji}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="rounded-3xl max-w-sm text-slate-900 border-none shadow-2xl">
          <DialogHeader><DialogTitle className="font-black text-center text-lg">대화방에 초대하기</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Input 
                placeholder="사용자 검색" 
                className="h-12 rounded-xl bg-slate-100 border-none px-4 font-bold" 
                value={inviteSearch} 
                onChange={(e) => setInviteSearch(e.target.value)} 
              />
              <div className="max-h-60 overflow-y-auto space-y-2 scrollbar-hide">
                {allUsers?.filter(u => 
                  !channelMembers?.some(m => m.userId === u.id) &&
                  (u.firstName?.toLowerCase().includes(inviteSearch.toLowerCase()) || 
                   u.lastName?.toLowerCase().includes(inviteSearch.toLowerCase()) ||
                   u.username?.toLowerCase().includes(inviteSearch.toLowerCase()))
                ).map(u => (
                  <div 
                    key={u.id} 
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                    onClick={() => { inviteUser.mutate(u.id); }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-black text-slate-400 text-[10px]">
                        {(u.firstName || u.username || '?').slice(0, 1)}
                      </div>
                      <div>
                        <p className="font-black text-sm">{u.firstName || u.username}</p>
                        <p className="text-xs text-slate-500">{u.role}</p>
                      </div>
                    </div>
                    <Button size="sm" className="bg-[#2DB400] text-white rounded-lg">초대</Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl text-slate-900 border-none shadow-2xl">
          <DialogHeader><DialogTitle className="font-black text-lg">참여자 ({totalMemberCount}명)</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-4 max-h-96 overflow-y-auto scrollbar-hide">
            {channelMembers?.map(m => (
              <div key={m.userId} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-black/5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-black text-slate-500 text-xs">{(m.user?.firstName || m.userId).slice(0,1)}</div>
                  <div className="flex flex-col">
                    <span className="text-sm font-black">{m.user?.firstName || m.userId}</span>
                    <span className="text-[10px] text-slate-400 font-bold">{m.user?.position || m.user?.role}</span>
                  </div>
                </div>
                {isRoomAdmin && m.userId !== (user?.id || "local-user-id") && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => kickMember.mutate(m.userId)}><UserMinus className="w-4 h-4"/></Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={readsDialogOpen} onOpenChange={setReadsDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl text-slate-900 border-none shadow-2xl">
          <DialogHeader><DialogTitle className="font-black text-lg">읽음 정보</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            {readsLoading ? (
              <div className="text-center py-4"><span className="text-xs text-slate-400 animate-pulse">로딩 중...</span></div>
            ) : (
              <>
                <div>
                  <Label className="text-xs font-bold text-primary mb-2 block">읽은 사람 ({readsData.length}명)</Label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
                    {channelMembers?.filter(m => readsData.includes(m.userId)).map(m => (
                      <div key={m.userId} className="flex items-center gap-2 p-1.5 px-3 bg-blue-50 rounded-lg text-sm font-bold">
                        <div className="w-6 h-6 rounded-md bg-blue-200 flex items-center justify-center text-[10px]">{(m.user?.firstName || m.userId).slice(0,1)}</div>
                        <span>{m.user?.firstName || m.userId}</span>
                      </div>
                    ))}
                    {readsData.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-2">아직 읽은 사람이 없습니다.</p>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-400 mb-2 block">안 읽은 사람</Label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
                    {channelMembers?.filter(m => 
                      !readsData.includes(m.userId) &&
                      m.userId !== messages?.find(msg => msg.id === selectedMessageForReads)?.senderId
                    ).map(m => (
                      <div key={m.userId} className="flex items-center gap-2 p-1.5 px-3 bg-slate-50 rounded-lg text-sm font-bold text-slate-500">
                        <div className="w-6 h-6 rounded-md bg-slate-200 flex items-center justify-center text-[10px]">{(m.user?.firstName || m.userId).slice(0,1)}</div>
                        <span>{m.user?.firstName || m.userId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 파일 모아보기 다이얼로그 */}
      <Dialog open={showFileBrowser} onOpenChange={setShowFileBrowser}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black">📁 파일 모아보기</DialogTitle>
          </DialogHeader>
          <FileBrowserContent channelId={activeChannel} />
        </DialogContent>
      </Dialog>

      {/* 방 이름 변경 다이얼로그 */}
      <Dialog open={renameChannelOpen} onOpenChange={setRenameChannelOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black">✏️ 방 이름 변경</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="새 이름 입력"
            className="rounded-xl"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue.trim() && activeChannel) {
                renameChannelMutation.mutate({ channelId: activeChannel, name: renameValue.trim() });
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setRenameChannelOpen(false)}>취소</Button>
            <Button
              className="rounded-xl"
              disabled={!renameValue.trim() || renameChannelMutation.isPending}
              onClick={() => activeChannel && renameChannelMutation.mutate({ channelId: activeChannel, name: renameValue.trim() })}
            >
              {renameChannelMutation.isPending ? "변경 중..." : "변경"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 투표 만들기 다이얼로그 */}
      <Dialog open={pollDialogOpen} onOpenChange={setPollDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-black">📊 투표 만들기</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold">제목 *</Label>
              <Input value={pollTitle} onChange={(e) => setPollTitle(e.target.value)} placeholder="투표 제목" className="rounded-xl mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold">설명 (선택)</Label>
              <Input value={pollDescription} onChange={(e) => setPollDescription(e.target.value)} placeholder="투표 설명" className="rounded-xl mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold">유형</Label>
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant={pollType === "text" ? "default" : "outline"} className="rounded-xl text-xs" onClick={() => { setPollType("text"); setPollOptions([{ label: "" }, { label: "" }]); }}>
                  📝 텍스트
                </Button>
                <Button size="sm" variant={pollType === "date" ? "default" : "outline"} className="rounded-xl text-xs" onClick={() => { setPollType("date"); setPollOptions([{ label: "", date: "" }, { label: "", date: "" }]); }}>
                  📅 날짜 선택
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold">옵션</Label>
              <div className="space-y-2 mt-1">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                    {pollType === "date" ? (
                      <input
                        type="date"
                        value={opt.date || ""}
                        onChange={(e) => {
                          const next = [...pollOptions];
                          next[i] = { ...next[i], date: e.target.value, label: e.target.value };
                          setPollOptions(next);
                        }}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                    ) : (
                      <Input
                        value={opt.label}
                        onChange={(e) => {
                          const next = [...pollOptions];
                          next[i] = { ...next[i], label: e.target.value };
                          setPollOptions(next);
                        }}
                        placeholder={`옵션 ${i + 1}`}
                        className="rounded-xl text-xs"
                      />
                    )}
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm font-bold">✕</button>
                    )}
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="text-xs text-blue-600 font-bold" onClick={() => setPollOptions([...pollOptions, { label: "", date: "" }])}>
                  + 옵션 추가
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input type="checkbox" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} className="rounded" />
                복수 선택
              </label>
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input type="checkbox" checked={pollAnonymous} onChange={(e) => setPollAnonymous(e.target.checked)} className="rounded" />
                익명 투표
              </label>
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input type="checkbox" checked={pollShowAfterClose} onChange={(e) => setPollShowAfterClose(e.target.checked)} className="rounded" />
                마감 후 결과 공개
              </label>
            </div>
            <div>
              <Label className="text-xs font-bold">투표 기한 (선택)</Label>
              <input
                type="datetime-local"
                value={pollDeadline}
                onChange={(e) => setPollDeadline(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setPollDialogOpen(false)}>취소</Button>
            <Button
              className="rounded-xl"
              disabled={!pollTitle.trim() || pollOptions.filter(o => (o.label || o.date || "").trim()).length < 2 || createPollMutation.isPending}
              onClick={() => createPollMutation.mutate({
                title: pollTitle.trim(),
                description: pollDescription.trim() || null,
                pollType,
                options: pollOptions.filter(o => (o.label || o.date || "").trim()),
                isMultipleChoice: pollMultiple,
                isAnonymous: pollAnonymous,
                showResultsAfterClose: pollShowAfterClose,
                deadline: pollDeadline || null,
              })}
            >
              {createPollMutation.isPending ? "생성 중..." : "투표 생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 이미지 미리보기 팝업 */}
      {imagePreview && (
        <div 
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center"
          onClick={() => setImagePreview(null)}
        >
          <button 
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl font-bold transition-colors z-10"
            onClick={() => setImagePreview(null)}
          >
            ✕
          </button>
          <img 
            src={imagePreview} 
            alt="미리보기" 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

    </div>
  );
}
