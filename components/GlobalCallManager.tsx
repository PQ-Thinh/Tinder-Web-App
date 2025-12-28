"use client";

import { useEffect, useState } from "react";
import { StreamChat, Event, Channel } from "stream-chat";
import { getStreamUserToken } from "@/lib/actions/stream";
import VideoCall from "./VideoCall";

declare global {
  interface Window {
    globalCallManager?: {
      // Cập nhật: Thêm tham số calleeUserId
      initiateCall: (callId: string, calleeName: string, calleeUserId: string) => void;
      handleCallerVideoCall: (callId: string) => void;
      handleOutgoingCallAccepted: (callId?: string) => void;
      handleOutgoingCallDeclined: () => void;
    };
    currentChatChannel?: Channel; // Vẫn giữ để backward compatible nhưng không dùng trong logic call nữa
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
  // Incoming call states
  const [incomingCallId, setIncomingCallId] = useState<string>("");
  const [callerId, setCallerId] = useState<string>("");
  const [callerName, setCallerName] = useState<string>("");
  const [callerImage, setCallerImage] = useState<string>("");
  const [showIncomingCall, setShowIncomingCall] = useState(false);

  // Outgoing call states
  const [outgoingCallId, setOutgoingCallId] = useState<string>("");
  const [calleeName, setCalleeName] = useState<string>("");
  // MỚI: Lưu ID người mình đang gọi để gửi tin hủy nếu cần
  const [calleeId, setCalleeId] = useState<string>("");
  const [showOutgoingCall, setShowOutgoingCall] = useState(false);

  // Active call states
  const [activeCallId, setActiveCallId] = useState<string>("");
  const [showActiveCall, setShowActiveCall] = useState(false);
  const [showCallEnded, setShowCallEnded] = useState(false);

  const [client, setClient] = useState<StreamChat | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [updateCounter, setUpdateCounter] = useState(0);

  // --- HÀM MỚI: Lấy channel instance an toàn ---
  const getChannelInstance = async (targetUserId: string) => {
    if (!client || !client.userID || !targetUserId) return null;

    // Nếu đang có channel global đúng là channel cần tìm thì dùng luôn (tối ưu)
    if (window.currentChatChannel &&
      window.currentChatChannel.state.members[targetUserId]) {
      return window.currentChatChannel;
    }

    // Nếu không, tạo instance channel mới để gửi tin
    const channel = client.channel("messaging", {
      members: [client.userID, targetUserId],
    });

    if (!channel.initialized) {
      await channel.watch();
    }
    return channel;
  };

  useEffect(() => {
    let chatClient: StreamChat | null = null;

    const handleGlobalMessage = (event: Event) => {
      const customData = event.message as unknown as VideoCallCustomData;
      const currentUserId = chatClient?.userID;

      // Handle incoming call invitation (for receiver)
      if (event.message?.text?.includes("📹 Video call invitation")) {
        if (customData.caller_id && customData.caller_id !== currentUserId) {
          setIncomingCallId(customData.call_id || "");
          setCallerId(customData.caller_id);
          setCallerName(customData.caller_name || event.user?.name || "Ai đó");
          setCallerImage(customData.caller_image || event.user?.image || "");
          setShowIncomingCall(true);
        }
      }

      // Handle call cancelled (for receiver)
      if (event.message?.text?.includes("📹 Call cancelled")) {
        const cancelledCallId = customData.call_id;

        // Logic kiểm tra ID cuộc gọi để đóng đúng modal
        if (cancelledCallId) {
          // Tắt incoming modal nếu đang hiện
          setShowIncomingCall((prev) => {
            if (prev && incomingCallId === cancelledCallId) return false;
            return prev;
          });
          // Reset state nếu trùng khớp
          if (incomingCallId === cancelledCallId) {
            setIncomingCallId("");
            setCallerId("");
            setCallerName("");
            setCallerImage("");
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
  }, [incomingCallId]); // Thêm incomingCallId vào dependency để logic cancel hoạt động đúng

  // --- SỬA HÀM ACCEPT: Dùng getChannelInstance ---
  const handleAcceptCall = async () => {
    // Không dùng window.currentChatChannel nữa
    const channel = await getChannelInstance(callerId);

    if (channel && incomingCallId && client) {
      try {
        const currentUserId = client.userID!;
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

  // --- SỬA HÀM DECLINE: Dùng getChannelInstance ---
  const handleDeclineCall = async () => {
    const channel = await getChannelInstance(callerId);

    if (channel && incomingCallId && client) {
      try {
        const currentUserId = client.userID!;
        const declineData = {
          text: `📹 Call declined`,
          call_id: incomingCallId,
          decliner_id: currentUserId,
          call_declined: true,
        };
        await channel.sendMessage(declineData);
        console.log("Sent call decline message from GlobalCallManager");
      } catch (error) {
        console.error("Error sending decline message:", error);
      }
    }

    setShowIncomingCall(false);
    setIncomingCallId("");
    setCallerId("");
    setCallerName("");
    setCallerImage("");
  };

  // --- CẬP NHẬT HÀM INITIATE: Nhận thêm calleeUserId ---
  const initiateCall = (callId: string, calleeName: string, calleeUserId: string) => {
    setOutgoingCallId(callId);
    setCalleeName(calleeName);
    setCalleeId(calleeUserId); // Lưu lại ID để dùng khi hủy
    setShowOutgoingCall(true);
  };

  // --- SỬA HÀM CANCEL: Dùng getChannelInstance với calleeId ---
  const handleCancelOutgoingCall = async () => {
    const channel = await getChannelInstance(calleeId);

    if (channel && outgoingCallId && client) {
      try {
        const currentUserId = client.userID!;
        const cancelData = {
          text: `📹 Call cancelled`,
          call_id: outgoingCallId,
          canceller_id: currentUserId,
          call_cancelled: true,
        };
        await channel.sendMessage(cancelData);
        console.log("Sent call cancelled message");
      } catch (error) {
        console.error("Error sending cancel message:", error);
      }
    } else {
      console.warn("Could not send cancel message: Channel or Client missing");
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
      setUpdateCounter(prev => prev + 1);
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
  }, [client, outgoingCallId, calleeId]); // Thêm dependencies để hàm initiateCall luôn mới nhất

  if (!showIncomingCall && !showOutgoingCall && !showActiveCall && !showCallEnded) return null;

  return (
    <>
      {/* --- MODAL CUỘC GỌI ĐI --- */}
      {showOutgoingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] backdrop-blur-sm">
          {/* Code UI giữ nguyên */}
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL CUỘC GỌI ĐẾN --- */}
      {showIncomingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] backdrop-blur-sm">
          {/* Code UI giữ nguyên */}
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
            isIncoming={!showOutgoingCall}
            otherUserId={callerName || calleeName}
            isAcceptedCall={true}
          />
        </div>
      )}

      {/* --- MODAL CUỘC GỌI ĐÃ KẾT THÚC --- */}
      {showCallEnded && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] backdrop-blur-sm">
          {/* Code UI giữ nguyên */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl animate-pulse-fade border border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Cuộc gọi đã kết thúc
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Cảm ơn bạn đã sử dụng tính năng video call.
              </p>
              <button
                onClick={() => setShowCallEnded(false)}
                className="bg-pink-500 text-white py-3 px-6 rounded-full font-semibold hover:bg-pink-600 transition-colors duration-200"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}