"use client";

import { UserProfile } from "@/lib/actions/profile";
import { calculateAge } from "@/lib/helpers/calculate-age";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { unmatchUser } from "@/lib/actions/matches";
import { useMessage } from "@/contexts/message-context";
import Link from "next/link";

// --- PROPS & CONSTANTS ---
interface UserProfileViewProps {
    profile: UserProfile;
}

const GENDER_MAP: Record<string, string> = {
    male: "Nam",
    female: "Nữ",
    other: "Khác",
};

export default function UserProfileView({ profile }: UserProfileViewProps) {
    const router = useRouter();
    const { refreshState } = useMessage();

    // State
    const [isUnmatchModalOpen, setIsUnmatchModalOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Handlers
    const handleUnmatch = async () => {
        setIsProcessing(true);
        try {
            const result = await unmatchUser(profile.id);
            if (result.success) {
                if (refreshState) await refreshState();
                router.push("/matches"); // Về trang danh sách
                router.refresh();
            } else {
                alert("Có lỗi xảy ra: " + result.error);
            }
        } catch (error) {
            console.error(error);
            alert("Lỗi kết nối.");
        } finally {
            setIsProcessing(false);
            setIsUnmatchModalOpen(false);
        }
    };

    // Styles tái sử dụng (Glassmorphism)
    const cardClass = "bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-[2rem] shadow-xl border border-white/50 p-6 relative overflow-hidden";

    return (
        <div
            className="min-h-screen pb-20"
            // 1. MÀU NỀN ĐỒNG BỘ
            style={{ background: "linear-gradient(135deg, #FFDEE9 0%, #B5FFFC 100%)" }}
        >
            <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

            <div className="container mx-auto px-4 py-8">

                {/* Header điều hướng */}
                <div className="mb-8">
                    <button
                        onClick={() => router.back()}
                        className="inline-flex items-center px-4 py-2 rounded-full bg-white/40 hover:bg-white/60 backdrop-blur-md text-slate-700 font-bold transition-all shadow-sm hover:shadow-md"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Quay lại
                    </button>
                </div>

                <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* --- CỘT TRÁI: THÔNG TIN CHÍNH (Chiếm 8 phần) --- */}
                    <div className="lg:col-span-8 space-y-8">

                        {/* 1. Main Profile Card */}
                        <div className={cardClass}>
                            {/* Background Decoration */}
                            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-pink-400/20 rounded-full blur-3xl pointer-events-none"></div>

                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
                                {/* Avatar */}
                                <div className="relative flex-shrink-0">
                                    <div className="w-32 h-32 rounded-full p-1 bg-gradient-to-tr from-pink-400 to-rose-400 shadow-lg">
                                        <img
                                            src={profile.avatar_url || "/default-avatar.png"}
                                            alt={profile.full_name}
                                            className="w-full h-full rounded-full object-cover border-4 border-white dark:border-gray-800 bg-white"
                                        />
                                    </div>
                                    {/* Online Status (Chỉ hiện cho người khác xem) */}
                                    {profile.is_online && (
                                        <div className="absolute bottom-2 right-2 w-5 h-5 bg-green-500 border-2 border-white rounded-full animate-pulse shadow-sm" title="Đang online"></div>
                                    )}
                                    {profile.is_verified && (
                                        <div className="absolute top-0 right-0 bg-blue-500 text-white p-1.5 rounded-full border-2 border-white shadow-sm" title="Đã xác minh">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                    )}
                                </div>

                                {/* Info Text */}
                                <div className="flex-1 text-center sm:text-left">
                                    <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-1">
                                        {profile.full_name}, <span className="font-light">{profile.birthdate ? calculateAge(profile.birthdate) : "??"} tuổi</span>
                                    </h1>
                                    <p className="text-pink-600 dark:text-pink-400 font-bold mb-3">@{profile.username}</p>

                                    {profile.display_address && (
                                        <div className="inline-flex items-center justify-center sm:justify-start px-3 py-1 rounded-full bg-white/50 border border-white/60 text-sm text-slate-600 font-medium mb-4">
                                            <span className="mr-1.5 text-red-500">📍</span>
                                            {profile.display_address}
                                        </div>
                                    )}

                                    {/* Tags nhanh (Giới tính, Cung hoàng đạo) */}
                                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                                        <span className="px-3 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                                            {GENDER_MAP[profile.gender || "khác"] || profile.gender}
                                        </span>
                                        {profile.birthdate && (
                                            <span className="px-3 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100">
                                                🎂 {new Date(profile.birthdate).toLocaleDateString("vi-VN")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Bio & Hobbies */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Bio */}
                            <div className={cardClass}>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3 flex items-center">
                                    <span className="bg-yellow-100 text-yellow-600 p-1.5 rounded-lg mr-2 text-sm">📝</span>
                                    Giới thiệu
                                </h3>
                                <p className="text-slate-600 dark:text-gray-300 leading-relaxed italic font-medium">
                                    {profile.bio || "Người dùng này khá kín tiếng..."}
                                </p>
                            </div>

                            {/* Hobbies */}
                            <div className={cardClass}>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3 flex items-center">
                                    <span className="bg-green-100 text-green-600 p-1.5 rounded-lg mr-2 text-sm">🎵</span>
                                    Sở thích
                                </h3>
                                {profile.hobbies && profile.hobbies.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {profile.hobbies.map((hobby) => (
                                            <span key={hobby.id} className="inline-flex items-center px-3 py-1.5 rounded-full text-sm bg-white/70 text-pink-700 dark:bg-gray-700 dark:text-pink-300 border border-pink-100 font-semibold shadow-sm">
                                                <span className="mr-1.5">{hobby.icon}</span> {hobby.name}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-slate-400 text-sm italic">Chưa cập nhật sở thích.</p>
                                )}
                            </div>
                        </div>

                        {/* 3. Photo Gallery (Lớn) */}
                        <div className={cardClass}>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center">
                                <span className="bg-purple-100 text-purple-600 p-2 rounded-lg mr-3 shadow-sm">📸</span>
                                Thư viện ảnh
                            </h3>

                            {profile.photos && profile.photos.length > 0 ? (
                                <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth hide-scrollbar">
                                    {profile.photos.map((photo, index) => (
                                        <div key={index} className="flex-none w-[200px] aspect-[2/3] rounded-2xl overflow-hidden shadow-md snap-center border-[3px] border-white dark:border-gray-700 relative group">
                                            <img
                                                src={photo}
                                                alt={`Gallery ${index}`}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />
                                            {/* Gradient overlay */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 text-center border-2 border-dashed border-slate-300 rounded-2xl">
                                    <p className="text-slate-400 font-medium">Người dùng này chưa đăng thêm ảnh nào.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* --- CỘT PHẢI: ACTION BAR (Chiếm 4 phần) --- */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* Action Card */}
                        <div className={`${cardClass} sticky top-24`}>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Tương tác</h3>

                            <div className="space-y-3">
                                {/* Nút Nhắn tin */}
                                <Link
                                    href={`/chat/${profile.id}`}
                                    className="flex items-center justify-center w-full py-4 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold text-lg shadow-lg hover:shadow-pink-300/50 hover:-translate-y-1 transition-all duration-300"
                                >
                                    <span className="mr-2">💬</span> Nhắn tin ngay
                                </Link>

                                {/* Nút Unmatch */}
                                <button
                                    onClick={() => setIsUnmatchModalOpen(true)}
                                    className="flex items-center justify-center w-full py-4 rounded-2xl border-2 border-slate-200 bg-white/50 text-slate-500 font-bold hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all duration-300"
                                >
                                    <span className="mr-2">💔</span> Bỏ tương hợp
                                </button>
                            </div>

                            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-gray-700 text-center">
                                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Thời gian tham gia</p>
                                <p className="text-slate-600 font-bold mt-1">
                                    Tháng {new Date(profile.created_at).getMonth() + 1}, {new Date(profile.created_at).getFullYear()}
                                </p>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* --- MODAL UNMATCH (Style kính mờ) --- */}
            {isUnmatchModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setIsUnmatchModalOpen(false)}></div>

                    <div className="relative bg-white/90 dark:bg-gray-800 backdrop-blur-xl rounded-[2rem] shadow-2xl p-8 max-w-sm w-full transform transition-all scale-100 border border-white/50 animate-bounce-in">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-inner">
                                💔
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                                Ngừng kết nối?
                            </h3>
                            <p className="text-slate-500 mb-6 text-sm font-medium">
                                Bạn sẽ không còn thấy <strong>{profile.full_name}</strong> trong danh sách và cuộc trò chuyện sẽ bị xóa.
                            </p>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleUnmatch}
                                    disabled={isProcessing}
                                    className="w-full py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-lg shadow-red-200 transition-all disabled:opacity-50"
                                >
                                    {isProcessing ? "Đang xử lý..." : "Xác nhận hủy"}
                                </button>
                                <button
                                    onClick={() => setIsUnmatchModalOpen(false)}
                                    className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                                >
                                    Suy nghĩ lại
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}