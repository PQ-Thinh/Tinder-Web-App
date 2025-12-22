"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMessage } from "@/contexts/message-context";
import { useRef, useState, useEffect } from "react"; // Thêm useState, useEffect

// GSAP
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

// MUI Icons
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';

// Định nghĩa kiểu dữ liệu cho trái tim nền
interface FloatingHeart {
  id: number;
  left: number;      // Vị trí ngang %
  fontSize: number;  // Kích thước px
  delay: number;     // Độ trễ animation
  duration: number;  // Tốc độ bay
}

export default function ChatPage() {
  const router = useRouter();
  const { chatList, isLoadingChats } = useMessage();

  const containerRef = useRef<HTMLDivElement>(null);
  const heartsRef = useRef<HTMLDivElement>(null);

  // 1. TẠO STATE ĐỂ LƯU VỊ TRÍ NGẪU NHIÊN (Thay vì random trực tiếp)
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);

  // 2. TẠO DỮ LIỆU NGẪU NHIÊN 1 LẦN DUY NHẤT KHI MOUNT
  useEffect(() => {
    // Sử dụng setTimeout để đẩy việc set state sang chu kỳ tiếp theo
    // Điều này giúp tránh lỗi "synchronous setState" của linter
    const timer = setTimeout(() => {
      const generatedHearts = Array.from({ length: 15 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,          // Random 0-100%
        fontSize: Math.random() * 30 + 15,  // Random 15-45px
        delay: Math.random() * 10,          // Random delay 0-10s
        duration: Math.random() * 15 + 15   // Random duration 15-30s
      }));
      setHearts(generatedHearts);
    }, 0);

    // Cleanup timeout nếu component unmount nhanh
    return () => clearTimeout(timer);
  }, []);
  // --- GSAP ANIMATION ---
  useGSAP(() => {
    // A. Hiệu ứng danh sách chat (Stagger)
    if (!isLoadingChats && chatList.length > 0) {
      gsap.set(".chat-item", { y: 30, opacity: 0, scale: 0.95 });
      gsap.to(".chat-item", {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.6,
        stagger: 0.1,
        ease: "power2.out",
        clearProps: "transform"
      });
    }

    // B. Hiệu ứng nền: Trái tim ĐỎ bay
    // Lưu ý: Chỉ chạy khi state hearts đã được tạo
    if (heartsRef.current && hearts.length > 0) {
      const heartElements = gsap.utils.toArray<HTMLElement>('.floating-heart');
      heartElements.forEach((heart, i) => {
        // Lấy thông số từ state (hoặc để GSAP random đè lên nếu muốn)
        // Ở đây ta dùng GSAP random cho chuyển động để mượt mà hơn
        gsap.to(heart, {
          y: -1000,
          x: "random(-50, 50)",
          rotation: "random(-90, 90)",
          // Sử dụng duration từ state hoặc random của GSAP đều được
          duration: "random(15, 25)",
          repeat: -1,
          ease: "none",
          // Dùng delay từ state để các tim không xuất hiện cùng lúc
          delay: hearts[i]?.delay || Math.random() * 5
        });
      });
    }
  }, { dependencies: [isLoadingChats, chatList, hearts], scope: containerRef }); // Thêm hearts vào dependencies


  // Hàm helper format time
  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    // ... (Giữ nguyên logic cũ của bạn)
    const MINUTE = 60;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    const YEAR = 365 * DAY;

    if (diffInSeconds < 30) return "Vừa xong";
    if (diffInSeconds < MINUTE) return `${diffInSeconds} giây trước`;
    if (diffInSeconds < HOUR) return `${Math.floor(diffInSeconds / MINUTE)} phút trước`;
    if (diffInSeconds < DAY) return `${Math.floor(diffInSeconds / HOUR)} giờ trước`;
    if (diffInSeconds < WEEK) return `${Math.floor(diffInSeconds / DAY)} ngày trước`;
    if (diffInSeconds < MONTH) return `${Math.floor(diffInSeconds / WEEK)} tuần trước`;
    if (diffInSeconds < YEAR) return `${Math.floor(diffInSeconds / MONTH)} tháng trước`;
    return `${Math.floor(diffInSeconds / YEAR)} năm trước`;
  }

  const defaultAvatarUrl = "/default-avatar.png";

  const handleAvatarClick = (e: React.MouseEvent, userId: string) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/profile/${userId}`);
  };

  // 1. Loading State
  if (isLoadingChats) {
    return (
      <div
        className="h-full min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #FFDEE9 0%, #B5FFFC 100%)" }}
      >
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto">
            <FavoriteRoundedIcon className="text-red-400 animate-ping absolute inset-0 w-full h-full" />
            <FavoriteRoundedIcon className="text-white relative w-full h-full animate-bounce" />
          </div>
          <p className="mt-4 text-red-600 font-bold animate-pulse">
            Đang tải hộp thư...
          </p>
        </div>
      </div>
    );
  }

  // 2. Render UI
  return (
    <div
      ref={containerRef}
      className="min-h-screen relative overflow-x-hidden pb-20"
      style={{ background: "linear-gradient(135deg, #FFDEE9 0%, #B5FFFC 100%)" }}
    >
      {/* Background Floating Hearts - ĐÃ SỬA LỖI IMPURE */}
      <div ref={heartsRef} className="fixed inset-0 pointer-events-none z-0">
        {/* Render từ state 'hearts' thay vì [...Array(15)] */}
        {hearts.map((heart) => (
          <div
            key={heart.id}
            className="floating-heart absolute text-red-500/20"
            style={{
              // Sử dụng giá trị đã random từ state
              left: `${heart.left}%`,
              bottom: '-60px',
              fontSize: `${heart.fontSize}px`
            }}
          >
            <FavoriteRoundedIcon fontSize="inherit" />
          </div>
        ))}
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800 mb-2 drop-shadow-sm">
            Tin nhắn <span className="text-red-500">Yêu Thương</span>
          </h1>
          <p className="text-slate-600 font-medium">
            Bạn có <span className="text-red-600 font-bold">{chatList.length}</span> cuộc trò chuyện
          </p>
        </header>

        {chatList.length === 0 ? (
          <div className="text-center max-w-md mx-auto p-10 bg-white/60 backdrop-blur-md rounded-[2rem] shadow-xl border border-white/50">
            <div className="w-24 h-24 bg-gradient-to-tr from-red-400 to-pink-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg ring-4 ring-white/60">
              <span className="text-4xl">💌</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-4">
              Chưa có tin nhắn nào
            </h2>
            <p className="text-slate-600 mb-8 font-medium">
              Đừng để hộp thư trống trải. Hãy bắt đầu vuốt để tìm người phù hợp và trò chuyện ngay!
            </p>
            <Link
              href="/matches"
              className="inline-flex items-center bg-gradient-to-r from-red-500 to-pink-600 text-white font-bold py-3.5 px-8 rounded-full hover:from-red-600 hover:to-pink-700 transition-all duration-300 shadow-lg hover:shadow-red-300/50 hover:-translate-y-1 active:scale-95"
            >
              Bắt đầu vuốt
            </Link>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <div className="grid space-y-4">
              {chatList.map((chat, key) => (
                <Link
                  key={key}
                  href={`/chat/${chat.id}`}
                  className="chat-item opacity-0 group block bg-white/60 dark:bg-gray-800/80 backdrop-blur-md rounded-[2rem] p-4 sm:p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-white/50 hover:border-red-300 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-100/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                  <div className="flex items-center space-x-4 relative z-10">
                    <div
                      className="relative flex-shrink-0 cursor-pointer z-10"
                      onClick={(e) => handleAvatarClick(e, chat.user.id)}
                    >
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-[3px] border-white dark:border-gray-700 shadow-md group-hover:border-red-300 transition-colors duration-300">
                        <div>
                          <img
                            src={chat.user.avatar_url || defaultAvatarUrl}
                            alt={chat.user.full_name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        </div>

                        {chat.user.is_online ? (
                          <div className="absolute bottom-1 right-1 flex items-center justify-center z-20">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping"></span>
                            <div className="relative w-4 h-4 bg-green-500 rounded-full border-[2.5px] border-white dark:border-gray-800 shadow-[0_0_10px_rgba(34,197,94,0.6)]"></div>
                          </div>
                        ) : (
                          chat.user.last_active && (
                            <div className="absolute bottom-1 right-1 flex items-center justify-center z-20">
                              <div className="relative w-4 h-4 bg-gray-400 rounded-full border-[2.5px] border-white dark:border-gray-800 shadow-sm"></div>
                            </div>
                          )
                        )}

                        {chat.unreadCount > 0 && (
                          <div className="absolute -top-1 -right-1 bg-gradient-to-r from-red-600 to-pink-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold shadow-md animate-bounce ring-2 ring-white">
                            {chat.unreadCount}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 ml-2">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <h3
                            className="text-lg font-bold text-slate-800 dark:text-white truncate hover:text-red-600 cursor-pointer transition-colors z-10 relative"
                            onClick={(e) => handleAvatarClick(e, chat.user.id)}
                          >
                            {chat.user.full_name}
                          </h3>
                        </div>
                        <span className="text-[12px] text-slate-500 font-medium bg-white/50 px-2 py-0.5 rounded-full">
                          {formatTime(chat.lastMessageTime)}
                        </span>
                      </div>

                      <p className={`text-sm truncate ${chat.unreadCount > 0 ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-600 dark:text-gray-300 font-medium'}`}>
                        {chat.isLastMessageMine && <span className="font-semibold text-slate-500 mr-1">Bạn:</span>}
                        {chat.lastMessage}
                      </p>
                    </div>

                    <div className="flex-shrink-0 text-slate-300 group-hover:text-red-500 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-7 h-7"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.159 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                        />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}