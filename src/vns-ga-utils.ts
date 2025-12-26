type SectionVisibilitySettings = {
  id: string;
  section: string;
  selector: string; 
  scrollDepth: number;
  viewTime: number;
  customEvent: string;
};

type AddedSectionVisibilitySettings = Omit<SectionVisibilitySettings, "id" | "section">;
type TrackedSectionVisibilitySettings = SectionVisibilitySettings & {
  _isSent?: boolean
  _timeOut?: NodeJS.Timeout | null;
};

type SectionTrackedData = {
  start: number;
  duration: number;
  minScrollDepth: number;
  maxScrollDepth: number;
  element: HTMLElement;
  id: string;
};

type CookieOptions = {
  expires: number;
  path: string;
  domain: string;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  httpOnly: boolean;
  priority: "low" | "medium" | "high";
  sameParty: boolean;
};

export class VnsGaUtil {
  // Use a real private field so runtime access is blocked in JS too
  #version: string = "1.0.0";
  #trackingId: string = "";
  #sectionObserver!: IntersectionObserver;
  #sectionMap: Map<string, SectionTrackedData> = new Map();
  #sectionVisibility: Map<string, TrackedSectionVisibilitySettings> = new Map();
  #selectorVisibilityMap: Map<string, TrackedSectionVisibilitySettings[]> = new Map();

  constructor() {
    this.#_initTracking();
    this.#_initSectionVisibilityTracking();
    this.#_initScrollDepthTracking();
  }

  #_initTracking() {
    const thisScript = document.currentScript as HTMLScriptElement;
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
            element: entry.target as HTMLElement,
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
    
    const sendLastSection = () => {
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
    window.addEventListener("beforeunload", sendLastSection.bind(this));
  }

  #_initScrollDepthTracking() {
    if (typeof window === "undefined") return;

    /**
     *
     * @param {SectionTrackedData} section
     */
    const handleElementScroll = (section: SectionTrackedData) => {
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

  #_sendInternalGAEvent(...args: any[]) {
    // Explicitly annotate window as any to avoid TypeScript complaints about dataLayer
    (window as any).dataLayer = Array.isArray((window as any).dataLayer)
      ? (window as any).dataLayer
      : [];
    (window as any).dataLayer.push(...args);
  }

  #_readCookie(name: string) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()!.split(";").shift();
    return null;
  }

  #_writeCookie(name: string, value: string, options: Partial<CookieOptions>) {
    const defaultExpires = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const expiryDate = new Date(
      options.expires ? options.expires : defaultExpires
    );
    const expires = `expires=${expiryDate.toUTCString()}`;
    const path = options.path ? options.path : "/";
    const domain = options.domain ? options.domain : window.location.hostname;
    const sameSite = options.sameSite ? options.sameSite : "lax";
    document.cookie = `${name}=${value}; ${expires}; path=${path}; domain=${domain}; sameSite=${sameSite}`;
  }

  #_trackSectionView(section: HTMLElement) {
    this.#sectionObserver.observe(section);
  }

  #_claim(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  dropSectionVisibility(id: string) {
    const settings = this.#sectionVisibility.get(id);
    if (!settings) return;
    const selector = settings.selector;
    this.#sectionVisibility.delete(id);
    const oldSelectorSettings = this.#selectorVisibilityMap.get(selector);
    if (!oldSelectorSettings || oldSelectorSettings.length <= 0) return;
    const newSelectorSettings = oldSelectorSettings.filter((s) => s.id !== id);
    this.#selectorVisibilityMap.set(selector, newSelectorSettings);
  }

  addSectionVisibility(section: string, settings: Partial<SectionVisibilitySettings>) {
    const defaultSelector = `[data-internal-view="${section}"]`;
    const selector = settings.selector || defaultSelector;
    const id = window.crypto.randomUUID();
    const _settings: SectionVisibilitySettings = {
      id: id,
      section: section,
      selector: selector,
      scrollDepth: this.#_claim(settings.scrollDepth || 70, 0, 100),
      viewTime: Math.max(settings.viewTime || 3000, 0),
      customEvent: settings.customEvent || "",
    };
    const selectorSettings = this.#selectorVisibilityMap.get(selector) || [];
    this.#sectionVisibility.set(id, _settings);
    this.#selectorVisibilityMap.set(selector, selectorSettings);
    return id;
  }

  trackUserReturn() {
    const trackingId = this.#trackingId;
    const sessionKey = `__internal_ga_session_${trackingId}__`;
    const lastVisit = this.#_readCookie(sessionKey);
    if (!lastVisit) {
      return false;
    }

    const now = Date.now();
    const diff = now - +lastVisit;
    this.#_sendInternalGAEvent({
      event: "return_visit",
      duration: diff,
    });

    const handleCloseTab = () => {
      const trackingId = this.#trackingId;
      const sessionKey = `__internal_ga_session_${trackingId}__`;
      this.#_writeCookie(sessionKey, Date.now().toString(), {
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
        path: "/",
        domain: window.location.hostname,
        sameSite: "lax",
      });
    };

    window.addEventListener("beforeunload", handleCloseTab.bind(this));
  }

  trackSectionVisibility() {
    const sectionSelector = "[data-internal-view]";

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const node = m.addedNodes[i];
          if (!(node instanceof HTMLElement)) continue;

          // Case 1: the node IS the section
          if (node.matches?.(sectionSelector)) {
            this.#_trackSectionView(node);
          }

          // Case 2: the section is inside the added node
          node
            .querySelectorAll?.(sectionSelector)
            .forEach((section) => this.#_trackSectionView(section as HTMLElement));
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
      .forEach((section) => this.#_trackSectionView(section as HTMLElement));
  }

  getVersion(): string {
    return this.#version;
  }
}
