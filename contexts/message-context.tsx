"use client";

import { createClient } from "@/lib/supabase/client";
import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from "react";
import { getGlobalStreamClient } from "@/lib/stream-chat-client";
import { ChannelFilters, ChannelOptions, ChannelSort, Event as StreamEvent, StreamChat, Channel } from "stream-chat";
import { useAuth } from "./auth-context";
import { UserProfile } from "@/lib/actions/profile";
import { getUserMatches } from "@/lib/actions/matches";
import { getUserProfileById } from "@/lib/actions/profile";

export interface ChatData {
  id: string;
  user: UserProfile;
  lastMessage?: string;
  lastMessageTime: string;
  unreadCount: number;
  channelId: string;
  isLastMessageMine?: boolean;
}

interface MessageContextType {
  unreadCount: number;
  unreadByChannel: Record<string, number>;
  chatList: ChatData[];
  isLoadingChats: boolean;
  markAsRead: (channelId: string) => void;
  refreshState: () => Promise<void>;
  user: UserProfile | null;
  latestMatch: UserProfile | null;
  clearLatestMatch: () => void;
}

interface MatchRow {
  id: string;
  user1_id: string;
  user2_id: string;
  is_active: boolean;
  created_at: string;
}

interface RealtimeMatchPayload {
  new: MatchRow;
  old: MatchRow | null;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  commit_timestamp: string;
  errors: null | { message: string; code?: string }[];
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

// --- [QUAN TRỌNG: LOGIC PHẢI KHỚP VỚI SERVER] ---
function generateChannelId(userId1: string, userId2: string): string {
  const sortedIds = [userId1, userId2].sort();
  // Lấy 20 ký tự đầu của mỗi ID (giống hệt Server)
  return `match_${sortedIds[0].slice(0, 20)}_${sortedIds[1].slice(0, 20)}`;
}
// --------------------------------------------------

export function MessageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const [chatList, setChatList] = useState<ChatData[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState<boolean>(true);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  const [latestMatch, setLatestMatch] = useState<UserProfile | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);
  const lastFetchTimeRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const markAsRead = useCallback(async (channelId: string) => {
    try {
      const client = await getGlobalStreamClient();
      if (!client) return;

      const channel = client.channel('messaging', channelId);
      try {
        await channel.watch(); // Đảm bảo channel được watch trước khi mark read
        await channel.markRead();
      } catch (err) {
        console.warn("⚠️ Cannot mark read (channel init warning):", channelId);
        return;
      }

      if (isMountedRef.current) {
        setUnreadByChannel((prev) => {
          const newUnread = { ...prev };
          delete newUnread[channelId];
          const totalUnread = Object.values(newUnread).reduce((sum, count) => sum + count, 0);
          setUnreadCount(totalUnread);
          return newUnread;
        });

        setChatList(prevList =>
          prevList.map(chat =>
            chat.channelId === channelId ? { ...chat, unreadCount: 0 } : chat
          )
        );
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, []);

  const clearLatestMatch = useCallback(() => {
    setLatestMatch(null);
  }, []);

  const refreshState = useCallback(async () => {
    if (!userId) return;

    const now = Date.now();
    if (isFetchingRef.current || (now - lastFetchTimeRef.current < 2000)) {
      return;
    }

    try {
      isFetchingRef.current = true;

      const userMatches = await getUserMatches();
      const client = await getGlobalStreamClient();
      if (!client) {
        isFetchingRef.current = false;
        return;
      }

      const channelIds: string[] = [];
      userMatches.forEach(match => {
        channelIds.push(generateChannelId(userId, match.id));
      });

      let streamChannels: Channel[] = [];

      if (channelIds.length > 0) {
        // Query channel để lấy trạng thái unread
        const filters: ChannelFilters = { type: 'messaging', id: { $in: channelIds }, members: { $in: [userId] } };
        const sort: ChannelSort = { last_message_at: -1 };
        const options: ChannelOptions = { limit: 50, state: true, watch: true }; // watch: true để cập nhật realtime
        streamChannels = await client.queryChannels(filters, sort, options);
      }

      let totalUnread = 0;
      const unreadMap: Record<string, number> = {};

      const processedChatList: ChatData[] = userMatches.map(match => {
        const channelId = generateChannelId(userId, match.id);
        const streamChannel = streamChannels.find(c => c.id === channelId);

        let lastMessageText = "Bắt đầu cuộc trò chuyện của bạn!";
        let lastMessageTime = match.created_at;
        let isMine = false;
        let unread = 0;

        if (streamChannel) {
          unread = streamChannel.countUnread();
          if (unread > 0) {
            unreadMap[channelId] = unread;
            totalUnread += unread;
          }

          if (streamChannel.state.messages.length > 0) {
            const messages = streamChannel.state.messages;
            const lastMsg = messages[messages.length - 1];

            if (lastMsg.text) lastMessageText = lastMsg.text;
            else if (lastMsg.attachments?.length) lastMessageText = "Đã gửi một tệp đính kèm";
            if (lastMsg.deleted_at) lastMessageText = "Tin nhắn đã bị thu hồi";

            lastMessageTime = lastMsg.created_at
              ? (typeof lastMsg.created_at === 'string' ? lastMsg.created_at : lastMsg.created_at.toISOString())
              : match.created_at;

            isMine = lastMsg.user?.id === userId;
          }
        }

        return {
          id: match.id,
          user: match,
          lastMessage: lastMessageText,
          lastMessageTime: lastMessageTime,
          unreadCount: unread,
          channelId,
          isLastMessageMine: isMine
        };
      });

      processedChatList.sort((a, b) =>
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      );

      if (isMountedRef.current) {
        setUnreadByChannel(unreadMap);
        setUnreadCount(totalUnread); // Cập nhật state unreadCount -> Navbar sẽ tự nhận
        setChatList(processedChatList);
        setDataOwnerId(userId);
        setIsLoadingChats(false);
        lastFetchTimeRef.current = Date.now();
      }

    } catch (error) {
      console.error('Error refreshing chat state:', error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setDataOwnerId(null);
      setChatList([]);
      setIsLoadingChats(true);
      return;
    }

    lastFetchTimeRef.current = 0;
    refreshState();

    const supabase = createClient();

    const handleNewMatch = async (payload: RealtimeMatchPayload) => {
      console.log("🔔 Realtime Match Event:", payload);
      const newRecord = payload.new;
      lastFetchTimeRef.current = 0;
      await refreshState();

      const partnerId = newRecord.user1_id === userId ? newRecord.user2_id : newRecord.user1_id;

      if (partnerId) {
        try {
          const partnerProfile = await getUserProfileById(partnerId);
          if (partnerProfile && isMountedRef.current) {
            setLatestMatch(partnerProfile);
          }
        } catch (err) {
          console.error("Lỗi lấy thông tin match mới:", err instanceof Error ? err.message : "Unknown error");
        }
      }
    };

    const realtimeChannel = supabase.channel('realtime-matches-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: `user1_id=eq.${userId}`,
        },
        (payload) => handleNewMatch(payload as unknown as RealtimeMatchPayload))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: `user2_id=eq.${userId}`,
        },
        (payload) => handleNewMatch(payload as unknown as RealtimeMatchPayload))
      .subscribe();

    let streamClient: StreamChat | null = null;

    const handleStreamEvent = async () => {
      // Khi có tin nhắn mới -> refresh lại unread count
      lastFetchTimeRef.current = 0;
      await refreshState();
    };

    const setupListeners = async () => {
      streamClient = await getGlobalStreamClient();
      if (!streamClient || !isMountedRef.current) return;

      streamClient.on('notification.message_new', handleStreamEvent);
      streamClient.on('message.new', handleStreamEvent);
      streamClient.on('message.read', handleStreamEvent);
      streamClient.on('notification.channel_updated', handleStreamEvent);

      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        lastFetchTimeRef.current = 0;
        refreshState();
      }, 30000);
    };

    setupListeners();

    return () => {
      supabase.removeChannel(realtimeChannel);
      if (streamClient) {
        streamClient.off('notification.message_new', handleStreamEvent);
        streamClient.off('message.new', handleStreamEvent);
        streamClient.off('message.read', handleStreamEvent);
        streamClient.off('notification.channel_updated', handleStreamEvent);
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId, refreshState]);

  const isDataFresh = userId === dataOwnerId;
  const exposedUnreadCount = (user && isDataFresh) ? unreadCount : 0;
  const exposedChatList = (user && isDataFresh) ? chatList : [];
  const exposedLoading = (user && isDataFresh) ? isLoadingChats : true;

  return (
    <MessageContext.Provider
      value={{
        unreadCount: exposedUnreadCount,
        unreadByChannel: (user && isDataFresh) ? unreadByChannel : {},
        chatList: exposedChatList,
        isLoadingChats: exposedLoading,
        markAsRead,
        refreshState,
        user: user as UserProfile | null,
        latestMatch,
        clearLatestMatch,
      }}
    >
      {children}
    </MessageContext.Provider>
  );
}

export function useMessage() {
  const context = useContext(MessageContext);
  if (context === undefined) {
    throw new Error("useMessage must be used within a MessageProvider");
  }
  return context;
}