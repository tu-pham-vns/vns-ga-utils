/**
 * @typedef {Object} SectionTrackedData
 * @property {number} start
 * @property {number} duration
 * @property {number} minScrollDepth
 * @property {number} maxScrollDepth
 * @property {HTMLElement} element
 * @property {string} id
 */

class InternalGA {
  #trackingId = "";
  /**
   * @type {IntersectionObserver}
   */
  #sectionObserver = null;
  /**
   * @type {Map<string, SectionTrackedData>}
   */
  #sectionMap = new Map();

  constructor() {
    this.#_initTracking();
    this.#_initSectionVisibilityTracking();
    this.#_initScrollDepthTracking();
    this.#_handleUnload();
  }

  #_initTracking() {
    const thisScript = document.currentScript;
    const src = thisScript.src;
    const url = new URL(src);
    const trackingId = url.searchParams.get("GID");
    if (!trackingId) {
      console.warn("Internal GA: No tracking ID found");
      return;
    }
    this.#trackingId = trackingId;
  }

  #_initSectionVisibilityTracking() {
    this.#sectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target;
        // due to the fact that multiple sections can have the same selector,
        // we need to use a unique id to track them separately
        const id = window.crypto.randomUUID();
        const selector = node.getAttribute("data-internal-view");
        node.setAttribute("data-internal-view-id", id);
        if (!selector) continue;
        if (entry.isIntersecting) {
          this.#sectionMap.set(selector, {
            start: Date.now(),
            duration: 0,
            minScrollDepth: entry.intersectionRatio * 100,
            maxScrollDepth: entry.intersectionRatio * 100,
            element: entry.target,
            id: id,
          });
        } else {
          const tracked = this.#sectionMap.get(selector);
          if (!tracked) continue;
          tracked.duration = Date.now() - tracked.start;
          const scrollDepth = tracked.maxScrollDepth - tracked.minScrollDepth;
          const payload = {
            event: "section_view",
            section: selector,
            view_time: tracked.duration,
            scroll_depth: scrollDepth,
          };
          this.#_sendInternalGAEvent(payload);
          this.#sectionMap.delete(selector);
        }
      }
    });
  }

  #_initScrollDepthTracking() {
    if (typeof window === "undefined") return;

    /**
     *
     * @param {SectionTrackedData} section
     */
    const handleElementScroll = (section) => {
      const element = section.element;
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Calculate how much of the element is visible
      const elementTop = rect.top;
      const elementBottom = rect.bottom;
      const elementHeight = rect.height;

      // If element is above viewport, calculate based on scroll position
      let scrollDepth = 0;

      if (elementBottom < 0) {
        // Element is completely above viewport - scrolled past
        scrollDepth = 100;
      } else if (elementTop > viewportHeight) {
        // Element is completely below viewport - not reached yet
        scrollDepth = 0;
      } else {
        // Element is in or partially in viewport
        const visibleTop = Math.max(0, -elementTop);
        const visibleBottom = Math.min(
          elementHeight,
          viewportHeight - elementTop
        );
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        scrollDepth =
          elementHeight > 0
            ? Math.round((visibleHeight / elementHeight) * 100)
            : 0;
      }

      section.minScrollDepth = Math.min(section.minScrollDepth, scrollDepth);
      section.maxScrollDepth = Math.max(section.maxScrollDepth, scrollDepth);
      this.#sectionMap.set(section.id, section);
    };

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          // const elements = document.querySelectorAll(
          //   "[data-track-scroll-depth]"
          // );
          const sections = Array.from(this.#sectionMap.values());

          sections.forEach((section) => {
            handleElementScroll(section);
          });
        });
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  #_sendInternalGAEvent() {
    window.dataLayer = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    window.dataLayer.push(...arguments);
  }

  #_configInternalGA(config) {
    if (typeof window === "undefined" || typeof window.gtag !== "function") {
      console.warn("Internal GA: GA has not been initialized yet");
      return;
    }
    window.gtag("config", config);
  }

  #_readCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return null;
  }

  #_writeCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${value}; ${expires}; path=/`;
  }

  #_trackSectionView(section) {
    this.#sectionObserver.observe(section);
  }

  #_handleUnload() {
    function handleCloseTab() {
      const trackingId = this.#trackingId;
      const sessionKey = `__internal_ga_session_${trackingId}__`;
      this.#_writeCookie(sessionKey, Date.now(), 365); // 1 year
    }

    function sendLastSection() {
      const lastSections = Array.from(this.#sectionMap.values());
      lastSections.forEach((section) => {
        const duration = Date.now() - section.start;
        const scrollDepth = section.maxScrollDepth - section.minScrollDepth;
        const selector = section.element.getAttribute("data-internal-view");
        const event = {
          event: "section_view",
          section: selector,
          view_time: duration,
          scroll_depth: scrollDepth,
        };
        this.#_sendInternalGAEvent(event);
      });
    }

    // have to bind this to the instance of the class because the function is called by window.
    window.addEventListener("beforeunload", handleCloseTab.bind(this));
    window.addEventListener("unload", sendLastSection.bind(this));
  }

  sendReturnUserEvent() {
    const trackingId = this.#trackingId;
    const sessionKey = `__internal_ga_session_${trackingId}__`;
    const lastVisit = this.#_readCookie(sessionKey);
    if (!lastVisit) {
      return false;
    }

    const now = Date.now();
    const diff = now - lastVisit;
    this.#_sendInternalGAEvent({
      event: "return_visit",
      duration: diff,
    });
  }

  trackSectionVisibility() {
    const sectionSelector = "[data-internal-view]";

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          // Case 1: the node IS the section
          if (node.matches?.(sectionSelector)) {
            this.#_trackSectionView(node);
          }

          // Case 2: the section is inside the added node
          node
            .querySelectorAll?.(sectionSelector)
            .forEach(this.#_trackSectionView.bind(this));
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial scan
    document
      .querySelectorAll(sectionSelector)
      .forEach(this.#_trackSectionView.bind(this));
  }
}

function main() {
  const internalGA = new InternalGA();
  internalGA.sendReturnUserEvent();

  internalGA.trackSectionVisibility();

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}