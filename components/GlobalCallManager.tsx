"use client";

import { useEffect, useState, useRef } from "react";
import { StreamChat, Event, Channel } from "stream-chat";
import { getStreamUserToken } from "@/lib/actions/stream";
import VideoCall from "./VideoCall";

declare global {
  interface Window {
    globalCallManager?: {
      initiateCall: (callId: string, calleeName: string, calleeUserId: string) => void;
      handleCallerVideoCall: (callId: string) => void;
      handleOutgoingCallAccepted: (callId?: string) => void;
      handleOutgoingCallDeclined: () => void;
    };
    currentChatChannel?: Channel;
    sendCallEndMessage?: () => Promise<void>;
  }
}

// Định nghĩa lại interface cho custom data
interface VideoCallCustomData extends Record<string, unknown> {
  call_id?: string;
  caller_id?: string;
  caller_name?: string;
  caller_image?: string;
  text?: string;
  acceptor_id?: string;
  decliner_id?: string;
  canceller_id?: string;
  call_accepted?: boolean;
  call_declined?: boolean;
  call_cancelled?: boolean;
}

export default function GlobalCallManager() {
  // --- INCOMING CALL STATES ---
  const [incomingCallId, setIncomingCallId] = useState<string>("");
  const [callerId, setCallerId] = useState<string>("");
  const [callerName, setCallerName] = useState<string>("");
  const [callerImage, setCallerImage] = useState<string>("");
  const [showIncomingCall, setShowIncomingCall] = useState(false);

  // --- QUAN TRỌNG: Dùng Ref để truy cập state mới nhất trong Listener ---
  const incomingCallIdRef = useRef(incomingCallId);
  const showIncomingCallRef = useRef(showIncomingCall);

  // Cập nhật Ref mỗi khi state thay đổi
  useEffect(() => {
    incomingCallIdRef.current = incomingCallId;
    showIncomingCallRef.current = showIncomingCall;
  }, [incomingCallId, showIncomingCall]);

  // --- OUTGOING CALL STATES ---
  const [outgoingCallId, setOutgoingCallId] = useState<string>("");
  const [calleeName, setCalleeName] = useState<string>("");
  const [calleeId, setCalleeId] = useState<string>("");
  const [showOutgoingCall, setShowOutgoingCall] = useState(false);

  // --- ACTIVE CALL STATES ---
  const [activeCallId, setActiveCallId] = useState<string>("");
  const [showActiveCall, setShowActiveCall] = useState(false);
  const [showCallEnded, setShowCallEnded] = useState(false);

  const [client, setClient] = useState<StreamChat | null>(null);

  // --- 1. INIT LISTENER (CHỈ CHẠY 1 LẦN DUY NHẤT) ---
  useEffect(() => {
    let chatClient: StreamChat | null = null;

    const handleGlobalMessage = (event: Event) => {
      // console.log("GlobalCallManager received event:", event.type, event.message?.text);

      const customData = event.message as unknown as VideoCallCustomData;
      const currentUserId = chatClient?.userID;

      // 1. Logic nhận cuộc gọi mời (Invitation)
      if (event.message?.text?.includes("📹 Video call invitation")) {
        // console.log("Invitation data:", customData);

        // Kiểm tra: Có caller_id và không phải chính mình gọi
        if (customData.caller_id && customData.caller_id !== currentUserId) {
          // console.log("Show incoming call modal!");
          setIncomingCallId(customData.call_id || "");
          setCallerId(customData.caller_id);
          setCallerName(customData.caller_name || event.user?.name || "Ai đó");
          setCallerImage(customData.caller_image || event.user?.image || "");
          setShowIncomingCall(true);
        }
      }

      // 2. Logic hủy cuộc gọi từ người gọi (Cancelled)
      if (event.message?.text?.includes("📹 Call cancelled")) {
        const cancelledCallId = customData.call_id;
        // Dùng Ref để so sánh ID chính xác mà không cần re-render
        if (cancelledCallId && incomingCallIdRef.current === cancelledCallId) {
          // console.log("Call cancelled. Closing modal.");
          setShowIncomingCall(false);
          setIncomingCallId("");
          setCallerId("");
          setCallerName("");
          setCallerImage("");
        }
      }
    };

    async function initGlobalListener() {
      try {
        const { token, userId, userName, userImage } = await getStreamUserToken();

        if (!userId) return;

        chatClient = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY!);

        // Chỉ connect nếu chưa connect đúng user
        if (chatClient.userID !== userId) {
          await chatClient.connectUser(
            { id: userId, name: userName, image: userImage },
            token
          );
        }

        // Lắng nghe sự kiện
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
        // Không disconnect user ở đây để tránh ảnh hưởng component chat khác
      }
    };
  }, []); // <--- QUAN TRỌNG: Mảng rỗng để chỉ chạy 1 lần

  // --- CÁC HÀM XỬ LÝ KHÁC (Đã fix lỗi TypeScript 'as any') ---

  const getChannelInstance = async (targetUserId: string) => {
    if (!client || !client.userID || !targetUserId) return null;
    if (window.currentChatChannel && window.currentChatChannel.state.members[targetUserId]) {
      return window.currentChatChannel;
    }
    const channel = client.channel("messaging", {
      members: [client.userID, targetUserId],
    });
    if (!channel.initialized) {
      await channel.watch();
    }
    return channel;
  };

  const handleAcceptCall = async () => {
    const channel = await getChannelInstance(callerId);
    if (channel && incomingCallId && client) {
      try {
        await channel.sendMessage({
          text: `📹 Call accepted - joining now`,
          call_id: incomingCallId,
          acceptor_id: client.userID!,
          call_accepted: true,
        } as Record<string, unknown>);
      } catch (error) {
        console.error("Error sending acceptance:", error);
      }
    }
    setShowIncomingCall(false);
    setActiveCallId(incomingCallId);
    setShowActiveCall(true);
    setIncomingCallId("");
    setCallerId("");
    setCallerName("");
    setCallerImage("");
  };

  const handleDeclineCall = async () => {
    const channel = await getChannelInstance(callerId);
    if (channel && incomingCallId && client) {
      try {
        await channel.sendMessage({
          text: `📹 Call declined`,
          call_id: incomingCallId,
          decliner_id: client.userID!,
          call_declined: true,
        } as Record<string, unknown>);
      } catch (error) {
        console.error("Error sending decline:", error);
      }
    }
    setShowIncomingCall(false);
    setIncomingCallId("");
    setCallerId("");
    setCallerName("");
    setCallerImage("");
  };

  const initiateCall = (callId: string, calleeName: string, calleeUserId: string) => {
    setOutgoingCallId(callId);
    setCalleeName(calleeName);
    setCalleeId(calleeUserId);
    setShowOutgoingCall(true);
  };

  const handleCancelOutgoingCall = async () => {
    const channel = await getChannelInstance(calleeId);
    if (channel && outgoingCallId && client) {
      await channel.sendMessage({
        text: `📹 Call cancelled`,
        call_id: outgoingCallId,
        canceller_id: client.userID!,
        call_cancelled: true,
      } as Record<string, unknown>);
    }
    setShowOutgoingCall(false);
    setOutgoingCallId("");
    setCalleeName("");
    setCalleeId("");
  };

  const handleOutgoingCallAccepted = (callId?: string) => {
    const idToUse = callId || outgoingCallId;
    if (idToUse) {
      setShowOutgoingCall(false);
      setActiveCallId(idToUse);
      setShowActiveCall(true);
      setOutgoingCallId("");
      setCalleeName("");
      setCalleeId("");
    }
  };

  const handleOutgoingCallDeclined = () => {
    setShowOutgoingCall(false);
    setOutgoingCallId("");
    setCalleeName("");
    setCalleeId("");
  };

  const handleCallerVideoCall = (callId: string) => {
    setActiveCallId(callId);
    setShowActiveCall(true);
  };

  const handleCallEnd = () => {
    setShowActiveCall(false);
    setActiveCallId("");
    setShowOutgoingCall(false);
    setOutgoingCallId("");
    setCalleeName("");
    setCalleeId("");
    setShowIncomingCall(false);
    setIncomingCallId("");
    setCallerId("");
    setCallerName("");
    setCallerImage("");

    setShowCallEnded(true);
    setTimeout(() => setShowCallEnded(false), 3000);
  };

  useEffect(() => {
    window.globalCallManager = {
      initiateCall,
      handleCallerVideoCall,
      handleOutgoingCallAccepted,
      handleOutgoingCallDeclined,
    };
    return () => {
      delete window.globalCallManager;
    };
  }, []);

  if (!showIncomingCall && !showOutgoingCall && !showActiveCall && !showCallEnded) return null;

  return (
    <>
      {/* --- MODAL CUỘC GỌI ĐI --- */}
      {showOutgoingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Đang chờ người kia bắt máy</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">Đang gọi cho <span className="font-bold">{calleeName}</span></p>
              <div className="flex justify-center mb-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div></div>
              <button onClick={handleCancelOutgoingCall} className="bg-red-500 text-white py-2 px-6 rounded-full font-semibold hover:bg-red-600">Hủy cuộc gọi</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL CUỘC GỌI ĐẾN --- */}
      {showIncomingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl border border-gray-200 dark:border-gray-700 animate-bounce-small">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-4 border-4 border-pink-500">
                <img src={callerImage || "/default-avatar.png"} alt={callerName} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = "/default-avatar.png"; }} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Cuộc gọi Video đến</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6"><span className="font-bold">{callerName}</span> đang gọi cho bạn...</p>
              <div className="flex space-x-4">
                <button onClick={handleDeclineCall} className="flex-1 bg-red-500 text-white py-3 rounded-full hover:bg-red-600">Từ chối</button>
                <button onClick={handleAcceptCall} className="flex-1 bg-green-500 text-white py-3 rounded-full hover:bg-green-600">Nghe máy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- GIAO DIỆN CUỘC GỌI VIDEO --- */}
      {showActiveCall && activeCallId && (
        <div className="fixed inset-0 z-[9999]">
          <VideoCall
            callId={activeCallId}
            onCallEnd={handleCallEnd}
            isIncoming={!showOutgoingCall}
            otherUserId={callerName || calleeName}
            isAcceptedCall={true}
          />
        </div>
      )}

      {/* --- MODAL KẾT THÚC --- */}
      {showCallEnded && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999]">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8">
            <h3 className="text-xl text-center text-gray-900 dark:text-white">Cuộc gọi kết thúc</h3>
          </div>
        </div>
      )}
    </>
  );
}