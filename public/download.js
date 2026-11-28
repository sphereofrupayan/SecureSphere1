/* ==========================================================================
   SecureSphere Interactive Showcase Engine (Snapa-Inspired Smooth Motion)
   - Lenis silky inertial scroll loop
   - Contextual mouse halo, dot & cursor pills + 3D tilt stages
   - Scroll-reactive manifesto illumination
   - Characteristics sticky switcher & Control 01–03 phone showcase
   - Mobile uncropped fullscreen video fix (aspect-ratio: auto + contain)
   - Clickable 25-platform partner category filtering
   ========================================================================== */

(() => {
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── 1. Lenis Smooth Inertial Scrolling ──────────────────────────────── */
  let lenis = null;
  if (!prefersReducedMotion && typeof window.Lenis === "function") {
    try {
      lenis = new window.Lenis({
        duration: 1.15,
        easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 0.95,
      });
      const rafLenis = time => {
        lenis.raf(time);
        requestAnimationFrame(rafLenis);
      };
      requestAnimationFrame(rafLenis);
    } catch {
      lenis = null;
    }
  }

  /* Smooth anchor jumps compatible with Lenis */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", e => {
      const id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      if (lenis) {
        e.preventDefault();
        lenis.scrollTo(target, { offset: -72 });
      }
    });
  });

  /* ── 2. Announcement Bar Dismiss ──────────────────────────────────────── */
  const annBar = document.getElementById("announcementBar");
  const annClose = document.getElementById("announcementClose");
  annClose?.addEventListener("click", () => annBar?.classList.add("is-hidden"));

  /* ── 3. Smooth Mouse-Tracking Cursor Halo, Dot & Contextual Pill ──────── */
  const dot = document.getElementById("ssCursorDot");
  const halo = document.getElementById("ssCursorHalo");
  const pill = document.getElementById("ssCursorPill");

  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, visible: false };
  const smooth = { x: pointer.x, y: pointer.y, px: pointer.x, py: pointer.y };

  if (dot && halo && pill && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener(
      "pointermove",
      e => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        if (!pointer.visible) {
          pointer.visible = true;
          smooth.x = e.clientX;
          smooth.y = e.clientY;
          smooth.px = e.clientX;
          smooth.py = e.clientY;
          dot.style.opacity = "1";
          halo.style.opacity = "1";
        }
      },
      { passive: true }
    );

    document.addEventListener("pointerleave", () => {
      pointer.visible = false;
      dot.style.opacity = "0";
      halo.style.opacity = "0";
      pill.classList.remove("is-visible");
    });

    document.querySelectorAll("[data-cursor]").forEach(el => {
      el.addEventListener("pointerenter", () => {
        const label = el.getAttribute("data-cursor");
        if (label) {
          pill.textContent = label;
          pill.classList.add("is-visible");
          halo.classList.add("is-active");
        }
      });
      el.addEventListener("pointerleave", () => {
        pill.classList.remove("is-visible");
        halo.classList.remove("is-active");
      });
    });

    const tickCursor = () => {
      smooth.x += (pointer.x - smooth.x) * 0.22;
      smooth.y += (pointer.y - smooth.y) * 0.22;
      smooth.px += (pointer.x - smooth.px) * 0.16;
      smooth.py += (pointer.y - smooth.py) * 0.16;

      dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      halo.style.transform = `translate3d(${smooth.x}px, ${smooth.y}px, 0)`;
      pill.style.transform = `translate3d(${smooth.px + 18}px, ${smooth.py + 18}px, 0)`;

      requestAnimationFrame(tickCursor);
    };
    requestAnimationFrame(tickCursor);
  }

  /* ── 4. Interactive 3D Mouse Tilt + Spotlight ─────────────────────────── */
  if (!prefersReducedMotion && window.matchMedia("(pointer: fine)").matches) {
    document.querySelectorAll(".tilt-stage").forEach(stage => {
      stage.addEventListener("pointermove", e => {
        const rect = stage.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;
        const rotY = (relX - 0.5) * 7;
        const rotX = (0.5 - relY) * 6;
        stage.style.transform = `perspective(1200px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateY(-3px)`;
        stage.style.setProperty("--mx", `${(relX * 100).toFixed(1)}%`);
        stage.style.setProperty("--my", `${(relY * 100).toFixed(1)}%`);
      });
      stage.addEventListener("pointerleave", () => {
        stage.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg) translateY(0px)";
      });
    });
  }

  /* ── 5. Hero Mouse-Reactive Micro-Particle Field ──────────────────────── */
  function initHeroParticles() {
    const canvas = document.getElementById("heroParticles");
    if (!canvas || prefersReducedMotion) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const palette = ["#DE2900", "#38BDF8", "#FBBF24", "#E2E8F0", "#60A5FA"];
    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const count = 78;
    const particles = [];

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 1.6 + Math.random() * 2.4,
        color: palette[i % palette.length],
        alpha: 0.28 + Math.random() * 0.42,
      });
    }

    const mouse = { x: -9999, y: -9999, active: false };
    window.addEventListener(
      "pointermove",
      e => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.active = mouse.y >= -60 && mouse.y <= h + 60;
      },
      { passive: true }
    );

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 220 && dist > 1) {
            const pull = (1 - dist / 220) * 0.04;
            p.vx += (dx / dist) * pull - (dy / dist) * pull * 0.35;
            p.vy += (dy / dist) * pull + (dx / dist) * pull * 0.35;
          }
        }
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx + Math.sin(Date.now() * 0.0005 + i) * 0.12;
        p.y += p.vy + Math.cos(Date.now() * 0.0004 + i) * 0.1;

        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        if (mouse.active) {
          const md = Math.hypot(mouse.x - p.x, mouse.y - p.y);
          if (md < 160) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = `rgba(222, 41, 0, ${((1 - md / 160) * 0.24).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
  initHeroParticles();

  /* ── 6. Radiating Orbital Particle Field (Download Stage) ─────────────── */
  function initDownloadParticles() {
    const canvas = document.getElementById("downloadParticles");
    if (!canvas || prefersReducedMotion) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rays = [];

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 160; i++) {
      rays.push({
        angle: Math.random() * Math.PI * 2,
        dist: 24 + Math.random() * 440,
        speed: 0.45 + Math.random() * 1.0,
        size: 1.1 + Math.random() * 2.0,
        hue: Math.random() > 0.45 ? "#DE2900" : "#38BDF8",
      });
    }

    let ox = 0;
    let oy = 0;
    let tx = 0;
    let ty = 0;

    canvas.parentElement.addEventListener(
      "pointermove",
      e => {
        const rect = canvas.getBoundingClientRect();
        tx = ((e.clientX - rect.left) / rect.width - 0.5) * 90;
        ty = ((e.clientY - rect.top) / rect.height - 0.5) * 60;
      },
      { passive: true }
    );

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ox += (tx - ox) * 0.08;
      oy += (ty - oy) * 0.08;
      const cx = w * 0.5 + ox;
      const cy = h * 0.5 + oy;
      const maxR = Math.hypot(w, h) * 0.56;

      for (const p of rays) {
        p.dist += p.speed;
        if (p.dist > maxR) {
          p.dist = 18 + Math.random() * 34;
          p.angle = Math.random() * Math.PI * 2;
        }
        const x = cx + Math.cos(p.angle) * p.dist;
        const y = cy + Math.sin(p.angle) * p.dist;
        const progress = p.dist / maxR;
        const alpha = Math.sin(progress * Math.PI) * 0.72;

        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.65 + progress * 0.7), 0, Math.PI * 2);
        ctx.fillStyle = p.hue;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
  initDownloadParticles();

  /* ── 7. 16:9 Cinema Video Player + Non-Zoomed Fullscreen ──────────────── */
  const video = document.getElementById("showcaseVideo");
  const stage = document.getElementById("cinemaStage");
  const btnPlay = document.getElementById("btnPlayPause");
  const playIcon = document.getElementById("playPauseIcon");
  const playLabel = document.getElementById("playPauseLabel");
  const btnMute = document.getElementById("btnMuteToggle");
  const btnUnmutePrompt = document.getElementById("btnUnmutePrompt");
  const muteIcon = document.getElementById("muteIcon");
  const muteLabel = document.getElementById("muteLabel");
  const btnFs = document.getElementById("btnFullscreen");
  const progWrap = document.getElementById("cinemaProgressWrap");
  const progFill = document.getElementById("cinemaProgressFill");
  const timeEl = document.getElementById("cinemaTime");
  const chapterLabel = document.getElementById("cinemaChapterLabel");
  const chapterButtons = Array.from(document.querySelectorAll(".chapter-pill"));

  const CHAPTERS = [
    { start: 0.0, label: "01 · Welcome to SecureSphere" },
    { start: 20.85, label: "02 · Instant Private Rooms on the Website" },
    { start: 41.46, label: "03 · Web & Android Unified Sync" },
    { start: 59.79, label: "04 · Real-Time Team Chat Example" },
    { start: 79.32, label: "05 · Live Collaborative Whiteboard Example" },
    { start: 98.61, label: "06 · Live WebRTC Voice Channel Example" },
    { start: 117.92, label: "07 · Live 3D Ludo & Chess on the Website" },
    { start: 136.63, label: "08 · Live Gemini AI Room Intelligence Example" },
    { start: 155.61, label: "09 · Native Mobile Engineering" },
    { start: 176.1, label: "10 · Full-Stack Engine & Cloud Delivery" },
    { start: 195.92, label: "11 · Download Now" },
  ];

  const fmtTime = sec => {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? "0" : ""}${r}`;
  };

  if (video) {
    const syncPlayUi = () => {
      const paused = video.paused;
      if (playIcon) playIcon.textContent = paused ? "▶" : "❚❚";
      if (playLabel) playLabel.textContent = paused ? "Play" : "Pause";
    };

    const syncMuteUi = () => {
      const muted = video.muted;
      if (muteIcon) muteIcon.textContent = muted ? "🔇" : "🔊";
      if (muteLabel) muteLabel.textContent = muted ? "Voice Off" : "Voice On";
      if (btnUnmutePrompt) btnUnmutePrompt.classList.toggle("is-hidden", !muted);
    };

    const togglePlay = () => {
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      syncPlayUi();
    };

    btnPlay?.addEventListener("click", e => {
      e.stopPropagation();
      togglePlay();
    });

    stage?.addEventListener("click", e => {
      if (e.target.closest(".cinema-hud") || e.target.closest(".cinema-unmute-prompt")) return;
      togglePlay();
    });

    btnUnmutePrompt?.addEventListener("click", e => {
      e.stopPropagation();
      video.muted = false;
      if (video.paused) video.play().catch(() => {});
      syncMuteUi();
    });

    btnMute?.addEventListener("click", e => {
      e.stopPropagation();
      video.muted = !video.muted;
      if (!video.muted && video.paused) {
        video.play().catch(() => {});
      }
      syncMuteUi();
    });

    let fallbackFsActive = false;

    const syncFullscreenUi = () => {
      const activeEl = document.fullscreenElement || document.webkitFullscreenElement;
      const isNativeFs = Boolean(activeEl === stage || activeEl === video);
      if (isNativeFs) fallbackFsActive = false;
      const isFs = isNativeFs || fallbackFsActive;
      stage?.classList.toggle("is-fullscreen", isFs);
      document.documentElement.classList.toggle("is-video-fullscreen", fallbackFsActive);
      if (btnFs) {
        btnFs.innerHTML = isFs ? "&#x2922; Exit" : "&#x26F6; Fullscreen";
        btnFs.setAttribute("aria-label", isFs ? "Exit fullscreen" : "Fullscreen video");
      }
    };

    const setFallbackFs = active => {
      fallbackFsActive = active;
      if (active) {
        lenis?.stop?.();
      } else {
        lenis?.start?.();
      }
      syncFullscreenUi();
    };

    btnFs?.addEventListener("click", e => {
      e.stopPropagation();
      const activeEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (activeEl) {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document).catch?.(() => {});
        setFallbackFs(false);
        return;
      }
      if (fallbackFsActive) {
        setFallbackFs(false);
        return;
      }
      const enterFallbackIfNeeded = () => {
        setTimeout(() => {
          const cur = document.fullscreenElement || document.webkitFullscreenElement;
          if (!cur) setFallbackFs(true);
        }, 90);
      };
      if (stage?.requestFullscreen) {
        try {
          const p = stage.requestFullscreen();
          if (p && typeof p.then === "function") {
            p.then(enterFallbackIfNeeded).catch(() => setFallbackFs(true));
          } else {
            enterFallbackIfNeeded();
          }
        } catch {
          setFallbackFs(true);
        }
      } else if (stage?.webkitRequestFullscreen) {
        try {
          stage.webkitRequestFullscreen();
          enterFallbackIfNeeded();
        } catch {
          setFallbackFs(true);
        }
      } else {
        setFallbackFs(true);
      }
    });

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && fallbackFsActive) {
        setFallbackFs(false);
      } else {
        syncFullscreenUi();
      }
    });
    document.addEventListener("webkitfullscreenchange", syncFullscreenUi);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && fallbackFsActive) {
        setFallbackFs(false);
      }
    });

    progWrap?.addEventListener("click", e => {
      e.stopPropagation();
      const rect = progWrap.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (video.duration) {
        video.currentTime = frac * video.duration;
      }
    });

    chapterButtons.forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        const seekTo = Number(btn.getAttribute("data-seek") || 0);
        video.currentTime = seekTo;
        if (video.paused) video.play().catch(() => {});
        chapterButtons.forEach((b, i) => b.classList.toggle("is-active", i === idx));
        if (chapterLabel && CHAPTERS[idx]) chapterLabel.textContent = CHAPTERS[idx].label;
      });
    });

    video.addEventListener("timeupdate", () => {
      const cur = video.currentTime || 0;
      const dur = video.duration || 215.57;
      if (progFill) progFill.style.width = `${Math.min(100, (cur / dur) * 100)}%`;
      if (timeEl) timeEl.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;

      let activeIdx = 0;
      for (let i = CHAPTERS.length - 1; i >= 0; i--) {
        if (cur >= CHAPTERS[i].start) {
          activeIdx = i;
          break;
        }
      }
      if (chapterLabel && CHAPTERS[activeIdx]) {
        chapterLabel.textContent = CHAPTERS[activeIdx].label;
      }
      chapterButtons.forEach((b, i) => b.classList.toggle("is-active", i === activeIdx));
    });

    video.addEventListener("play", syncPlayUi);
    video.addEventListener("pause", syncPlayUi);
    syncPlayUi();
    syncMuteUi();
  }

  /* ── 8. Scroll-Lit Manifesto Lines (Snapa About Behavior) ─────────────── */
  const manifestoLines = Array.from(document.querySelectorAll(".manifesto-line"));
  function updateManifestoScroll() {
    if (!manifestoLines.length) return;
    const mid = window.innerHeight * 0.62;
    manifestoLines.forEach((line, idx) => {
      const rect = line.getBoundingClientRect();
      const lit = rect.top <= mid - idx * 14;
      line.classList.toggle("is-lit", lit || idx === 0);
    });
  }
  window.addEventListener("scroll", updateManifestoScroll, { passive: true });
  updateManifestoScroll();

  /* ── 9. Characteristics Sticky Switcher ─────────────────────────────────── */
  const charRows = Array.from(document.querySelectorAll("#charRows .char-row"));
  const charSlides = Array.from(document.querySelectorAll("[data-char-slide]"));
  const setCharActive = idx => {
    charRows.forEach((row, i) => row.classList.toggle("is-active", i === idx));
    charSlides.forEach((slide, i) => slide.classList.toggle("is-active", i === idx));
  };
  charRows.forEach((row, idx) => {
    row.addEventListener("click", () => setCharActive(idx));
    row.addEventListener("pointerenter", () => setCharActive(idx));
  });

  /* ── 10. Control 01–03 Mobile Phone Mockup Switcher ───────────────────── */
  const stepCards = Array.from(document.querySelectorAll("[data-screen-card]"));
  const stepPills = Array.from(document.querySelectorAll("[data-screen-btn]"));
  const phoneImgs = Array.from(document.querySelectorAll("[data-screen-idx]"));

  const setScreenActive = idx => {
    stepCards.forEach((c, i) => c.classList.toggle("is-active", i === idx));
    stepPills.forEach((b, i) => {
      const active = i === idx;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    phoneImgs.forEach((img, i) => img.classList.toggle("is-active", i === idx));
  };

  stepCards.forEach((card, idx) => card.addEventListener("click", () => setScreenActive(idx)));
  stepPills.forEach((btn, idx) => btn.addEventListener("click", () => setScreenActive(idx)));

  /* ── 11. Platform & Partners Category Filter ──────────────────────────── */
  const partnerFilters = Array.from(document.querySelectorAll("[data-partner-cat]"));
  const partnerCards = Array.from(document.querySelectorAll("#partnersGrid .partner-card"));

  partnerFilters.forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-partner-cat") || "all";
      partnerFilters.forEach(b => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      partnerCards.forEach(card => {
        const show = cat === "all" || card.getAttribute("data-cat") === cat;
        card.classList.toggle("is-hidden", !show);
        if (show) card.classList.add("is-in");
      });
    });
  });

  /* ── 12. Smooth Scroll Reveal ─────────────────────────────────────────── */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !prefersReducedMotion) {
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
    );
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add("is-in"));
  }
})();
