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

  // Dùng Ref để truy cập state mới nhất trong Event Listener mà không cần add vào dependency array
  const incomingCallIdRef = useRef(incomingCallId);
  const showIncomingCallRef = useRef(showIncomingCall);

  // Update Ref khi state thay đổi
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

  // --- 1. HÀM INIT LISTENER (Chạy 1 lần duy nhất) ---
  useEffect(() => {
    let chatClient: StreamChat | null = null;

    const handleGlobalMessage = (event: Event) => {
      // LOG QUAN TRỌNG: Kiểm tra xem GlobalManager có nhận được event không
      // console.log("GlobalCallManager received event:", event.type, event.message?.text);

      const customData = event.message as unknown as VideoCallCustomData;
      const currentUserId = chatClient?.userID;

      // --- LOGIC 1: NHẬN CUỘC GỌI (INVITATION) ---
      if (event.message?.text?.includes("📹 Video call invitation")) {
        // console.log("Detected invitation. Data:", customData, "Current User:", currentUserId);

        if (customData.caller_id && customData.caller_id !== currentUserId) {
          console.log("Setting incoming call state...");
          setIncomingCallId(customData.call_id || "");
          setCallerId(customData.caller_id);
          setCallerName(customData.caller_name || event.user?.name || "Ai đó");
          setCallerImage(customData.caller_image || event.user?.image || "");
          setShowIncomingCall(true);
        } else {
          console.log("Ignored invitation: Caller is self or missing ID");
        }
      }

      // --- LOGIC 2: ĐỐI PHƯƠNG HỦY CUỘC GỌI (CANCELLED) ---
      if (event.message?.text?.includes("📹 Call cancelled")) {
        const cancelledCallId = customData.call_id;
        // Kiểm tra với Ref để lấy giá trị hiện tại chính xác
        if (cancelledCallId && incomingCallIdRef.current === cancelledCallId) {
          console.log("Call cancelled by caller. Closing modal.");
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

        // Singleton instance
        chatClient = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY!);

        // Chỉ connect nếu chưa connect hoặc connect sai user
        if (chatClient.userID !== userId) {
          console.log("GlobalManager connecting user:", userId);
          await chatClient.connectUser(
            { id: userId, name: userName, image: userImage },
            token
          );
        } else {
          // console.log("GlobalManager user already connected:", chatClient.userID);
        }

        // Lắng nghe cả message mới (khi đang chat) và notification (khi ở ngoài)
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
        // console.log("Cleaning up GlobalManager listeners");
        chatClient.off("notification.message_new", handleGlobalMessage);
        chatClient.off("message.new", handleGlobalMessage);
      }
    };
  }, []); // Dependency rỗng -> Chỉ chạy 1 lần khi mount app

  // --- CÁC HÀM XỬ LÝ KHÁC GIỮ NGUYÊN LOGIC ---

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
    // Clear other states...
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
  };

  // --- WINDOW EXPORTS ---
  const initiateCall = (callId: string, calleeName: string, calleeUserId: string) => {
    console.log("Initiating call to:", calleeName, calleeUserId);
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
  };

  const handleOutgoingCallAccepted = (callId?: string) => {
    console.log("Outgoing call accepted!", callId);
    const idToUse = callId || outgoingCallId;
    if (idToUse) {
      setShowOutgoingCall(false);
      setActiveCallId(idToUse);
      setShowActiveCall(true);
      setOutgoingCallId("");
    }
  };

  const handleOutgoingCallDeclined = () => {
    console.log("Outgoing call declined!");
    setShowOutgoingCall(false);
    setOutgoingCallId("");
    // Có thể thêm thông báo Toast ở đây
  };

  const handleCallerVideoCall = (callId: string) => {
    setActiveCallId(callId);
    setShowActiveCall(true);
  };

  const handleCallEnd = () => {
    setShowActiveCall(false);
    setActiveCallId("");
    setShowOutgoingCall(false);
    setShowIncomingCall(false);
    setShowCallEnded(true);
    setTimeout(() => setShowCallEnded(false), 3000);
  };

  // Export functions to window
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
  }, [outgoingCallId]); // Giảm dependencies để tránh re-assign liên tục

  if (!showIncomingCall && !showOutgoingCall && !showActiveCall && !showCallEnded) return null;

  return (
    <>
      {/* --- MODAL UI GIỮ NGUYÊN NHƯ CŨ --- */}
      {showOutgoingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Đang gọi...</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">Người nhận: {calleeName}</p>
              <div className="flex justify-center mb-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div></div>
              <button onClick={handleCancelOutgoingCall} className="bg-red-500 text-white py-2 px-6 rounded-full hover:bg-red-600">Hủy</button>
            </div>
          </div>
        </div>
      )}

      {showIncomingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl border border-gray-200 dark:border-gray-700 animate-bounce-small">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-4 border-4 border-pink-500">
                <img src={callerImage || "/default-avatar.png"} alt={callerName} className="w-full h-full object-cover" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Cuộc gọi đến</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6"><span className="font-bold">{callerName}</span></p>
              <div className="flex space-x-4">
                <button onClick={handleDeclineCall} className="flex-1 bg-red-500 text-white py-3 rounded-full hover:bg-red-600">Từ chối</button>
                <button onClick={handleAcceptCall} className="flex-1 bg-green-500 text-white py-3 rounded-full hover:bg-green-600">Nghe máy</button>
              </div>
            </div>
          </div>
        </div>
      )}

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