"use client";

import { uploadProfilePhoto } from "@/lib/actions/profile";
import { useRef, useState } from "react";

interface PhotoUploadProps {
    onPhotoUploaded: (url: string) => void;
    variant?: "avatar" | "gallery"; // Thêm prop này
}

export default function PhotoUpload({
    onPhotoUploaded,
    variant = "avatar", // Mặc định là avatar
}: PhotoUploadProps) {
    const [uploading, setUploading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setError("Please select an image file");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError("File size must be less than 5MB");
            return;
        }

        setUploading(true);
        setError(null);

        try {
            // Lưu ý: Bạn có thể cần truyền thêm tham số bucketName vào hàm uploadProfilePhoto nếu muốn
            // Nhưng hiện tại hàm đó đang mặc định xử lý tốt
            const result = await uploadProfilePhoto(file);
            if (result.success && result.url) {
                onPhotoUploaded(result.url);
                setError(null);
            } else {
                setError(result.error ?? "Failed to upload photo.");
            }
        } catch (err) {
            setError("Failed to change photo");
        } finally {
            setUploading(false);
        }
    }

    function handleClick() {
        fileInputRef.current?.click();
    }

    // Styles dựa trên variant
    const containerClass = variant === "avatar"
        ? "absolute bottom-0 right-0"
        : "relative flex items-center justify-center"; // Gallery: Căn giữa tự nhiên

    const buttonClass = `
        ${variant === "avatar" ? "absolute bottom-0 right-0 p-2" : "p-3"} 
        bg-pink-500 text-white rounded-full hover:bg-pink-600 transition-colors duration-200 
        disabled:opacity-50 disabled:cursor-not-allowed shadow-md
    `;

    return (
        <div className={containerClass}>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
            />
            <button
                type="button"
                onClick={handleClick}
                disabled={uploading}
                className={buttonClass}
                title={variant === "avatar" ? "Change avatar" : "Add photo"}
            >
                {uploading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : variant === "avatar" ? (
                    // ICON CAMERA (Cho Avatar)
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                ) : (
                    // ICON PLUS + (Cho Gallery)
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                )}
            </button>
        </div>
    );
}