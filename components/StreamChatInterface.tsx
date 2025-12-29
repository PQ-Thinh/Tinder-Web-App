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

// --- TYPES ---
interface Message {
  id: string;
  text: string;
  sender: "me" | "other";
  timestamp: Date;
  user_id: string;
}

// Interface Payload gửi đi
interface VideoCallData {
  call_id: string;
  caller_id: string;
  caller_name?: string; // Tên người gọi (Sender)
  caller_image?: string; // Ảnh người gọi (Sender)
  text: string;
  [key: string]: unknown;
}

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
  // 👇 THÊM STATE NÀY ĐỂ LƯU TÊN & ẢNH CỦA MÌNH
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [currentUserImage, setCurrentUserImage] = useState<string>("");

  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
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
    let chatChannel: Channel | null = null;

    async function initializeChat() {
      try {
        const { token, userId, userName, userImage } = await getStreamUserToken();
        setCurrentUserId(userId!);
        // 👇 LƯU THÔNG TIN CỦA MÌNH VÀO STATE
        setCurrentUserName(userName);
        setCurrentUserImage(userImage || "");

        const chatClient = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY!);

        if (chatClient.userID !== userId) {
          await chatClient.connectUser(
            { id: userId!, name: userName, image: userImage },
            token
          );
        }

        setClient(chatClient);

        const { channelType, channelId } = await createOrGetChannel(otherUser.id);
        chatChannel = chatClient.channel(channelType!, channelId);

        await chatChannel.watch();
        setChannel(chatChannel);
        window.currentChatChannel = chatChannel;

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

            const msgText = event.message.text || "";
            const customData = event.message as unknown as CustomEventMessage;

            // Xử lý logic gọi điện từ sự kiện tin nhắn
            if (msgText.includes("📹 Call accepted") && window.globalCallManager?.handleOutgoingCallAccepted) {
              // Ưu tiên lấy từ root, nếu không có thì lấy từ extraData
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
        console.error("Chat Init Error:", error);
      } finally {
        setLoading(false);
      }
    }

    if (otherUser) initializeChat();

    return () => {
      if (chatChannel) chatChannel.stopWatching();
    };
  }, [otherUser]);

  // --- ACTIONS ---
  async function handleVideoCall() {
    try {
      const { callId } = await createVideoCall(otherUser.id);
      if (!callId) return;

      // Hiển thị modal chờ phía người gọi (Sender)
      // InitiateCall: Hiện tên người MÌNH ĐANG GỌI (otherUser) -> Đúng
      window.globalCallManager?.initiateCall(callId, otherUser.full_name || "Người kia");

      // Gửi tin nhắn mời cho người nhận (Receiver)
      if (channel) {
        const messagePayload: VideoCallData = {
          text: `📹 Video call invitation`,
          call_id: callId,
          caller_id: currentUserId,
          // 👇 [FIXED] GỬI TÊN CỦA MÌNH (Sender), KHÔNG PHẢI TÊN NGƯỜI NHẬN
          caller_name: currentUserName,
          caller_image: currentUserImage,
        };

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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
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
            className="flex-1 px-4 py-2 border rounded-full focus:ring-2 focus:ring-pink-500 dark:bg-gray-800 dark:text-white"
          />
          <button type="submit" disabled={!newMessage.trim()} className="px-6 py-2 bg-pink-500 text-white rounded-full hover:bg-pink-600 disabled:opacity-50">
            Gửi
          </button>
        </form>
      </div>
    </div>
  );
}