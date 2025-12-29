"use client";

import { useEffect, useState } from "react";
// Import Channel để dùng cho Window Interface
import { StreamChat, Event, MessageResponse, Channel } from "stream-chat";
import { getStreamUserToken } from "@/lib/actions/stream";
import VideoCall from "./VideoCall";

// --- TYPE DEFINITIONS ---

// Mở rộng Window Interface
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

// Interface tin nhắn nhận được
interface CustomStreamMessage extends MessageResponse {
  call_id?: string;
  caller_id?: string;
  caller_name?: string;
  caller_image?: string;
  // Hỗ trợ cả trường hợp data nằm trong extraData
  extraData?: {
    call_id?: string;
    caller_id?: string;
    [key: string]: unknown;
  };
}

// Interface payload gửi đi
interface CallActionPayload {
  text: string;
  call_id: string;
  [key: string]: unknown;
}

export default function GlobalCallManager() {
  // --- STATE ---
  const [incomingCallId, setIncomingCallId] = useState<string>("");
  const [callerId, setCallerId] = useState<string>("");
  const [callerName, setCallerName] = useState<string>("");
  const [callerImage, setCallerImage] = useState<string>("");

  const [outgoingCallId, setOutgoingCallId] = useState<string>(""); // Thêm state này
  const [calleeName, setCalleeName] = useState<string>("");

  const [showIncomingCall, setShowIncomingCall] = useState(false);
  const [showOutgoingCall, setShowOutgoingCall] = useState(false);
  const [showActiveCall, setShowActiveCall] = useState(false);
  const [showCallEnded, setShowCallEnded] = useState(false);

  const [activeCallId, setActiveCallId] = useState<string>("");

  const [client, setClient] = useState<StreamChat | null>(null);

  // --- LISTENER ---
  useEffect(() => {
    let chatClient: StreamChat | null = null;

    const handleGlobalMessage = (event: Event) => {
      // Ép kiểu an toàn
      const msg = event.message as unknown as CustomStreamMessage;

      // Lấy data an toàn (ưu tiên extraData nếu có)
      const receivedCallId = (msg.call_id || msg.extraData?.call_id || "") as string;
      const receivedCallerId = (msg.caller_id || msg.extraData?.caller_id || "") as string;
      const receivedCallerName = (msg.caller_name || msg.user?.name || "Ai đó") as string;

      const myId = chatClient?.userID;

      // 1. XỬ LÝ LỜI MỜI GỌI ĐẾN
      if (msg.text?.includes("📹 Video call invitation")) {
        console.log(`📞 Incoming Call Detected: ${receivedCallId} from ${receivedCallerId}`);

        // Chỉ hiện nếu có ID và không phải mình tự gọi
        if (receivedCallId && receivedCallerId && receivedCallerId !== myId) {
          setIncomingCallId(receivedCallId);
          setCallerId(receivedCallerId);
          setCallerName(receivedCallerName);
          setCallerImage((msg.user?.image || "") as string);
          setShowIncomingCall(true);
        }
      }

      // 2. XỬ LÝ ĐỐI PHƯƠNG HỦY GỌI (CANCEL)
      if (msg.text?.includes("📹 Call cancelled")) {
        console.log(`🚫 Call Cancelled Event: ${receivedCallId}`);

        // Nếu ID cuộc gọi hủy trùng với cuộc gọi đang chờ -> Đóng Modal
        // Lưu ý: So sánh receivedCallId với incomingCallId hiện tại
        setIncomingCallId((currentIncomingId) => {
          if (receivedCallId === currentIncomingId) {
            console.log("✅ Closing Incoming Modal due to Cancel");
            setShowIncomingCall(false);
            return ""; // Reset state
          }
          return currentIncomingId;
        });
      }
    };

    async function initGlobalListener() {
      try {
        const { token, userId, userName, userImage } = await getStreamUserToken();
        if (!userId) return;

        chatClient = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY!);

        // Chỉ connect nếu chưa connect
        if (chatClient.userID !== userId) {
          await chatClient.connectUser(
            { id: userId, name: userName, image: userImage },
            token
          );
        }

        chatClient.on("notification.message_new", handleGlobalMessage);
        chatClient.on("message.new", handleGlobalMessage);

        setClient(chatClient);
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
  }, []); // Bỏ dependency incomingCallId để tránh re-bind liên tục

  // --- ACTIONS ---

  // 1. NGƯỜI GỌI: Bắt đầu gọi
  const initiateCall = (callId: string, name: string) => {
    setActiveCallId(callId);
    setOutgoingCallId(callId); // Lưu lại để dùng khi hủy
    setCalleeName(name);
    setShowOutgoingCall(true);
  };

  // 2. NGƯỜI GỌI: Hủy cuộc gọi (QUAN TRỌNG: Gửi tin nhắn báo hủy)
  const handleCancelOutgoingCall = async () => {
    const channel = window.currentChatChannel;
    if (channel && outgoingCallId) {
      try {
        const payload: CallActionPayload = {
          text: `📹 Call cancelled`, // Text này phải khớp với logic check ở trên
          call_id: outgoingCallId,
        };
        // Gửi tin nhắn để bên kia biết mà đóng Modal
        await channel.sendMessage(payload as unknown as Record<string, unknown>);
        console.log("📤 Sent Cancel Signal for:", outgoingCallId);
      } catch (error) {
        console.error("Error sending cancel:", error);
      }
    }

    // Đóng Modal phía mình
    setShowOutgoingCall(false);
    setOutgoingCallId("");
    setCalleeName("");
  };

  // 3. NGƯỜI NHẬN: Chấp nhận
  const handleAcceptCall = async () => {
    // Check lại lần cuối xem cuộc gọi còn valid không (tránh race condition)
    if (!incomingCallId) {
      setShowIncomingCall(false);
      return;
    }

    const channel = window.currentChatChannel;
    if (channel) {
      const payload: CallActionPayload = {
        text: `📹 Call accepted - joining now`,
        call_id: incomingCallId,
        call_accepted: true,
      };
      await channel.sendMessage(payload as unknown as Record<string, unknown>);
    }
    setShowIncomingCall(false);
    setActiveCallId(incomingCallId);
    setShowActiveCall(true);
  };

  // 4. NGƯỜI NHẬN: Từ chối
  const handleDeclineCall = async () => {
    const channel = window.currentChatChannel;
    if (channel && incomingCallId) {
      const payload: CallActionPayload = {
        text: `📹 Call declined`,
        call_id: incomingCallId,
        call_declined: true,
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
  }, [activeCallId, outgoingCallId]); // Thêm outgoingCallId vào dependency

  if (!showIncomingCall && !showOutgoingCall && !showActiveCall && !showCallEnded) return null;

  return (
    <>
      {/* --- OUTGOING MODAL (NGƯỜI GỌI) --- */}
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

            {/* NÚT HỦY GỌI QUAN TRỌNG */}
            <button
              onClick={handleCancelOutgoingCall}
              className="bg-red-500 hover:bg-red-600 text-white px-8 py-2 rounded-full font-semibold transition-colors"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* --- INCOMING MODAL (NGƯỜI NHẬN) --- */}
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

      {/* CALL ENDED NOTIFICATION */}
      {showCallEnded && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none">
          <div className="bg-black/80 text-white px-8 py-4 rounded-full backdrop-blur-md shadow-xl animate-fade-in-up">
            Cuộc gọi đã kết thúc
          </div>
        </div>
      )}
    </>
  );
}