"use client";

import { useEffect, useState } from "react";
import { StreamChat, Event } from "stream-chat";
import { getStreamUserToken } from "@/lib/actions/stream";
import VideoCall from "./VideoCall";

// Interface cho dữ liệu cuộc gọi đính kèm trong tin nhắn
interface VideoCallCustomData extends Record<string, unknown> {
  call_id?: string;
  caller_id?: string;
  caller_name?: string;
  caller_image?: string;
  text?: string;
}

export default function GlobalCallManager() {
  const [incomingCallId, setIncomingCallId] = useState<string>("");
  const [callerId, setCallerId] = useState<string>("");
  const [callerName, setCallerName] = useState<string>("");
  const [callerImage, setCallerImage] = useState<string>("");
  const [showIncomingCall, setShowIncomingCall] = useState(false);

  // Outgoing call states
  const [outgoingCallId, setOutgoingCallId] = useState<string>("");
  const [calleeName, setCalleeName] = useState<string>("");
  const [showOutgoingCall, setShowOutgoingCall] = useState(false);

  const [activeCallId, setActiveCallId] = useState<string>("");
  const [showActiveCall, setShowActiveCall] = useState(false);

  const [client, setClient] = useState<StreamChat | null>(null);

  useEffect(() => {
    let chatClient: StreamChat | null = null;

    // 1. Khai báo handler ở scope của useEffect để cleanup function có thể gọi được
    const handleNewEvent = (event: Event) => {
      if (event.message?.text?.includes("📹 Video call invitation")) {
        const customData = event.message as unknown as VideoCallCustomData;
        // Lưu ý: Lúc này chatClient đã được gán giá trị ở init
        const currentUserId = chatClient?.userID;

        if (customData.caller_id && customData.caller_id !== currentUserId) {
          setIncomingCallId(customData.call_id || "");
          setCallerId(customData.caller_id);
          setCallerName(customData.caller_name || event.user?.name || "Ai đó");
          setCallerImage(customData.caller_image || event.user?.image || "");
          setShowIncomingCall(true);
        }
      }

      // Handle call acceptance for outgoing calls
      if (event.message?.text?.includes("📹 Call accepted - joining now")) {
        const customData = event.message as unknown as VideoCallCustomData;
        const currentUserId = chatClient?.userID;

        if (customData.call_id && customData.acceptor_id && customData.acceptor_id !== currentUserId && customData.call_accepted) {
          // This is for our outgoing call
          if (customData.call_id === outgoingCallId) {
            console.log("Outgoing call accepted by receiver:", customData.call_id);
            handleOutgoingCallAccepted(customData.call_id);
          }
        }
      }
    };

    async function initGlobalListener() {
      try {
        const { token, userId, userName, userImage } = await getStreamUserToken();

        if (!userId) return;

        chatClient = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY!);

        if (chatClient.userID !== userId) {
          await chatClient.connectUser(
            {
              id: userId,
              name: userName,
              image: userImage,
            },
            token
          );
        }

        // 2. Đăng ký sự kiện
        chatClient.on("notification.message_new", handleNewEvent);
        chatClient.on("message.new", handleNewEvent);

        setClient(chatClient);
      } catch (error) {
        console.error("Global Call Listener Error:", error);
      }
    }

    initGlobalListener();

    // 3. Cleanup: Hủy đúng hàm handler đã đăng ký
    return () => {
      if (chatClient) {
        chatClient.off("notification.message_new", handleNewEvent);
        chatClient.off("message.new", handleNewEvent);
      }
    };
  }, []);

  const handleAcceptCall = async () => {
    if (client && incomingCallId) {
      try {
        const currentUserId = client.userID!;
        const otherUserId = callerId;

        const sortedIds = [currentUserId, otherUserId].sort();
        const combinedIds = sortedIds.join("_");

        let hash = 0;
        for (let i = 0; i < combinedIds.length; i++) {
          const char = combinedIds.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash;
        }

        const channelId = `match_${Math.abs(hash).toString(36)}`;
        const channel = client.channel("messaging", channelId);

        const acceptanceData = {
          text: `📹 Call accepted - joining now`,
          call_id: incomingCallId,
          acceptor_id: currentUserId,
          call_accepted: true,
        };

        await channel.sendMessage(acceptanceData);
        console.log("Sent call acceptance message from GlobalCallManager");
      } catch (error) {
        console.error("Error sending acceptance message:", error);
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

  const handleDeclineCall = () => {
    setShowIncomingCall(false);
    setIncomingCallId("");
    setCallerId("");
    setCallerName("");
    setCallerImage("");
  };

  // Function to initiate outgoing call (called from other components)
  const initiateCall = (callId: string, calleeName: string) => {
    setOutgoingCallId(callId);
    setCalleeName(calleeName);
    setShowOutgoingCall(true);
  };

  const handleCancelOutgoingCall = () => {
    setShowOutgoingCall(false);
    setOutgoingCallId("");
    setCalleeName("");
  };

  const handleOutgoingCallAccepted = (callId: string) => {
    setShowOutgoingCall(false);
    setActiveCallId(callId);
    setShowActiveCall(true);
    setOutgoingCallId("");
    setCalleeName("");
  };

  const handleCallerVideoCall = (callId: string) => {
    setActiveCallId(callId);
    setShowActiveCall(true);
  };

  const handleCallEnd = () => {
    setShowActiveCall(false);
    setActiveCallId("");
  };

  // Expose functions to window for global access
  useEffect(() => {
    (window as any).globalCallManager = { initiateCall, handleCallerVideoCall };
    return () => {
      delete (window as any).globalCallManager;
    };
  }, []);

  if (!showIncomingCall && !showOutgoingCall && !showActiveCall) return null;

  return (
    <>
      {/* --- MODAL CUỘC GỌI ĐI (OUTGOING CALL) --- */}
      {showOutgoingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl animate-pulse-fade border border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Đang chờ người kia bắt máy
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Đang gọi cho <span className="font-bold">{calleeName}</span>
              </p>
              <div className="flex justify-center mb-4">
                <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce mx-2" style={{ animationDelay: "0.1s" }}></div>
                <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleCancelOutgoingCall}
                  className="flex-1 bg-red-500 text-white py-3 px-6 rounded-full font-semibold hover:bg-red-600 transition-colors duration-200"
                >
                  Hủy cuộc gọi
                </button>
                <button
                  onClick={handleCancelOutgoingCall}
                  className="bg-gray-700 text-white py-3 px-6 rounded-full font-semibold hover:bg-gray-600 transition-colors duration-200"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL THÔNG BÁO CUỘC GỌI ĐẾN --- */}
      {showIncomingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl animate-pulse-fade border border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-4 border-4 border-pink-500 relative">
                <img
                  src={callerImage || "/default-avatar.png"}
                  alt={callerName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/default-avatar.png";
                  }}
                />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Cuộc gọi Video đến
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                <span className="font-bold">{callerName}</span> đang gọi cho bạn...
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={handleDeclineCall}
                  className="flex-1 bg-red-500 text-white py-3 px-6 rounded-full font-semibold hover:bg-red-600 transition-colors duration-200"
                >
                  Từ chối
                </button>
                <button
                  onClick={handleAcceptCall}
                  className="flex-1 bg-green-500 text-white py-3 px-6 rounded-full font-semibold hover:bg-green-600 transition-colors duration-200"
                >
                  Nghe máy
                </button>
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
            isIncoming={!showOutgoingCall} // If it was an outgoing call that got accepted, it's not incoming
            otherUserId={callerName || calleeName}
          />
        </div>
      )}
    </>
  );
}
