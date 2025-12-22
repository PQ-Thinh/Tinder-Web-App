"use client";

import PhotoUpload from "@/components/PhotoUpload";
import {
    getCurrentUserProfile,
    updateUserProfile,
    getAllHobbies,
    UserProfile
} from "@/lib/actions/profile";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// --- INTERFACES ---
interface Hobby {
    id: string;
    name: string;
    icon: string;
}

export interface UserPreferences {
    age_range: {
        min: number;
        max: number;
    };
    distance: number;
    gender_preference: string[];
}

interface ProfileFormData {
    full_name: string;
    username: string;
    bio: string;
    gender: "male" | "female" | "other";
    birthdate: string;
    avatar_url: string;
    photos: string[];
    display_address: string;
    latitude: number | null;
    longitude: number | null;
    hobbiesIds: string[];
    preferences: UserPreferences;
}

export default function EditProfilePage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProfileFormData, boolean>>>({});
    const [ageError, setAgeError] = useState<string | null>(null);

    const router = useRouter();
    const [availableHobbies, setAvailableHobbies] = useState<Hobby[]>([]);

    const [formData, setFormData] = useState<ProfileFormData>({
        full_name: "",
        username: "",
        bio: "",
        gender: "male",
        birthdate: "",
        avatar_url: "",
        photos: [],
        display_address: "",
        latitude: null,
        longitude: null,
        hobbiesIds: [],
        preferences: {
            age_range: { min: 18, max: 50 },
            distance: 25,
            gender_preference: []
        }
    });

    useEffect(() => {
        async function loadData() {
            try {
                const [hobbiesData, profileData] = await Promise.all([
                    getAllHobbies(),
                    getCurrentUserProfile()
                ]);

                if (hobbiesData && hobbiesData.length > 0) {
                    setAvailableHobbies(hobbiesData);
                }

                if (profileData) {
                    const safeGender = ["male", "female", "other"].includes(profileData.gender || "other")
                        ? (profileData.gender as "male" | "female" | "other")
                        : "male";

                    setFormData({
                        full_name: profileData.full_name || "",
                        username: profileData.username || "",
                        bio: profileData.bio || "",
                        gender: safeGender,
                        birthdate: profileData.birthdate || "",
                        avatar_url: profileData.avatar_url || "",
                        display_address: profileData.display_address || "",
                        latitude: profileData.latitude || null,
                        longitude: profileData.longitude || null,
                        hobbiesIds: Array.isArray(profileData.hobbiesIds) ? profileData.hobbiesIds : [],
                        photos: profileData.photos || [],
                        preferences: (profileData.preferences as unknown as UserPreferences) || {
                            age_range: { min: 18, max: 50 },
                            distance: 25,
                            gender_preference: []
                        }
                    });
                }
            } catch {
                setError("Không thể tải thông tin hồ sơ.");
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // --- HANDLERS ---
    const updatePreference = <K extends keyof UserPreferences>(field: K, value: UserPreferences[K]) => {
        setFormData(prev => ({ ...prev, preferences: { ...prev.preferences, [field]: value } }));
    };

    const updateAgeRange = (type: 'min' | 'max', value: number) => {
        if (value > 50) value = 50;

        let newError = null;
        const otherValue = type === 'min'
            ? formData.preferences.age_range.max
            : formData.preferences.age_range.min;

        if (type === 'min') {
            if (value > otherValue) {
                newError = "Độ tuổi tối thiểu không được lớn hơn độ tuổi tối đa.";
            }
        } else {
            if (value < otherValue) {
                newError = "Độ tuổi tối đa không được nhỏ hơn độ tuổi tối thiểu.";
            }
        }

        if (value >= 18 && !newError) setAgeError(null);
        else if (newError) setAgeError(newError);

        setFormData(prev => ({
            ...prev,
            preferences: {
                ...prev.preferences,
                age_range: { ...prev.preferences.age_range, [type]: value }
            }
        }));
    };

    const handleAgeBlur = (type: 'min' | 'max') => {
        let value = formData.preferences.age_range[type];
        if (isNaN(value) || value < 18) {
            value = 18;
            updateAgeRange(type, value);
        }
    };

    const toggleGenderPref = (gender: string) => {
        setFormData(prev => {
            const current = prev.preferences.gender_preference || [];
            const updated = current.includes(gender) ? current.filter(g => g !== gender) : [...current, gender];
            return { ...prev, preferences: { ...prev.preferences, gender_preference: updated } };
        });
    };

    const toggleHobby = (hobbyId: string) => {
        setFormData((prev) => {
            const exists = prev.hobbiesIds.includes(hobbyId);
            let newHobbies;
            if (exists) {
                newHobbies = prev.hobbiesIds.filter((id) => id !== hobbyId);
            } else {
                if (prev.hobbiesIds.length >= 5) {
                    alert("Bạn chỉ được chọn tối đa 5 sở thích!");
                    return prev;
                }
                newHobbies = [...prev.hobbiesIds, hobbyId];
            }
            return { ...prev, hobbiesIds: newHobbies };
        });
    };

    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            setError("Trình duyệt không hỗ trợ định vị.");
            return;
        }
        setLocationLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                let addressName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
                        { headers: { 'User-Agent': 'TinderCloneApp/1.0' } }
                    );
                    const data = await res.json();
                    if (data && data.address) {
                        const city = data.address.city || data.address.town || data.address.state || "";
                        const country = data.address.country || "";
                        addressName = [city, country].filter(Boolean).join(", ");
                    }
                } catch (err) { console.warn(err); }
                setFormData((prev) => ({ ...prev, latitude, longitude, display_address: addressName }));
                setFieldErrors(prev => ({ ...prev, display_address: false }));
                setLocationLoading(false);
            },
            () => { setError("Vui lòng cấp quyền truy cập vị trí."); setLocationLoading(false); },
            { timeout: 10000, enableHighAccuracy: true }
        );
    };

    const handleAddPhoto = (url: string) => { if (formData.photos.length >= 5) return; setFormData(prev => ({ ...prev, photos: [...prev.photos, url] })); };
    const handleRemovePhoto = (indexToRemove: number) => { setFormData(prev => ({ ...prev, photos: prev.photos.filter((_, index) => index !== indexToRemove) })); };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (fieldErrors[name as keyof ProfileFormData]) { setFieldErrors(prev => ({ ...prev, [name]: false })); }
    };

    async function handleFormSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setFieldErrors({});

        if (ageError) {
            setError("Vui lòng sửa lỗi độ tuổi trước khi lưu.");
            setSaving(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        const newErrors: Partial<Record<keyof ProfileFormData, boolean>> = {};
        let hasError = false;
        if (!formData.avatar_url) { newErrors.avatar_url = true; hasError = true; }
        if (!formData.full_name.trim()) { newErrors.full_name = true; hasError = true; }
        if (!formData.username.trim()) { newErrors.username = true; hasError = true; }
        if (!formData.gender) { newErrors.gender = true; hasError = true; }
        if (!formData.birthdate) { newErrors.birthdate = true; hasError = true; }
        if (!formData.latitude || !formData.longitude) { newErrors.display_address = true; hasError = true; }
        if (!formData.bio.trim()) { newErrors.bio = true; hasError = true; }

        if (hasError) {
            setFieldErrors(newErrors);
            setError("Chưa hoàn thành hồ sơ. Vui lòng điền các mục được đánh dấu đỏ.");
            setSaving(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        try {
            const result = await updateUserProfile(formData as unknown as Partial<UserProfile>);
            if (result.success) {
                router.push("/profile");
            } else {
                setError(result.error || "Lỗi cập nhật hồ sơ.");
                setSaving(false);
            }
        } catch (err) {
            setError("Lỗi hệ thống. Vui lòng thử lại sau.");
            setSaving(false);
        }
    }

    // --- STYLES ---
    // Style cho Input để nổi bật trên nền kính
    const getInputClass = (fieldName: keyof ProfileFormData) => {
        const baseClass = "w-full px-4 py-3 border rounded-xl focus:ring-2 dark:bg-gray-700 dark:text-white transition-all outline-none font-medium";
        const errorClass = "border-red-400 focus:ring-red-400 bg-red-50 text-red-900 placeholder-red-400";
        const normalClass = "border-white/50 bg-white/50 focus:bg-white focus:border-pink-300 focus:ring-pink-200 dark:border-gray-600 dark:focus:bg-gray-700";
        return `${baseClass} ${fieldErrors[fieldName] ? errorClass : normalClass}`;
    };

    const cardClass = "bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-[2rem] shadow-xl border border-white/50 p-6 sm:p-8 relative overflow-hidden";

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FFDEE9 0%, #B5FFFC 100%)" }}>
            <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div
            className="min-h-screen pb-20 relative"
            // 1. MÀU NỀN ĐÃ ĐƯỢC CHỈNH LẠI
            style={{ background: "linear-gradient(135deg, #FFDEE9 0%, #B5FFFC 100%)" }}
        >

            {/* Loading Overlay khi Save */}
            {saving && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-white/90 dark:bg-gray-800 p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-bounce-in">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-pink-500 mb-4"></div>
                        <p className="text-slate-800 dark:text-white font-bold text-lg">Đang lưu...</p>
                    </div>
                </div>
            )}

            <div className="container mx-auto px-4 py-8">
                <header className="text-center mb-10">
                    <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-2 drop-shadow-sm">Chỉnh Sửa Hồ Sơ</h1>
                    <p className="text-slate-600 dark:text-gray-400 font-medium">Cập nhật thông tin để thu hút nhiều lượt thích hơn</p>
                </header>

                {/* 2. BỐ CỤC: FORM BAO QUANH GRID CÁC THẺ CARD */}
                <form className="max-w-6xl mx-auto" onSubmit={handleFormSubmit}>

                    {error && (
                        <div className="mb-8 p-4 bg-red-100/80 backdrop-blur border border-red-300 text-red-700 rounded-2xl flex items-center gap-3 animate-pulse shadow-sm">
                            <span className="text-xl">⚠️</span>
                            <span className="font-bold">{error}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* --- CỘT TRÁI: THÔNG TIN CÁ NHÂN (8/12) --- */}
                        <div className="lg:col-span-8 space-y-8">

                            {/* CARD 1: Thông tin cơ bản & Avatar */}
                            <div className={cardClass}>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center">
                                    <span className="bg-pink-100 text-pink-600 p-2 rounded-lg mr-3 shadow-sm">👤</span>
                                    Thông tin cá nhân
                                </h3>

                                <div className="flex flex-col md:flex-row gap-8">
                                    {/* Cột Avatar */}
                                    <div className="flex flex-col items-center md:items-start space-y-4">
                                        <div className={`relative w-32 h-32 rounded-full p-1 bg-gradient-to-tr from-pink-400 to-rose-400 shadow-lg ${fieldErrors.avatar_url ? 'ring-4 ring-red-400' : ''}`}>
                                            <div className="w-full h-full rounded-full overflow-hidden border-4 border-white dark:border-gray-800 bg-white">
                                                <img src={formData.avatar_url || "/default-avatar.png"} alt="Profile" className="w-full h-full object-cover" />
                                            </div>
                                            <div className="absolute bottom-0 right-0 transform translate-x-1/4 translate-y-1/4">
                                                <PhotoUpload onPhotoUploaded={(url) => { setFormData((prev) => ({ ...prev, avatar_url: url })); setFieldErrors(prev => ({ ...prev, avatar_url: false })); }} />
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium text-center md:text-left">Chạm vào máy ảnh<br />để thay đổi</p>
                                    </div>

                                    {/* Cột Input */}
                                    <div className="flex-1 w-full space-y-5">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">Tên hiển thị <span className="text-red-500">*</span></label>
                                                <input type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} className={getInputClass('full_name')} placeholder="VD: Nguyễn Văn A" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">Username <span className="text-red-500">*</span></label>
                                                <input type="text" name="username" value={formData.username} onChange={handleInputChange} className={getInputClass('username')} placeholder="@username" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">Giới Tính <span className="text-red-500">*</span></label>
                                                <div className="relative">
                                                    <select name="gender" value={formData.gender} onChange={handleInputChange} className={`${getInputClass('gender')} appearance-none cursor-pointer`}>
                                                        <option value="male">Nam</option>
                                                        <option value="female">Nữ</option>
                                                        <option value="other">Khác</option>
                                                    </select>
                                                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">Sinh nhật <span className="text-red-500">*</span></label>
                                                <input type="date" name="birthdate" value={formData.birthdate} onChange={handleInputChange} className={getInputClass('birthdate')} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CARD 2: Bio & Location */}
                            <div className={cardClass}>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center">
                                    <span className="bg-blue-100 text-blue-600 p-2 rounded-lg mr-3 shadow-sm">📝</span>
                                    Giới thiệu & Vị trí
                                </h3>

                                <div className="space-y-6">
                                    {/* Bio */}
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">Bio (Giới thiệu) <span className="text-red-500">*</span></label>
                                        <textarea name="bio" value={formData.bio} onChange={handleInputChange} rows={4} maxLength={500} className={getInputClass('bio')} placeholder="Hãy viết gì đó thú vị về bản thân..." />
                                        <div className="flex justify-end mt-1">
                                            <span className="text-xs text-slate-400 font-medium">{formData.bio.length}/500</span>
                                        </div>
                                    </div>

                                    {/* Location */}
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">Vị trí hiện tại <span className="text-red-500">*</span></label>
                                        <div className={`flex items-center gap-3 p-2 rounded-xl border ${fieldErrors.display_address ? 'bg-red-50 border-red-300' : 'bg-white/50 border-white/50'}`}>
                                            <div className="flex-1 px-3">
                                                <input
                                                    type="text"
                                                    value={formData.display_address}
                                                    readOnly
                                                    placeholder={fieldErrors.display_address ? "Chưa có vị trí!" : "Nhấn nút cập nhật bên cạnh 👉"}
                                                    className="w-full bg-transparent border-none outline-none text-slate-700 placeholder-slate-400 font-medium cursor-default"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleGetLocation}
                                                disabled={locationLoading}
                                                className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-900 transition flex items-center gap-2 shadow-md"
                                            >
                                                {locationLoading ? (
                                                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                                                ) : (
                                                    <><span>📍</span> Cập nhật</>
                                                )}
                                            </button>
                                        </div>
                                        {fieldErrors.display_address && <p className="text-xs text-red-500 mt-2 font-bold ml-1">Bạn cần cập nhật vị trí để tìm quanh đây.</p>}
                                    </div>
                                </div>
                            </div>

                            {/* CARD 3: Hobbies */}
                            <div className={cardClass}>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center">
                                        <span className="bg-green-100 text-green-600 p-2 rounded-lg mr-3 shadow-sm">🎵</span>
                                        Sở thích
                                    </h3>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${formData.hobbiesIds.length === 5 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white/50 text-slate-500 border-slate-200'}`}>
                                        {formData.hobbiesIds.length}/5
                                    </span>
                                </div>

                                {availableHobbies.length > 0 && (
                                    <div className="flex flex-wrap gap-2.5">
                                        {availableHobbies.map((hobby) => {
                                            const isSelected = formData.hobbiesIds.includes(hobby.id);
                                            return (
                                                <button
                                                    key={hobby.id}
                                                    type="button"
                                                    onClick={() => toggleHobby(hobby.id)}
                                                    className={`px-4 py-2 rounded-full text-sm font-bold border transition-all transform hover:scale-105 active:scale-95 ${isSelected ? "bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-200" : "bg-white/40 text-slate-600 border-white/60 hover:bg-white/80"}`}
                                                >
                                                    <span className="mr-1">{hobby.icon}</span> {hobby.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* --- CỘT PHẢI: GALLERY & SETTINGS (4/12) --- */}
                        <div className="lg:col-span-4 space-y-8">

                            {/* CARD 4: Gallery */}
                            <div className={cardClass}>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center">
                                    <span className="bg-purple-100 text-purple-600 p-2 rounded-lg mr-3 shadow-sm">📸</span>
                                    Thư viện ảnh
                                </h3>
                                <p className="text-sm text-slate-500 mb-4 font-medium">Chọn tối đa 5 ảnh đẹp nhất ({formData.photos.length}/5)</p>

                                <div className="flex gap-3 overflow-x-auto pb-4 snap-x scroll-smooth hide-scrollbar">
                                    {formData.photos.map((photoUrl, index) => (
                                        <div key={index} className="relative flex-none w-[120px] aspect-[2/3] rounded-2xl overflow-hidden border-[3px] border-white shadow-md group snap-start">
                                            <img src={photoUrl} alt="User" className="w-full h-full object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => handleRemovePhoto(index)}
                                                className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 transform hover:scale-110"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ))}

                                    {formData.photos.length < 5 && (
                                        <div className="flex-none w-[120px] aspect-[2/3] rounded-2xl border-2 border-dashed border-slate-300 bg-white/30 hover:bg-white/50 transition flex flex-col items-center justify-center snap-start relative group cursor-pointer">
                                            <div className="mb-2 transform group-hover:scale-110 transition-transform">
                                                <PhotoUpload variant="gallery" onPhotoUploaded={handleAddPhoto} />
                                            </div>
                                            <span className="text-xs text-slate-500 font-bold">Thêm ảnh</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* CARD 5: Preferences */}
                            <div className={cardClass}>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center">
                                    <span className="bg-orange-100 text-orange-600 p-2 rounded-lg mr-3 shadow-sm">🎯</span>
                                    Cài đặt tìm kiếm
                                </h3>

                                {/* Distance */}
                                <div className="mb-8">
                                    <div className="flex justify-between mb-3">
                                        <label className="text-sm font-bold text-slate-700">Khoảng cách tối đa</label>
                                        <span className="text-sm font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-md">{formData.preferences.distance} km</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="1" max="100"
                                        value={formData.preferences.distance}
                                        onChange={(e) => updatePreference('distance', parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-500 hover:accent-pink-600"
                                    />
                                </div>

                                {/* Age Range */}
                                <div className="mb-8">
                                    <label className="block text-sm font-bold text-slate-700 mb-3">Độ tuổi mong muốn</label>
                                    <div className="flex items-center gap-3">
                                        <input type="number" min="18" max="50" value={formData.preferences.age_range.min || ''} onChange={(e) => updateAgeRange('min', parseInt(e.target.value) || 0)} onBlur={() => handleAgeBlur('min')} className="w-full px-3 py-2 rounded-xl border border-white/50 bg-white/50 text-center font-bold text-slate-700 focus:ring-2 focus:ring-pink-200 outline-none" />
                                        <span className="text-slate-400 font-bold">-</span>
                                        <input type="number" min="18" max="50" value={formData.preferences.age_range.max || ''} onChange={(e) => updateAgeRange('max', parseInt(e.target.value) || 0)} onBlur={() => handleAgeBlur('max')} className="w-full px-3 py-2 rounded-xl border border-white/50 bg-white/50 text-center font-bold text-slate-700 focus:ring-2 focus:ring-pink-200 outline-none" />
                                    </div>
                                    {ageError && <p className="text-xs text-red-500 mt-2 font-bold text-center">{ageError}</p>}
                                </div>

                                {/* Gender Pref */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-3">Tôi muốn xem</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['male', 'female', 'other'].map(gender => (
                                            <button
                                                key={gender}
                                                type="button"
                                                onClick={() => toggleGenderPref(gender)}
                                                className={`flex-1 py-2 px-3 rounded-xl text-sm font-bold border transition-all ${formData.preferences.gender_preference.includes(gender) ? "bg-pink-500 text-white border-pink-500 shadow-md" : "bg-white/50 text-slate-600 border-white/50 hover:bg-white"}`}
                                            >
                                                {gender === 'male' ? 'Nam' : gender === 'female' ? 'Nữ' : 'Khác'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => router.back()} className="flex-1 px-6 py-3 rounded-xl border border-slate-300 bg-white/50 text-slate-700 font-bold hover:bg-white transition">
                                    Hủy
                                </button>
                                <button type="submit" disabled={saving} className="flex-[2] px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold shadow-lg hover:shadow-pink-300/50 hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                                    {saving ? "Đang lưu..." : "Lưu Thay Đổi"}
                                </button>
                            </div>

                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}