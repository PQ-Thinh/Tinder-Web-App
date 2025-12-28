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
import { Subscription } from "rxjs"; // Import Subscription từ rxjs (Stream dùng thư viện này)

import "@stream-io/video-react-sdk/dist/css/styles.css";
import { getStreamVideoToken } from "@/lib/actions/stream";

// 1. Định nghĩa type mở rộng để chứa các hàm cleanup
type CallWithCleanup = Call & {
  _callStateUnsubscribe?: Subscription;
  _participantUnsubscribe?: Subscription;
};

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
  isIncoming = false,
  showWaitingForParticipant = false,
  isAcceptedCall = false,
}: VideoCallProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<CallWithCleanup | null>(null); // Sử dụng type mới ở đây
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

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

        if (!isMounted) return;

        // Ép kiểu ngay khi khởi tạo call
        const videoCall = videoClient.call("default", callId) as CallWithCleanup;

        await videoCall.join({ create: true });

        try {
          await videoCall.camera.enable();
          await videoCall.microphone.enable();
        } catch (e) {
          console.warn("Không thể bật camera/mic tự động:", e);
        }

        if (!isMounted) return;

        // Lưu subscription vào biến
        const callStateUnsubscribe = videoCall.state.callingState$.subscribe((callingState) => {
          console.log('Call state changed:', callingState);
          if (callingState === 'left') {
            setTimeout(() => {
              const participants = videoCall.state.participants;
              if (participants.length <= 1) {
                onCallEnd();
              }
            }, 500);
          }
        });

        let currentParticipantCount = 0;
        const participantUnsubscribe = videoCall.state.participants$.subscribe((participants) => {
          setParticipantCount(participants.length);
          if (currentParticipantCount >= 2 && participants.length === 1) {
            onCallEnd();
          }
          currentParticipantCount = participants.length;
        });

        // 2. Gán vào object videoCall một cách an toàn (không cần as any)
        videoCall._callStateUnsubscribe = callStateUnsubscribe;
        videoCall._participantUnsubscribe = participantUnsubscribe;

        setClient(videoClient);
        setCall(videoCall);
        setHasJoined(true);

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

    return () => {
      isMounted = false;
      if (call) {
        // 3. Cleanup an toàn với type mới
        if (call._callStateUnsubscribe) {
          call._callStateUnsubscribe.unsubscribe();
        }
        if (call._participantUnsubscribe) {
          call._participantUnsubscribe.unsubscribe();
        }
        call.leave();
      }
      if (client) {
        client.disconnectUser();
      }
    };
  }, [callId, hasJoined, call, client]); // Thêm call và client vào deps để đảm bảo cleanup đúng

  // ... (Phần render giữ nguyên) ...
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
          <button onClick={onCallEnd} className="bg-gray-700 text-white font-semibold py-2 px-6 rounded-full hover:bg-gray-600 transition-all">
            Đóng
          </button>
        </div>
      </div>
    );
  }

  if (!client || !call) return null;

  if (participantCount < 2) {
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