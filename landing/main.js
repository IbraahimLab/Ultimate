const tabs = Array.from(document.querySelectorAll(".tab"));
const panels = Array.from(document.querySelectorAll(".tab-panel"));

function activateTab(targetId) {
  tabs.forEach((tab) => {
    const isActive = tab.dataset.target === targetId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === targetId);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const targetId = tab.dataset.target;
    if (!targetId) {
      return;
    }
    activateTab(targetId);
  });
});

const copyButtons = Array.from(document.querySelectorAll(".copy-btn"));
copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const selector = button.getAttribute("data-copy");
    if (!selector) {
      return;
    }

    const target = document.querySelector(selector);
    if (!target) {
      return;
    }

    const text = target.textContent ?? "";
    if (!text.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      const prev = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = prev;
      }, 1200);
    } catch {
      const prev = button.textContent;
      button.textContent = "Copy failed";
      setTimeout(() => {
        button.textContent = prev;
      }, 1200);
    }
  });
});

const revealNodes = Array.from(document.querySelectorAll(".reveal"));
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }
      entry.target.classList.add("in");
      io.unobserve(entry.target);
    });
  },
  {
    rootMargin: "0px 0px -8% 0px",
    threshold: 0.15,
  },
);

revealNodes.forEach((node, index) => {
  node.style.transitionDelay = `${Math.min(index * 30, 180)}ms`;
  io.observe(node);
});
