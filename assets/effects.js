/* Motion & interaction effects. Vanilla JS, no dependencies.
   Everything skips under prefers-reduced-motion; pointer effects
   only arm on fine pointers. Styles are set via CSSOM properties
   (CSP-safe: no inline style attributes). */
document.addEventListener("DOMContentLoaded", () => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  /* ---------- 1. Hero entrance: char-split headline + staged reveal ---------- */
  const heroContent = document.querySelector(".hero-content");
  if (heroContent) {
    const h1 = heroContent.querySelector("h1");
    if (h1 && !reduced) {
      const text = h1.textContent.trim();
      h1.setAttribute("aria-label", text);
      let index = 0;
      const splitNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          for (const ch of node.textContent) {
            const span = document.createElement("span");
            span.className = "char";
            span.setAttribute("aria-hidden", "true");
            span.style.setProperty("--i", index++);
            span.textContent = ch === " " ? "\u00A0" : ch;
            frag.appendChild(span);
          }
          node.replaceWith(frag);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          /* Keep styled spans (e.g. .grad) as one animated unit: splitting inside
             them breaks background-clip: text once children get transforms. */
          node.classList.add("char");
          node.setAttribute("aria-hidden", "true");
          node.style.setProperty("--i", index++);
        }
      };
      Array.from(h1.childNodes).forEach(splitNode);
      requestAnimationFrame(() => requestAnimationFrame(() => h1.classList.add("chars-in")));
    }

    if (!reduced) {
      const staged = [heroContent.querySelector(".eyebrow"), heroContent.querySelector(".hero-lead"), heroContent.querySelector(".cta-row")].filter(Boolean);
      staged.forEach((el, i) => {
        setTimeout(() => el.classList.add("fx-in"), 120 + i * 220);
      });
      if (h1) setTimeout(() => h1.classList.add("fx-in"), 80);
      const avatar = document.querySelector(".hero-visual .profile-image");
      const nowCard = document.querySelector(".hero-visual .hero-card");
      if (avatar) setTimeout(() => avatar.classList.add("fx-pop"), 480);
      if (nowCard) setTimeout(() => nowCard.classList.add("fx-in"), 700);
    } else {
      heroContent.querySelectorAll(":scope > *").forEach((el) => el.classList.add("fx-in"));
      document.querySelectorAll(".hero-visual .profile-image, .hero-visual .hero-card").forEach((el) => {
        el.classList.add("fx-in", "fx-pop");
      });
    }
  }

  /* ---------- 2. Scroll progress bar ---------- */
  const progress = document.querySelector(".scroll-progress");
  if (progress && !reduced) {
    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = "scaleX(" + (max > 0 ? Math.min(window.scrollY / max, 1) : 0) + ")";
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  /* ---------- 3. Cursor glow (lerped follow) ---------- */
  const glow = document.querySelector(".cursor-glow");
  if (glow && !reduced && finePointer) {
    let tx = -600, ty = -600, x = tx, y = ty, running = false;
    const step = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      glow.style.transform = "translate3d(" + x + "px," + y + "px,0)";
      if (Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4) {
        requestAnimationFrame(step);
      } else {
        running = false;
      }
    };
    window.addEventListener("pointermove", (e) => {
      tx = e.clientX;
      ty = e.clientY;
      glow.style.opacity = "1";
      if (!running) {
        running = true;
        requestAnimationFrame(step);
      }
    }, { passive: true });
    document.addEventListener("pointerleave", () => { glow.style.opacity = "0"; });
  }

  /* ---------- 4. Project card tilt + spotlight tracking ---------- */
  if (!reduced && finePointer) {
    document.querySelectorAll(".project-card").forEach((card) => {
      const MAX = 7;
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.transition = "none";
        card.style.transform =
          "perspective(900px) rotateX(" + ((0.5 - py) * MAX).toFixed(2) + "deg) rotateY(" + ((px - 0.5) * MAX).toFixed(2) + "deg) translateY(-4px)";
        card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      });
      card.addEventListener("pointerleave", () => {
        card.style.transition = "transform 340ms cubic-bezier(0.7, 0, 0.84, 0)";
        card.style.transform = "";
      });
    });
  }

  /* ---------- 5. Aurora scroll parallax ---------- */
  const aurora = document.querySelector(".aurora");
  if (aurora && !reduced) {
    let parallaxTick = false;
    window.addEventListener("scroll", () => {
      if (!parallaxTick) {
        parallaxTick = true;
        requestAnimationFrame(() => {
          aurora.style.transform = "translate3d(0," + (window.scrollY * -0.06).toFixed(1) + "px,0)";
          parallaxTick = false;
        });
      }
    }, { passive: true });
  }
});
