"use client";

import { useEffect, useState } from "react";
import {
  Call,
  // Thay đổi: Import các nút riêng lẻ thay vì CallControls
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

interface VideoCallProps {
  callId: string;
  onCallEnd: () => void;
  isIncoming?: boolean;
}

export default function VideoCall({
  callId,
  onCallEnd,
  isIncoming = false,
}: VideoCallProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);

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

        const videoCall = videoClient.call("default", callId);

        await videoCall.join({ create: true });

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
        call.leave();
      }
      if (client) {
        client.disconnectUser();
      }
    };
  }, [callId, hasJoined]);

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

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden">
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <StreamTheme>
            <PaginatedGridLayout groupSize={2} />

            {/* PHẦN SỬA ĐỔI: Thay thế CallControls bằng bộ nút tùy chỉnh */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center z-10">
              <div className="bg-black/40 backdrop-blur-md p-4 rounded-full flex items-center gap-6 border border-white/10 shadow-2xl">
                {/* Nút bật/tắt Micro */}
                <div className="hover:scale-110 transition-transform">
                  <ToggleAudioPublishingButton />
                </div>
                
                {/* Nút Kết thúc cuộc gọi - Được làm nổi bật hơn */}
                <div className="scale-125 mx-2 hover:scale-135 transition-transform">
                  <CancelCallButton onClick={onCallEnd} />
                </div>

                {/* Nút bật/tắt Camera */}
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