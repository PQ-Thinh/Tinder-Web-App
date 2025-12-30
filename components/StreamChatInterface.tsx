"use client";

import { UserProfile } from "@/lib/actions/profile";
import {
  createOrGetChannel,
  createVideoCall,
  getStreamUserToken,
} from "@/lib/actions/stream";
import {
  RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Channel, Event, StreamChat, MessageResponse, Attachment } from "stream-chat";
// 👇 Import useAuth để đảm bảo chỉ chạy khi đã có User
import { useAuth } from "@/contexts/auth-context";

// --- TYPES ---
interface Message {
  id: string;
  text: string;
  sender: "me" | "other";
  timestamp: Date;
  user_id: string;
}

// Interface Payload gửi đi (dữ liệu cuộc gọi)
interface VideoCallData {
  call_id: string;
  caller_id: string;
  caller_name?: string;
  caller_image?: string;
  text: string;
  [key: string]: unknown; // Cho phép các field mở rộng của Stream
}

// Interface tin nhắn nhận về (từ Event)
interface CustomEventMessage extends MessageResponse {
  call_id?: string;
  caller_id?: string;
  caller_name?: string;
  extraData?: {
    call_id?: string;
    caller_id?: string;
    [key: string]: unknown;
  };
}

export default function StreamChatInterface({
  otherUser,
  ref,
  onCallStart,
}: {
  otherUser: UserProfile;
  ref: RefObject<{ handleVideoCall: () => void } | null>;
  onCallStart?: (callId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);

  const [client, setClient] = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string>("");
  // 👇 State lưu thông tin người gửi (Me)
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [currentUserImage, setCurrentUserImage] = useState<string>("");

  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);

  // 👇 Lấy user từ AuthContext để chặn race condition
  const { user: authUser } = useAuth();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollButton(false);
  }

  function handleScroll() {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    }
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  // --- INIT CHAT ---
  useEffect(() => {
    // 1. Nếu chưa có User từ AuthContext, dừng ngay
    if (!authUser) return;

    let chatChannel: Channel | null = null;

    async function initializeChat() {
      try {
        setLoading(true);
        // console.log("🚀 [Chat] Initializing for:", authUser?.id);

        const { token, userId, userName, userImage } = await getStreamUserToken();

        if (!token || !userId) {
          console.error("❌ Token or userId missing");
          return;
        }

        setCurrentUserId(userId);
        setCurrentUserName(userName);
        setCurrentUserImage(userImage || "");

        // Singleton Instance
        const chatClient = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY!);

        // --- [FIX LỖI CONNECT TWICE] ---
        // Logic: Chỉ connect nếu ID hiện tại trong Client KHÁC với ID mình cần
        if (chatClient.userID !== userId) {
          // Nếu có user rác từ phiên trước, ngắt nó đi
          if (chatClient.userID) {
            await chatClient.disconnectUser();
          }

          try {
            await chatClient.connectUser(
              { id: userId, name: userName, image: userImage },
              token
            );
          } catch (error: unknown) {
            // Bắt lỗi cụ thể để không crash app
            const err = error as Error;
            if (err.message?.includes("connectUser was called twice")) {
              console.warn("⚠️ [Chat] Race condition handled - Reusing existing connection.");
            } else {
              console.error("❌ Connection Error:", err);
              // Không throw lỗi ở đây để code bên dưới vẫn chạy tiếp nếu client đã kết nối ngầm
            }
          }
        } else {
          // console.log("✅ [Chat] Reusing existing connection.");
        }
        // -------------------------------

        setClient(chatClient);

        // Tạo/Lấy Channel
        const { channelType, channelId } = await createOrGetChannel(otherUser.id);
        chatChannel = chatClient.channel(channelType!, channelId);

        await chatChannel.watch();
        setChannel(chatChannel);

        // Gán vào Window để GlobalCallManager dùng ké (gửi Accept/Decline)
        window.currentChatChannel = chatChannel;

        // Load Messages
        const state = await chatChannel.query({ messages: { limit: 50 } });
        setMessages(
          state.messages.map((msg) => ({
            id: msg.id,
            text: msg.text || "",
            sender: msg.user?.id === userId ? "me" : "other",
            timestamp: new Date(msg.created_at || new Date()),
            user_id: msg.user?.id || "",
          }))
        );

        // Listeners
        chatChannel.on("message.new", (event: Event) => {
          if (event.message && event.message.user?.id !== userId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === event.message!.id)) return prev;
              return [
                ...prev,
                {
                  id: event.message!.id,
                  text: event.message!.text || "",
                  sender: "other",
                  timestamp: new Date(event.message!.created_at || new Date()),
                  user_id: event.message!.user?.id || "",
                },
              ];
            });

            // Xử lý Video Call Signal từ tin nhắn
            const msgText = event.message.text || "";
            // Ép kiểu an toàn
            const customData = event.message as unknown as CustomEventMessage;

            if (msgText.includes("📹 Call accepted") && window.globalCallManager?.handleOutgoingCallAccepted) {
              const callId = customData.call_id || customData.extraData?.call_id;
              if (callId) {
                window.globalCallManager.handleOutgoingCallAccepted(callId);
              }
            }
            if (msgText.includes("📹 Call declined") && window.globalCallManager?.handleOutgoingCallDeclined) {
              window.globalCallManager.handleOutgoingCallDeclined();
            }
          }
        });

        chatChannel.on("typing.start", (e) => e.user?.id !== userId && setIsTyping(true));
        chatChannel.on("typing.stop", (e) => e.user?.id !== userId && setIsTyping(false));

      } catch (error) {
        console.error("❌ Chat Init Error:", error);
      } finally {
        setLoading(false);
      }
    }

    initializeChat();

    // CLEANUP: Chỉ stop watching channel, TUYỆT ĐỐI KHÔNG disconnectUser
    // Vì disconnectUser sẽ giết chết kết nối của GlobalCallManager
    return () => {
      if (chatChannel) chatChannel.stopWatching();
    };
  }, [otherUser, authUser]); // Chạy lại khi user thay đổi hoặc auth load xong

  // --- ACTIONS ---
  async function handleVideoCall() {
    try {
      const { callId } = await createVideoCall(otherUser.id);
      if (!callId) return;

      // Người gọi (Me) hiện modal chờ
      window.globalCallManager?.initiateCall(callId, otherUser.full_name || "Người kia");

      if (channel) {
        // Gửi tin nhắn mời
        const messagePayload: VideoCallData = {
          text: `📹 Video call invitation`,
          call_id: callId,
          caller_id: currentUserId,
          // 👇 Gửi tên & ảnh CỦA MÌNH (Sender)
          caller_name: currentUserName,
          caller_image: currentUserImage,
        };

        // Ép kiểu Record<string, unknown> để thỏa mãn Stream SDK
        await channel.sendMessage(messagePayload as unknown as Record<string, unknown>);
      }
    } catch (error) {
      console.error("Video Call Error:", error);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !channel) return;

    try {
      const resp = await channel.sendMessage({ text: newMessage.trim() });
      setMessages((prev) => [
        ...prev,
        {
          id: resp.message.id,
          text: newMessage.trim(),
          sender: "me",
          timestamp: new Date(),
          user_id: currentUserId,
        },
      ]);
      setNewMessage("");
    } catch (err) {
      console.error(err);
    }
  }

  useImperativeHandle(ref, () => ({ handleVideoCall }));

  // --- RENDER ---
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  // Fallback UI nếu lỗi channel
  if (!loading && !channel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-white dark:bg-gray-900 text-center">
        <p className="text-red-500 mb-2">Đang kết nối lại...</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:opacity-80"
        >
          Tải lại
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth chat-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${msg.sender === "me" ? "bg-gradient-to-r from-pink-500 to-red-500 text-white" : "bg-gray-200 dark:bg-gray-700 dark:text-white"
              }`}>
              <p className="text-sm">{msg.text}</p>
              <p className={`text-xs mt-1 ${msg.sender === "me" ? "text-pink-100" : "text-gray-500"}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        {isTyping && <div className="text-gray-400 text-xs px-4">Đang nhập...</div>}
        <div ref={messagesEndRef} />
      </div>

      {showScrollButton && (
        <button onClick={scrollToBottom} className="absolute bottom-20 right-6 bg-pink-500 text-white p-3 rounded-full shadow-lg z-10">
          ⬇
        </button>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <input
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              channel?.keystroke();
            }}
            placeholder="Nhập tin nhắn..."
            className="flex-1 px-4 py-2 border rounded-full focus:ring-2 focus:ring-pink-500 dark:bg-gray-800 dark:text-white disabled:opacity-50"
            disabled={!channel}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || !channel}
            className="px-6 py-2 bg-pink-500 text-white rounded-full hover:bg-pink-600 disabled:opacity-50"
          >
            Gửi
          </button>
        </form>
      </div>
    </div>
  );
}