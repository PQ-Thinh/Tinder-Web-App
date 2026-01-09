"use client";

import { useEffect, useState } from "react";
import { StreamChat, Event, MessageResponse, Channel } from "stream-chat";
import { getStreamUserToken } from "@/lib/actions/stream";
import VideoCall from "./VideoCall";
// 👇 Import useAuth để lấy ID chính xác nhất
import { useAuth } from "@/contexts/auth-context";

// --- TYPE DEFINITIONS ---
declare global {
  interface Window {
    currentChatChannel?: Channel;
    sendCallEndMessage?: () => Promise<void>;
    globalCallManager?: {
      initiateCall: (callId: string, calleeName: string) => void;
      handleCallerVideoCall: (callId: string) => void;
      handleOutgoingCallAccepted: (callId?: string) => void;
      handleOutgoingCallDeclined: () => void;
    };
  }
}

interface CustomStreamMessage extends MessageResponse {
  call_id?: string;
  caller_id?: string;
  caller_name?: string;
  caller_image?: string;
  extraData?: {
    call_id?: string;
    caller_id?: string;
    [key: string]: unknown;
  };
}

interface CallActionPayload {
  text: string;
  call_id: string;
  // 👇 Thêm extraData vào payload gửi đi để chắc chắn
  extraData?: {
    call_id: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export default function GlobalCallManager() {
  // --- STATE ---
  const [incomingCallId, setIncomingCallId] = useState<string>("");
  const [callerId, setCallerId] = useState<string>("");
  const [callerName, setCallerName] = useState<string>("");
  const [callerImage, setCallerImage] = useState<string>("");

  const [outgoingCallId, setOutgoingCallId] = useState<string>("");
  const [calleeName, setCalleeName] = useState<string>("");

  const [showIncomingCall, setShowIncomingCall] = useState(false);
  const [showOutgoingCall, setShowOutgoingCall] = useState(false);
  const [showActiveCall, setShowActiveCall] = useState(false);
  const [showCallEnded, setShowCallEnded] = useState(false);

  const [activeCallId, setActiveCallId] = useState<string>("");

  const [client, setClient] = useState<StreamChat | null>(null);

  // 👇 Lấy user từ AuthContext
  const { user } = useAuth();

  // --- LISTENER ---
  useEffect(() => {
    // Nếu chưa login thì chưa nghe
    if (!user) return;

    let chatClient: StreamChat | null = null;

    const handleGlobalMessage = (event: Event) => {
      // 1. Phân tích tin nhắn
      const msg = event.message as unknown as CustomStreamMessage;

      // Lấy dữ liệu an toàn từ mọi ngóc ngách
      const receivedCallId = (msg.call_id || msg.extraData?.call_id || "") as string;
      const receivedCallerId = (msg.caller_id || msg.extraData?.caller_id || "") as string;
      const receivedCallerName = (msg.caller_name || msg.user?.name || "Ai đó") as string;

      // 👇 Dùng user.id từ Context (Chính xác tuyệt đối)
      const myId = user.id;

      // Debug Log
      if (msg.text?.includes("Video call")) {
        console.log(`📩 Global Event: "${msg.text}"`);
        console.log(`   - Payload ID: ${receivedCallId}`);
        console.log(`   - Caller: ${receivedCallerId} (Me: ${myId})`);
      }

      // 2. XỬ LÝ LỜI MỜI (INVITATION)
      if (msg.text?.includes("📹 Video call invitation")) {
        // Điều kiện: Có ID cuộc gọi + Người gọi KHÔNG PHẢI là mình
        if (receivedCallId && receivedCallerId && receivedCallerId !== myId) {
          console.log("✅ Showing Incoming Modal!");
          setIncomingCallId(receivedCallId);
          setCallerId(receivedCallerId);
          setCallerName(receivedCallerName);
          setCallerImage((msg.user?.image || "") as string);
          setShowIncomingCall(true);
        }
      }

      // 3. XỬ LÝ HỦY GỌI (CANCEL)
      if (msg.text?.includes("📹 Call cancelled")) {
        console.log(`🚫 Received Cancel Signal for: ${receivedCallId}`);

        // Cập nhật state để đóng modal
        // Lưu ý: Dùng functional update để lấy giá trị state mới nhất
        setIncomingCallId((currentId) => {
          if (receivedCallId === currentId) {
            console.log("✅ Closing Modal (Matched ID)");
            setShowIncomingCall(false);
            return ""; // Reset ID
          } else {
            console.log(`⚠️ ID Mismatch: Received ${receivedCallId} vs Current ${currentId}`);
          }
          return currentId;
        });
      }
    };

    async function initGlobalListener() {
      try {
        const { token, userId, userName, userImage } = await getStreamUserToken();
        if (!userId || userId !== user?.id) return;

        chatClient = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY!);

        if (chatClient.userID !== userId) {
          // Nếu client đã có user khác (rác), disconnect trước
          if (chatClient.userID) await chatClient.disconnectUser();

          await chatClient.connectUser(
            { id: userId, name: userName, image: userImage },
            token
          );
        }

        // Lắng nghe cả 2 loại event để chắc chắn không sót
        chatClient.on("notification.message_new", handleGlobalMessage);
        chatClient.on("message.new", handleGlobalMessage);

        setClient(chatClient);
        console.log("🎧 GlobalCallManager Listening...");
      } catch (error) {
        console.error("Global Call Listener Error:", error);
      }
    }

    initGlobalListener();

    return () => {
      if (chatClient) {
        chatClient.off("notification.message_new", handleGlobalMessage);
        chatClient.off("message.new", handleGlobalMessage);
      }
    };
  }, [user]); // Chạy lại khi user thay đổi (Login/Logout)

  // --- ACTIONS ---

  const initiateCall = (callId: string, name: string) => {
    setActiveCallId(callId);
    setOutgoingCallId(callId);
    setCalleeName(name);
    setShowOutgoingCall(true);
  };

  // Gửi lệnh hủy robust hơn
  const handleCancelOutgoingCall = async () => {
    const channel = window.currentChatChannel;
    if (channel && outgoingCallId) {
      try {
        // Gửi ID ở cả root và extraData để bên kia dễ bắt
        const payload: CallActionPayload = {
          text: `📹 Call cancelled`,
          call_id: outgoingCallId,
          extraData: {
            call_id: outgoingCallId
          }
        };
        // Ép kiểu để gửi đi
        await channel.sendMessage(payload as unknown as Record<string, unknown>);
        console.log("📤 Sent Cancel Signal:", outgoingCallId);
      } catch (error) {
        console.error("Error sending cancel:", error);
      }
    } else {
      console.warn("⚠️ Cannot cancel: No channel or call ID");
    }

    // Đóng modal phía mình ngay lập tức
    setShowOutgoingCall(false);
    setOutgoingCallId("");
    setCalleeName("");
  };

  const handleAcceptCall = async () => {
    if (!incomingCallId) {
      setShowIncomingCall(false);
      return;
    }

    const channel = window.currentChatChannel;
    if (channel) {
      const payload: CallActionPayload = {
        text: `📹 Call accepted - joining now`,
        call_id: incomingCallId,
        call_accepted: true, // Marker
      };
      await channel.sendMessage(payload as unknown as Record<string, unknown>);
    }
    setShowIncomingCall(false);
    setActiveCallId(incomingCallId);
    setShowActiveCall(true);
  };

  const handleDeclineCall = async () => {
    const channel = window.currentChatChannel;
    if (channel && incomingCallId) {
      const payload: CallActionPayload = {
        text: `📹 Call declined`,
        call_id: incomingCallId,
        call_declined: true, // Marker
      };
      await channel.sendMessage(payload as unknown as Record<string, unknown>);
    }
    setShowIncomingCall(false);
  };

  const handleCallEnd = () => {
    setShowActiveCall(false);
    setShowOutgoingCall(false);
    setShowIncomingCall(false);
    setShowCallEnded(true);
    setTimeout(() => setShowCallEnded(false), 3000);
  };

  useEffect(() => {
    window.globalCallManager = {
      initiateCall,
      handleCallerVideoCall: (id) => { setActiveCallId(id); setShowActiveCall(true); },
      handleOutgoingCallAccepted: (id) => {
        const targetId = id || activeCallId;
        if (targetId) {
          setShowOutgoingCall(false);
          setActiveCallId(targetId);
          setShowActiveCall(true);
        }
      },
      handleOutgoingCallDeclined: () => {
        setShowOutgoingCall(false);
        alert("Người nhận đã từ chối cuộc gọi.");
      },
    };
  }, [activeCallId, outgoingCallId]);

  if (!showIncomingCall && !showOutgoingCall && !showActiveCall && !showCallEnded) return null;

  return (
    <>
      {/* OUTGOING MODAL (NGƯỜI GỌI) */}
      {showOutgoingCall && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">
          <div className="bg-white p-6 rounded-2xl text-center min-w-[300px]">
            <h3 className="text-xl font-bold mb-4 text-gray-900">Đang gọi {calleeName}...</h3>
            <div className="flex justify-center my-6">
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-pink-500"></span>
              </span>
            </div>
            <p className="mb-6 text-gray-600">🔔 Đang chờ bắt máy...</p>
            <button
              onClick={handleCancelOutgoingCall}
              className="bg-red-500 hover:bg-red-600 text-white px-8 py-2 rounded-full font-semibold transition-colors"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* INCOMING MODAL (NGƯỜI NHẬN) */}
      {showIncomingCall && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">
          <div className="bg-white p-6 rounded-2xl text-center shadow-2xl border-4 border-pink-500 min-w-[320px] animate-bounce-in">
            <div className="relative w-24 h-24 mx-auto mb-4">
              <img
                src={callerImage || "/default-avatar.png"}
                className="w-full h-full rounded-full object-cover border-2 border-gray-100"
                onError={(e) => e.currentTarget.src = "/default-avatar.png"}
              />
              <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 border-2 border-white rounded-full animate-pulse"></div>
            </div>

            <h3 className="text-xl font-bold mb-1 text-gray-900">{callerName}</h3>
            <p className="text-pink-500 font-medium mb-6">đang gọi video cho bạn...</p>

            <div className="flex gap-4 justify-center">
              <button
                onClick={handleDeclineCall}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-3 rounded-full font-bold transition-colors"
              >
                Từ chối
              </button>
              <button
                onClick={handleAcceptCall}
                className="bg-green-500 hover:bg-green-600 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-green-500/30 animate-pulse"
              >
                Nghe máy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE CALL */}
      {showActiveCall && activeCallId && (
        <div className="fixed inset-0 z-[9999] bg-black">
          <VideoCall
            callId={activeCallId}
            onCallEnd={handleCallEnd}
            isIncoming={!showOutgoingCall}
            otherUserId={callerName || calleeName}
            isAcceptedCall={true}
          />
        </div>
      )}

      {/* NOTIFICATION */}
      {showCallEnded && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none">
          <div className="bg-black/80 text-white px-8 py-4 rounded-full backdrop-blur-md shadow-xl">
            Cuộc gọi đã kết thúc
          </div>
        </div>
      )}
    </>
  );
}