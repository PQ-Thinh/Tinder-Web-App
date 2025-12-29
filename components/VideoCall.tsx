"use client";

import { useEffect, useState } from "react";
import {
  Call,
  ToggleAudioPublishingButton,
  ToggleVideoPublishingButton,
  CancelCallButton,
  PaginatedGridLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
} from "@stream-io/video-react-sdk";

import "@stream-io/video-react-sdk/dist/css/styles.css";
import { getStreamVideoToken } from "@/lib/actions/stream";

// --- 1. MỞ RỘNG WINDOW INTERFACE ---
// Giúp TypeScript hiểu window.sendCallEndMessage là hợp lệ
declare global {
  interface Window {
    sendCallEndMessage?: () => Promise<void>;
  }
}

interface VideoCallProps {
  callId: string;
  onCallEnd: () => void;
  isIncoming?: boolean;
  otherUserId?: string;
  showWaitingForParticipant?: boolean;
  isAcceptedCall?: boolean;
}

export default function VideoCall({
  callId,
  onCallEnd,
}: VideoCallProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  // const [participantCount, setParticipantCount] = useState(0); // Có thể dùng ref hoặc state tùy nhu cầu hiển thị

  // State để điều khiển hiển thị UI chờ (nếu cần dùng render)
  const [remoteParticipantJoined, setRemoteParticipantJoined] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // --- 2. KHAI BÁO BIẾN SUBSCRIPTION TẠI ĐÂY ---
    // Để hàm cleanup (return) có thể truy cập được mà không cần hack vào object call
    let callStateSubscription: { unsubscribe: () => void } | undefined;
    let participantSubscription: { unsubscribe: () => void } | undefined;
    let currentCall: Call | undefined;
    let currentClient: StreamVideoClient | undefined;

    async function initializeVideoCall() {
      if (hasJoined) return;

      try {
        setError(null);
        const { token, userId, userName, userImage } = await getStreamVideoToken();

        if (!isMounted) return;

        const videoClient = new StreamVideoClient({
          apiKey: process.env.NEXT_PUBLIC_STREAM_API_KEY!,
          user: {
            id: userId!,
            name: userName,
            image: userImage,
          },
          token,
        });
        currentClient = videoClient;

        if (!isMounted) return;

        const videoCall = videoClient.call("default", callId);
        currentCall = videoCall;

        await videoCall.join({ create: true });

        // Tự động bật cam/mic
        try {
          await videoCall.camera.enable();
          await videoCall.microphone.enable();
        } catch (e) {
          console.warn("Không thể bật camera/mic tự động:", e);
        }

        if (!isMounted) return;

        setClient(videoClient);
        setCall(videoCall);
        setHasJoined(true);

        // --- SUBSCRIBE EVENTS ---

        // 1. Lắng nghe trạng thái cuộc gọi (để biết khi mình rời đi)
        callStateSubscription = videoCall.state.callingState$.subscribe((callingState) => {
          console.log('Call state changed:', callingState);
          if (callingState === 'left') {
            setTimeout(() => {
              // Kiểm tra số lượng người còn lại an toàn
              const participants = videoCall.state.participants || [];
              if (participants.length <= 1) {
                onCallEnd();
              }
            }, 500);
          }
        });

        // 2. Lắng nghe số lượng người tham gia
        let previousCount = 0;
        participantSubscription = videoCall.state.participants$.subscribe((participants) => {
          const currentCount = participants.length;
          console.log('Participants updated:', currentCount);

          // Cập nhật state để UI render lại (nếu cần hiển thị loading)
          if (currentCount >= 2) {
            setRemoteParticipantJoined(true);
          } else {
            setRemoteParticipantJoined(false);
          }

          // Logic tự động ngắt nếu người kia rời đi
          if (previousCount >= 2 && currentCount === 1) {
            console.log('Other participant left');
            onCallEnd();
          }
          previousCount = currentCount;
        });

      } catch (error) {
        console.error("Video call error:", error);
        setError("Không thể kết nối video call");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initializeVideoCall();

    // --- CLEANUP FUNCTION ---
    return () => {
      isMounted = false;

      // Hủy đăng ký events
      if (callStateSubscription) {
        callStateSubscription.unsubscribe();
      }
      if (participantSubscription) {
        participantSubscription.unsubscribe();
      }

      // Rời cuộc gọi & ngắt kết nối client
      if (currentCall) {
        currentCall.leave().catch((err) => console.error("Error leaving call:", err));
      }
      if (currentClient) {
        currentClient.disconnectUser().catch((err) => console.error("Error disconnecting:", err));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]); // Bỏ hasJoined khỏi deps để tránh chạy lại không cần thiết nếu logic đã handle

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-lg">Đang kết nối...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="text-center text-white max-w-md mx-auto p-8 bg-gray-900 rounded-2xl border border-gray-800">
          <h3 className="text-xl font-semibold mb-2 text-red-500">Lỗi cuộc gọi</h3>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={onCallEnd}
            className="bg-gray-700 text-white font-semibold py-2 px-6 rounded-full hover:bg-gray-600 transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    );
  }

  if (!client || !call) {
    return null;
  }

  // Chờ người thứ 2 tham gia mới hiện giao diện video (dựa vào state update từ subscription)
  if (!remoteParticipantJoined) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-lg">Đang chờ người tham gia...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden">
      {/* CSS giữ nguyên */}
      <style jsx>{`
        .str-video__call-controls button:not([data-testid*="microphone"]):not([data-testid*="camera"]):not([data-testid*="leave"]):not([data-testid*="hang-up"]):not([aria-label*="Microphone"]):not([aria-label*="Camera"]):not([aria-label*="Leave"]):not([aria-label*="Hang up"]):not([title*="Microphone"]):not([title*="Camera"]):not([title*="Leave"]):not([title*="Hang up"]) {
          display: none !important;
        }
      `}</style>

      <StreamVideo client={client}>
        <StreamCall call={call}>
          <StreamTheme>
            <PaginatedGridLayout groupSize={2} />

            <div className="absolute bottom-10 left-0 right-0 flex justify-center z-10">
              <div className="bg-black/40 backdrop-blur-md p-4 rounded-full flex items-center gap-6 border border-white/10 shadow-2xl">
                <div className="hover:scale-110 transition-transform">
                  <ToggleAudioPublishingButton />
                </div>

                <div className="scale-125 mx-2 hover:scale-135 transition-transform">
                  <CancelCallButton
                    onClick={async () => {
                      if (window.sendCallEndMessage) {
                        try {
                          await window.sendCallEndMessage();
                        } catch (error) {
                          console.error("Error sending call end message:", error);
                        }
                      }
                      onCallEnd();
                    }}
                  />
                </div>

                <div className="hover:scale-110 transition-transform">
                  <ToggleVideoPublishingButton />
                </div>
              </div>
            </div>
          </StreamTheme>
        </StreamCall>
      </StreamVideo>
    </div>
  );
}