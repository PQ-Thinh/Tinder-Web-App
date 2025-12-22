"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useAuth } from "@/contexts/auth-context";

// MUI Components - LƯU Ý: Import Grid2 cho MUI v6
import { Box, Button, Container, Typography, Paper, Avatar, AvatarGroup } from "@mui/material";
import Grid from '@mui/material/Grid'; // Import Grid2

import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";

// Đăng ký Plugin
gsap.registerPlugin(ScrollTrigger);

// --- DỮ LIỆU MẪU (Mock Data) ---
const HERO_CARDS = [
  { id: 1, img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&q=80", name: "Jessica, 24", color: "#ec4899" },
  { id: 2, img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&q=80", name: "Sarah, 22", color: "#8b5cf6" },
  { id: 3, img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&q=80", name: "David, 26", color: "#f43f5e" },
];

const FEATURES = [
  { icon: <BoltRoundedIcon fontSize="large" />, title: "Match Thần Tốc", desc: "Thuật toán AI tìm kiếm người hợp tần số chỉ trong tích tắc." },
  { icon: <SecurityRoundedIcon fontSize="large" />, title: "An Toàn 100%", desc: "Verified profile. Không fake, không bot, chỉ có người thật." },
  { icon: <AutoAwesomeRoundedIcon fontSize="large" />, title: "Vibe Check", desc: "Video call trực tiếp để cảm nhận 'tia lửa' trước khi hẹn hò." },
];

export default function LandingPage() {
  const { user } = useAuth();
  const mainRef = useRef<HTMLDivElement>(null);

  // --- GSAP ANIMATION ---
  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. HERO ANIMATION
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from(".hero-text-element", {
        y: 100,
        opacity: 0,
        duration: 1,
        stagger: 0.15,
      })
        .from(".hero-card", {
          y: 800,
          rotation: () => Math.random() * 30 - 15,
          opacity: 0,
          duration: 1.2,
          stagger: 0.1,
          ease: "back.out(1.2)",
        }, "-=0.8");

      // 2. HERO INTERACTION: Fix type 'any' -> 'MouseEvent'
      const cards = document.querySelectorAll(".hero-card");
      const heroSection = document.querySelector(".hero-section");

      const handleMouseMove = (e: MouseEvent) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;

        gsap.to(cards, {
          x: (i) => x * (i + 1),
          y: (i) => y * (i + 1),
          duration: 0.5,
          ease: "power1.out"
        });
      };

      if (heroSection) {
        // Ép kiểu EventListener để TS hiểu đây là MouseEvent
        heroSection.addEventListener("mousemove", handleMouseMove as EventListener);
      }

      // 3. FEATURES
      gsap.from(".feature-card", {
        scrollTrigger: {
          trigger: ".features-section",
          start: "top 80%",
          toggleActions: "play none none reverse",
        },
        y: 100,
        opacity: 0,
        duration: 0.8,
        stagger: 0.2,
      });

      // 4. STATS
      gsap.from(".stat-number", {
        scrollTrigger: {
          trigger: ".stats-section",
          start: "top 85%",
        },
        textContent: 0,
        duration: 2,
        ease: "power1.out",
        snap: { textContent: 1 },
        stagger: 0.2,
      });

      // Cleanup event listener
      return () => {
        if (heroSection) {
          heroSection.removeEventListener("mousemove", handleMouseMove as EventListener);
        }
      };

    }, mainRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={mainRef} className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] overflow-x-hidden font-sans text-slate-900 dark:text-white">

      {/* --- BACKGROUND ORBS --- */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-pink-500/20 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-violet-600/20 rounded-full blur-[100px] animate-pulse-slow delay-1000" />
      </div>

      {/* ================= HERO SECTION ================= */}
      <section className="hero-section relative z-10 min-h-screen flex items-center justify-center pt-20 pb-10 px-4">
        <Container maxWidth="xl">
          {/* FIX: Grid container không cần prop 'container' trong v2 (nhưng giữ cũng không sao nếu import Grid cũ). 
            Quan trọng là Grid con KHÔNG ĐƯỢC CÓ 'item'.
          */}
          <Grid container spacing={4} alignItems="center">

            {/* LEFT: TEXT CONTENT */}
            {/* FIX: Thay <Grid item xs={12}> thành <Grid size={{ xs: 12, md: 6 }}> hoặc props trực tiếp */}
            <Grid size={{ xs: 12, md: 6 }} className="text-center md:text-left z-20">
              <div className="hero-text-element inline-block px-4 py-1.5 rounded-full bg-white/50 dark:bg-white/10 backdrop-blur-md border border-pink-200 dark:border-white/10 mb-6">
                <span className="text-pink-600 dark:text-pink-400 font-bold text-xs tracking-wider uppercase">✨ Dating App thế hệ mới</span>
              </div>

              <Typography variant="h1" className="hero-text-element text-5xl md:text-7xl lg:text-8xl font-black mb-6 leading-[1.1] tracking-tighter">
                Swipe.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-rose-500 to-violet-600">
                  Match. Love.
                </span>
              </Typography>

              <Typography variant="h5" className="hero-text-element text-slate-600 dark:text-slate-400 mb-10 max-w-lg mx-auto md:mx-0 font-medium leading-relaxed">
                Không chỉ là quẹt phải. Đây là nơi những câu chuyện tình yêu bắt đầu bằng những khoảnh khắc chân thực nhất.
              </Typography>

              <div className="hero-text-element flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                <Link href={user ? "/matches" : "/auth"}>
                  <Button
                    variant="contained"
                    size="large"
                    className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 rounded-full px-10 py-4 text-lg font-bold shadow-xl shadow-pink-500/30 hover:scale-105 transition-transform"
                  >
                    {user ? "Bắt Đầu Ngay" : "Tham Gia Miễn Phí"}
                  </Button>
                </Link>
                <Link href="#features">
                  <Button
                    variant="text"
                    size="large"
                    className="text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full px-8 py-4 text-lg font-bold"
                  >
                    Tìm Hiểu Thêm
                  </Button>
                </Link>
              </div>

              {/* Mini Social Proof */}
              <div className="hero-text-element mt-12 flex items-center justify-center md:justify-start gap-4">
                <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 40, height: 40, borderColor: 'white' } }}>
                  <Avatar alt="Remy Sharp" src="https://mui.com/static/images/avatar/1.jpg" />
                  <Avatar alt="Travis Howard" src="https://mui.com/static/images/avatar/2.jpg" />
                  <Avatar alt="Cindy Baker" src="https://mui.com/static/images/avatar/3.jpg" />
                  <Avatar alt="Agnes Walker" src="https://mui.com/static/images/avatar/4.jpg" />
                </AvatarGroup>
                <div className="text-left">
                  <p className="font-bold text-lg leading-none">10k+</p>
                  <p className="text-xs text-slate-500">Cặp đôi đã ghép</p>
                </div>
              </div>
            </Grid>

            {/* RIGHT: CARD STACK ANIMATION */}
            {/* FIX: Bỏ prop 'item' */}
            <Grid size={{ xs: 12, md: 6 }} className="relative h-[500px] flex items-center justify-center">
              {HERO_CARDS.map((card, index) => (
                <div
                  key={card.id}
                  className="hero-card absolute w-[280px] sm:w-[320px] aspect-[3/4] rounded-[32px] overflow-hidden shadow-2xl border-4 border-white dark:border-slate-800"
                  style={{
                    zIndex: index + 1,
                    transform: `rotate(${(index - 1) * 6}deg) translateX(${(index - 1) * 20}px)`,
                    left: '50%',
                    marginLeft: '-160px',
                  }}
                >
                  <div className="relative w-full h-full">
                    <img src={card.img} alt={card.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-6 left-6 text-white">
                      <h3 className="text-2xl font-bold flex items-center gap-2">
                        {card.name} <span className="w-3 h-3 rounded-full bg-green-500 inline-block border-2 border-white"></span>
                      </h3>
                      <div className="flex gap-2 mt-3">
                        <div className="w-12 h-12 rounded-full bg-slate-900/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 hover:bg-red-500 hover:border-red-500 transition-colors cursor-pointer">✕</div>
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform cursor-pointer">
                          <FavoriteRoundedIcon fontSize="small" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </Grid>

          </Grid>
        </Container>
      </section>

      {/* ================= FEATURES SECTION ================= */}
      <section id="features" className="features-section py-32 relative z-10">
        <Container>
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-black mb-6">
              Tại sao chọn <span className="text-pink-600">Chúng Tôi?</span>
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Chúng tôi không chỉ giúp bạn tìm người yêu, chúng tôi giúp bạn tìm thấy một nửa hoàn hảo của mình thông qua công nghệ.
            </p>
          </div>

          <Grid container spacing={4}>
            {FEATURES.map((feature, idx) => (
              // FIX: Bỏ 'item', dùng size props
              <Grid size={{ xs: 12, md: 4 }} key={idx}>
                <Paper
                  elevation={0}
                  className="feature-card h-full p-8 rounded-[32px] bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-white/20 dark:border-white/10 hover:border-pink-500/30 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-pink-500/10 group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                    {feature.icon}
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                    {feature.desc}
                  </p>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </section>

      {/* ================= STATS SECTION ================= */}
      <section className="stats-section py-20 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

        <Container className="relative z-10">
          <Grid container spacing={4} textAlign="center">
            {/* FIX: Bỏ item, dùng size */}
            <Grid size={{ xs: 6, md: 3 }}>
              <div className="text-5xl md:text-6xl font-black mb-2 text-pink-500 stat-number">2M+</div>
              <div className="text-sm md:text-base font-bold uppercase tracking-widest text-slate-400">Người dùng</div>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <div className="text-5xl md:text-6xl font-black mb-2 text-violet-500 stat-number">500k</div>
              <div className="text-sm md:text-base font-bold uppercase tracking-widest text-slate-400">Matches</div>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <div className="text-5xl md:text-6xl font-black mb-2 text-blue-500 stat-number">150+</div>
              <div className="text-sm md:text-base font-bold uppercase tracking-widest text-slate-400">Quốc gia</div>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <div className="text-5xl md:text-6xl font-black mb-2 text-yellow-500 stat-number">4.8</div>
              <div className="text-sm md:text-base font-bold uppercase tracking-widest text-slate-400">Rating</div>
            </Grid>
          </Grid>
        </Container>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="py-32 relative flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-violet-600 opacity-95" />

        <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <Typography
            variant="h1"
            sx={{
              color: 'white',
              fontWeight: 900,
              mb: 3,
              fontSize: { xs: '2.8rem', md: '4rem' },
              lineHeight: 1.1,
            }}
          >
            Sẵn sàng tìm nửa kia?
          </Typography>

          <Typography
            sx={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: '1.25rem',
              maxWidth: 720,
              mx: 'auto',
              mb: 6,
            }}
          >
            Đừng để cơ hội vụt mất. Tham gia cộng đồng hẹn hò chất lượng nhất ngay hôm nay.
          </Typography>

          <Link href={user ? '/matches' : '/auth'}>
            <button className="relative group overflow-hidden bg-white text-rose-600 font-bold py-5 px-14 rounded-full text-xl shadow-2xl transition-all hover:scale-105">
              <span className="relative z-10">Bắt đầu ngay</span>
              <div className="absolute inset-0 bg-rose-50 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
            </button>
          </Link>
        </Container>
      </section>


      <footer className="py-8 text-center text-slate-400 text-sm bg-slate-50 dark:bg-black border-t border-slate-200 dark:border-white/5">
        <p>© 2024 TinderClone. Made with ❤️ by Phung Quoc Thinh.</p>
      </footer>
    </div>
  );
}